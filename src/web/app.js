/* ============================================================
   HiraishinMail - Gmail-inspired dark frontend
   API contract unchanged: /api/config, /api/session,
   /api/inboxes, /api/inboxes/:address/messages, x-session-id
   ============================================================ */
'use strict';

const SESSION_KEY = 'hiraishinmail_session_id';

// ---- DOM references -------------------------------------------------------
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');
const currentInboxLabel = document.getElementById('currentInboxLabel');
const composeBtn = document.getElementById('composeBtn');
const composeDialog = document.getElementById('composeDialog');
const closeComposeBtn = document.getElementById('closeComposeBtn');
const localPartInput = document.getElementById('localPartInput');
const domainSelect = document.getElementById('domainSelect');
const createRandomBtn = document.getElementById('createRandomBtn');
const createCustomBtn = document.getElementById('createCustomBtn');
const inboxSelect = document.getElementById('inboxSelect');
const copyBtn = document.getElementById('copyBtn');
const deleteBtn = document.getElementById('deleteBtn');
const selectAll = document.getElementById('selectAll');
const refreshBtn = document.getElementById('refreshBtn');
const messageCount = document.getElementById('messageCount');
const messageList = document.getElementById('messageList');
const toastContainer = document.getElementById('toastContainer');

// ---- State -----------------------------------------------------------------
let appConfig = {
  appName: 'HiraishinMail',
  mailDomain: 'example.com',
  webHost: 'hiraishinmail.example.com'
};

let sessionId = localStorage.getItem(SESSION_KEY) || '';
let messages = [];
let expandedId = null;
const readIds = new Set();
const starredIds = new Set();
const selectedIds = new Set();

// ---- Utilities --------------------------------------------------------------
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function attrEscape(value) {
  return String(value ?? '').replace(/"/g, '&quot;');
}

// Gmail-style date: today -> time, this year -> "Jun 26", older -> "Jun 26, 2025"
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

function makeSnippet(body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 118)}...` : text;
}

function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.setAttribute('role', 'status');
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('fadeout');
    setTimeout(() => el.remove(), 200);
  }, 2000);
}

async function copyText(text) {
  // Clipboard API first, fallback for insecure contexts
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---- API layer (contract unchanged) -----------------------------------------
async function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadConfig() {
  appConfig = await fetchJson('/api/config', { headers: {} });
  document.title = appConfig.appName;
  localPartInput.placeholder =
    `custom name or leave empty for random @${appConfig.mailDomain}`;

  // Populate domain selector
  const domains = appConfig.mailDomains || [appConfig.mailDomain];
  domainSelect.innerHTML = '';
  domains.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `@${d}`;
    domainSelect.appendChild(opt);
  });
  if (domains.length <= 1) domainSelect.style.display = 'none';
}

async function ensureSession() {
  const payload = await fetchJson('/api/session');
  sessionId = payload.sessionId;
  localStorage.setItem(SESSION_KEY, sessionId);
}

async function loadInboxes(selectedAddress) {
  const inboxes = await fetchJson('/api/inboxes');
  inboxSelect.innerHTML = '';

  if (!inboxes.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No inboxes yet';
    inboxSelect.appendChild(opt);
    currentInboxLabel.textContent = 'No inbox';
    messageCount.textContent = '0 messages';
    selectAll.disabled = true;
    selectAll.checked = false;
    expandedId = null;
    renderEmpty(
      'inbox',
      'No inboxes yet',
      'Click <b>New Inbox</b> to create a disposable email address.'
    );
    return;
  }

  inboxes.forEach((inbox) => {
    const opt = document.createElement('option');
    opt.value = inbox.address;
    opt.textContent = inbox.address;
    inboxSelect.appendChild(opt);
  });

  inboxSelect.value = selectedAddress && inboxes.some((x) => x.address === selectedAddress)
    ? selectedAddress
    : inboxes[0].address;

  await loadMessages();
}

async function loadMessages() {
  const address = inboxSelect.value;
  if (!address) return;

  currentInboxLabel.textContent = address;
  messageCount.textContent = 'Loading...';
  expandedId = null;
  messageList.innerHTML =
    '<div class="empty-state"><div class="spinner" aria-hidden="true"></div>' +
    '<div class="empty-sub">Loading messages...</div></div>';

  try {
    messages = await fetchJson(`/api/inboxes/${encodeURIComponent(address)}/messages`);
    messageCount.textContent = messages.length === 1
      ? '1 message'
      : `${messages.length} messages`;
    selectAll.disabled = messages.length === 0;
    updateSelectAll();
    renderMessages();
  } catch (err) {
    console.error(err);
    messages = [];
    messageCount.textContent = '0 messages';
    selectAll.disabled = true;
    renderError(err);
    showToast(`Failed to load messages: ${err.message}`);
  }
}

// ---- Rendering ---------------------------------------------------------------
function renderEmpty(icon, title, subHtml) {
  messageList.innerHTML =
    `<div class="empty-state">` +
    `<span class="material-icons-outlined empty-icon">${escapeHtml(icon)}</span>` +
    `<div class="empty-title">${escapeHtml(title)}</div>` +
    `<div class="empty-sub">${subHtml}</div></div>`;
}

function renderError(err) {
  renderEmpty('error', 'Connection error', escapeHtml(err.message));
}

function renderMessages() {
  if (!messages.length) {
    renderEmpty(
      'mail',
      'No messages yet',
      'Emails sent to this address will appear here.'
    );
    return;
  }

  const rows = messages.map((msg, idx) => {
    const id = String(msg.id != null ? msg.id : `${inboxSelect.value}:${idx}`);
    const isUnread = !readIds.has(id);
    const isExpanded = expandedId === id;
    const isStarred = starredIds.has(id);
    const isSelected = selectedIds.has(id);
    const from = msg.from_address || '(unknown sender)';
    const subject = msg.subject || '(no subject)';
    const snippet = makeSnippet(msg.body);

    return `
      <div class="msg-row${isUnread ? ' unread' : ''}${isSelected ? ' selected' : ''}${isExpanded ? ' expanded' : ''}"
           data-id="${attrEscape(id)}">
        <input type="checkbox" class="msg-checkbox" data-id="${attrEscape(id)}"
               aria-label="Select message from ${attrEscape(from)}"${isSelected ? ' checked' : ''} />
        <span class="material-icons-outlined msg-star${isStarred ? ' starred' : ''}"
              title="${isStarred ? 'Unstar message' : 'Star message'}"
              aria-label="${isStarred ? 'Unstar message' : 'Star message'}"
              role="button" tabindex="0">${isStarred ? 'star' : 'star_border'}</span>
        <span class="msg-sender" title="${attrEscape(from)}">${escapeHtml(from)}</span>
        <span class="msg-subject" title="${attrEscape(subject)}">${escapeHtml(subject)}</span>
        ${snippet ? `<span class="msg-snippet">${escapeHtml(snippet)}</span>` : ''}
        <span class="msg-date">${escapeHtml(formatDate(msg.received_at))}</span>
        ${isExpanded ? `
        <div class="msg-detail">
          <div class="msg-detail-head">
            <span>From: <strong>${escapeHtml(from)}</strong></span>
            <span>${escapeHtml(new Date(msg.received_at).toLocaleString())}</span>
          </div>
          <div class="msg-detail-body">${escapeHtml(msg.body || '(no body)')}</div>
        </div>` : ''}
      </div>`;
  }).join('');

  messageList.innerHTML = rows;
}

function updateSelectAll() {
  const total = messages.length;
  const selected = selectedIds.size;
  selectAll.checked = total > 0 && selected === total;
  selectAll.indeterminate = selected > 0 && selected < total;
}

// ---- Event handlers -----------------------------------------------------------
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

composeBtn.addEventListener('click', () => {
  const isHidden = composeDialog.classList.contains('hidden');
  if (isHidden) {
    composeDialog.classList.remove('hidden');
    localPartInput.focus();
  } else {
    composeDialog.classList.add('hidden');
  }
});

closeComposeBtn.addEventListener('click', () => {
  composeDialog.classList.add('hidden');
});

localPartInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createCustomBtn.click();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    composeDialog.classList.add('hidden');
    sidebar.classList.remove('open');
    if (expandedId !== null && expandedId !== undefined) {
      expandedId = null;
      renderMessages();
    }
  }
});

copyBtn.addEventListener('click', async () => {
  if (!inboxSelect.value) return;
  const ok = await copyText(inboxSelect.value);
  showToast(ok ? 'Copied to clipboard' : 'Copy failed - select the address manually');
});

refreshBtn.addEventListener('click', () => {
  loadMessages().catch((err) => {
    console.error(err);
    showToast(`Refresh failed: ${err.message}`);
  });
});

inboxSelect.addEventListener('change', () => {
  selectedIds.clear();
  loadMessages().catch((err) => {
    console.error(err);
    showToast(`Failed to load messages: ${err.message}`);
  });
});

selectAll.addEventListener('change', () => {
  if (selectAll.checked) {
    messages.forEach((msg, idx) => {
      const id = String(msg.id != null ? msg.id : `${inboxSelect.value}:${idx}`);
      selectedIds.add(id);
    });
  } else {
    selectedIds.clear();
  }
  renderMessages();
});

deleteBtn.addEventListener('click', async () => {
  if (!inboxSelect.value) return;
  if (!confirm(`Delete inbox ${inboxSelect.value}?`)) return;
  const target = inboxSelect.value;
  try {
    await fetchJson(`/api/inboxes/${encodeURIComponent(target)}`, { method: 'DELETE' });
    selectedIds.clear();
    starredIds.clear();
    readIds.clear();
    showToast(`Inbox ${target} deleted`);
    await loadInboxes();
  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
});

createCustomBtn.addEventListener('click', async () => {
  const localPart = localPartInput.value.trim();
  const domain = domainSelect.value;
  try {
    const inbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify({ localPart, domain })
    });
    localPartInput.value = '';
    composeDialog.classList.add('hidden');
    selectedIds.clear();
    starredIds.clear();
    readIds.clear();
    showToast(`Inbox ${inbox.address} created`);
    await loadInboxes(inbox.address);
  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
});

createRandomBtn.addEventListener('click', async () => {
  const domain = domainSelect.value;
  try {
    const inbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify({ domain })
    });
    localPartInput.value = '';
    composeDialog.classList.add('hidden');
    selectedIds.clear();
    starredIds.clear();
    readIds.clear();
    showToast(`Inbox ${inbox.address} created`);
    await loadInboxes(inbox.address);
  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
});

// Click delegation on the message list:
// checkbox -> select, star -> toggle starred, row -> expand/collapse body
messageList.addEventListener('click', (e) => {
  const checkbox = e.target.closest('.msg-checkbox');
  if (checkbox) {
    const row = checkbox.closest('.msg-row');
    const id = row.dataset.id;
    if (checkbox.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    row.classList.toggle('selected', checkbox.checked);
    updateSelectAll();
    return;
  }

  const star = e.target.closest('.msg-star');
  if (star) {
    const row = star.closest('.msg-row');
    const id = row.dataset.id;
    if (starredIds.has(id)) starredIds.delete(id);
    else starredIds.add(id);
    renderMessages();
    return;
  }

  const row = e.target.closest('.msg-row');
  if (!row) return;
  const id = row.dataset.id;
  expandedId = expandedId === id ? null : id;
  readIds.add(id);
  renderMessages();
  const updated = messageList.querySelector(`.msg-row[data-id="${id}"]`);
  if (updated) {
    updated.scrollIntoView({ block: 'nearest' });
    updateSelectAll();
  }
});

// Keyboard support for starring via the row's star control
messageList.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('msg-star')) {
    e.preventDefault();
    e.target.click();
  }
});

// ---- Init ----------------------------------------------------------------------
const hadSession = Boolean(localStorage.getItem(SESSION_KEY));

Promise.all([loadConfig(), ensureSession()])
  .then(() => {
    if (!hadSession) showToast('Session ready');
    return loadInboxes();
  })
  .catch((err) => {
    console.error(err);
    renderError(err);
    currentInboxLabel.textContent = 'Connection error';
    showToast(err.message);
  });
