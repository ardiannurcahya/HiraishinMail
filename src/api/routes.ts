import { Hono, type Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getInbox,
  createInbox,
  inboxExists,
  getSessionInboxes,
  getMessages,
  ensureSession,
  linkInboxToSession,
  isInboxInSession,
} from '../db/queries';
import { generateUniqueAddress } from '../utils/random-address';

export interface ApiEnv {
  DB: D1Database;
  APP_NAME: string;
  MAIL_DOMAIN: string;
  WEB_HOST: string;
}

type HonoContext = Context<{ Bindings: ApiEnv }>;

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAX_LOCAL_PART_LENGTH = 64;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 30_000);

function getDomains(env: ApiEnv): string[] {
  return env.MAIL_DOMAIN.split(',').map(d => d.trim()).filter(Boolean);
}

function defaultDomain(env: ApiEnv): string {
  return getDomains(env)[0] || 'example.com';
}

function sessionId(c: HonoContext): string | null {
  return (c.req.header('x-session-id') ?? '').trim() || null;
}

const api = new Hono<{ Bindings: ApiEnv }>();

// ---- GET /api/config ----
api.get('/config', (c) => {
  const domains = getDomains(c.env);
  return c.json({
    appName: c.env.APP_NAME || 'HiraishinMail',
    mailDomain: domains[0] || 'example.com',
    mailDomains: domains,
    webHost: c.env.WEB_HOST || 'hiraishinmail.example.com',
  });
});

// ---- GET /api/session ----
api.get('/session', async (c) => {
  let sid = sessionId(c);
  if (!sid) {
    sid = crypto.randomUUID();
  }
  await ensureSession(c.env.DB, sid);
  return c.json({ sessionId: sid });
});

// ---- GET /api/inboxes ----
api.get('/inboxes', async (c) => {
  const sid = sessionId(c);
  if (!sid) return c.json({ error: 'Missing x-session-id' }, 400);

  const inboxes = await getSessionInboxes(c.env.DB, sid);
  return c.json(inboxes);
});

// ---- POST /api/inboxes ----
api.post('/inboxes', async (c) => {
  const sid = sessionId(c);
  if (!sid) return c.json({ error: 'Missing x-session-id' }, 400);

  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
  }

  // Reject malformed JSON instead of silently treating it as an empty body
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const domains = getDomains(c.env);
  const requestedDomain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';

  // Validate domain before computing the effective domain (reject unknown domains)
  if (requestedDomain && !domains.includes(requestedDomain)) {
    return c.json({ error: `Invalid domain: ${requestedDomain}. Allowed: ${domains.join(', ')}` }, 400);
  }

  const domain = requestedDomain || defaultDomain(c.env);

  const requested: string = typeof body.localPart === 'string' ? body.localPart.trim().toLowerCase() : '';

  let address: string;
  if (requested) {
    if (requested.length > MAX_LOCAL_PART_LENGTH) {
      return c.json({ error: `Local part too long (max ${MAX_LOCAL_PART_LENGTH} chars)` }, 400);
    }
    if (!LOCAL_PART_RE.test(requested)) {
      return c.json({ error: `Invalid local part: "${requested}". Use lowercase letters, numbers, dots, hyphens, underscores.` }, 400);
    }
    address = `${requested}@${domain}`;
  } else {
    address = await generateUniqueAddress(
      (addr) => inboxExists(c.env.DB, addr),
      domain
    );
  }

  // Create the inbox row (INSERT OR IGNORE) — true if it was newly created
  const created = await createInbox(c.env.DB, address);

  // Link to session
  await linkInboxToSession(c.env.DB, sid, address);

  const inbox = await getInbox(c.env.DB, address);
  if (!inbox) {
    // Write succeeded but read-back failed — report server error, don't lie about the resource
    return c.json({ error: 'Failed to create inbox' }, 500);
  }

  return c.json(inbox, created ? 201 : 200);
});

// ---- DELETE /api/inboxes/:address ----
api.delete('/inboxes/:address', async (c) => {
  const sid = sessionId(c);
  if (!sid) return c.json({ error: 'Missing x-session-id' }, 400);

  let address: string;
  try {
    address = decodeURIComponent(c.req.param('address'));
  } catch {
    return c.json({ error: 'Invalid address encoding' }, 400);
  }

  // Delete all data: remove session links first (FK safety),
  // then messages, then the inbox row itself.
  await c.env.DB.prepare('DELETE FROM session_inboxes WHERE inbox_address = ?').bind(address).run();
  await c.env.DB.prepare('DELETE FROM messages WHERE inbox_address = ?').bind(address).run();
  await c.env.DB.prepare('DELETE FROM inboxes WHERE address = ?').bind(address).run();

  return c.json({ ok: true });
});

// ---- GET /api/inboxes/:address/messages ----
api.get('/inboxes/:address/messages', async (c) => {
  const sid = sessionId(c);
  if (!sid) return c.json({ error: 'Missing x-session-id' }, 400);

  let address: string;
  try {
    address = decodeURIComponent(c.req.param('address'));
  } catch {
    return c.json({ error: 'Invalid address encoding' }, 400);
  }

  // Must have inbox in session to read messages
  if (!(await isInboxInSession(c.env.DB, sid, address))) {
    return c.json({ error: 'Inbox not in this session' }, 403);
  }

  const messages = await getMessages(c.env.DB, address);
  return c.json(messages);
});

api.onError((err, c) => {
  console.error('API error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

api.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default api;
