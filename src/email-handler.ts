import PostalMime from 'postal-mime';
import type { D1Database } from '@cloudflare/workers-types';
import { createInbox, insertMessage } from './db/queries';

export interface EmailHandlerEnv {
  DB: D1Database;
}

const MAX_BODY_LENGTH = 100_000; // 100KB
const MAX_ATTEMPTS = 2; // initial attempt + 1 retry on transient failures

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstAddress(raw: string): string {
  // Handle "Name <email>" or "email" or comma-separated
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s,]+)/);
  return match ? match[1].trim().toLowerCase() : raw.trim().toLowerCase();
}

function isTransientError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /(timeout|timed out|busy|overload|temporar|try again|502|503)/i.test(err.message)
  );
}

/**
 * Handles inbound email via Cloudflare Email Worker.
 * Called for every email received at any @<MAIL_DOMAIN> address.
 */
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: EmailHandlerEnv
): Promise<void> {
  const db = env.DB;
  const to = firstAddress(message.to);
  const from = firstAddress(message.from);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const parsed = await PostalMime.parse(message.raw);

      // Auto-create inbox (idempotent — INSERT OR IGNORE)
      await createInbox(db, to);

      // Build body with truncation; drop raw HTML fallback (strip tags instead)
      const rawBody = parsed.text?.trim() || (parsed.html ? stripTags(parsed.html) : '');
      const body = rawBody.slice(0, MAX_BODY_LENGTH);

      const subject = (parsed.subject || '(no subject)').slice(0, 998);

      await insertMessage(db, {
        inboxAddress: to,
        fromAddress: from,
        subject,
        body,
      });

      return;
    } catch (err) {
      console.error(`[email-handler] Attempt ${attempt}/${MAX_ATTEMPTS} failed for email to ${to}:`, err);
      if (attempt >= MAX_ATTEMPTS || !isTransientError(err)) {
        // Don't throw — avoid bounce loops. Log for observability.
        return;
      }
      // Brief backoff before the single retry
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}
