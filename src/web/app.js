/* ============================================================
   HiraishinMail - Gmail-inspired dark frontend
   API contract unchanged: /api/config, /api/session,
   /api/inboxes, /api/inboxes/:address/messages, x-session-id
   ============================================================ */
'use strict';

const SESSION_KEY = 'hiraishinmail_session_id';
const STATE_KEY_PREFIX = 'hiraishinmail_state_';

// ---- DOM references -------------------------------------------------------
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
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
  mailDomain: 'example.com'
};

let sessionId = localStorage.getItem(SESSION_KEY) || '';
let messages = [];
let expandedId = null;
// `let` because loadInboxState() swaps them out wholesale
let starredIds = new Set();
let readIds = new Set();
const selectedIds = new Set();
let lastFocusedElement = null; // compose dialog focus restore

// ---- Utilities --------------------------------------------------------------
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function attrEscape(value) {
  // Escape & FIRST so later entities are not double-escaped
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

// ---- Inbox state persistence (starred / read survive refreshes) -------------
function getStateKey(inbox) {
  return `${STATE_KEY_PREFIX}${inbox}`;
}

function loadInboxState(inbox) {
  try {
    const saved = JSON.parse(localStorage.getItem(getStateKey(inbox)) || '{}');
    starredIds = new Set(saved.starred || []);
    readIds = new Set(saved.read || []);
  } catch {
    starredIds = new Set();
    readIds = new Set();
  }
}

function saveInboxState(inbox) {
  try {
    localStorage.setItem(getStateKey(inbox), JSON.stringify({
      starred: [...starredIds],
      read: [...readIds]
    }));
  } catch {
    // Storage unavailable (private mode / quota) - state stays in memory only
  }
}

// ---- In-app confirmation dialog (replaces native confirm()) ------------------
function confirmAction(message, confirmLabel = 'Confirm') {
  const dialogEl = document.createElement('dialog');
  dialogEl.className = 'confirm-dialog';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'confirm-title';
  titleDiv.textContent = 'Please confirm';

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'confirm-body';
  bodyDiv.textContent = message;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'compose-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn btn-danger';
  okBtn.textContent = confirmLabel;

  actionsDiv.append(cancelBtn, okBtn);
  dialogEl.append(titleDiv, bodyDiv, actionsDiv);
  document.body.appendChild(dialogEl);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialogEl.close();
      dialogEl.remove();
      resolve(value);
    };
    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    dialogEl.addEventListener('cancel', () => finish(false)); // Escape key
    cancelBtn.focus();
    dialogEl.showModal();
  });
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

  if (!res.ok) {
    let msg = 'Request failed';
    // Read the body ONCE so a non-JSON error body cannot leave the stream consumed
    const text = await res.text().catch(() => '');
    try {
      const payload = JSON.parse(text);
      msg = payload.error || msg;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }
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
    loadInboxState(address);
    messageCount.textContent = messages.length === 1
      ? '1 message'
      : `${messages.length} messages`;
    selectAll.disabled = messages.length === 0;
    updateSelectAll();
    renderMessages();
  } catch (err) {
    // Show the error state once - a toast here would only duplicate it (L15)
    console.error(err);
    messages = [];
    messageCount.textContent = '0 messages';
    selectAll.disabled = true;
    renderError(err);
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

function renderRowDetail(msg) {
  const from = msg.from_address || '(unknown sender)';
  return `
        <div class="msg-detail">
          <div class="msg-detail-head">
            <span>From: <strong>${escapeHtml(from)}</strong></span>
            <span>${escapeHtml(new Date(msg.received_at).toLocaleString())}</span>
          </div>
          <div class="msg-detail-body">${escapeHtml(msg.body || '(no body)')}</div>
        </div>`;
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
           data-id="${attrEscape(id)}"
           role="button" tabindex="0"
           aria-expanded="${isExpanded ? 'true' : 'false'}"
           aria-label="Toggle details for message from ${attrEscape(from)}">
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
        ${isExpanded ? renderRowDetail(msg) : ''}
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

// ---- Incremental row updates (M11: avoid full re-renders) ---------------------
function messageFromId(id) {
  return messages.find((msg, idx) => {
    const mid = String(msg.id != null ? msg.id : `${inboxSelect.value}:${idx}`);
    return mid === id;
  });
}

function toggleStar(star) {
  const row = star.closest('.msg-row');
  if (!row) return;
  const id = row.dataset.id;
  const nowStarred = !starredIds.has(id);
  if (nowStarred) starredIds.add(id);
  else starredIds.delete(id);

  star.classList.toggle('starred', nowStarred);
  star.textContent = nowStarred ? 'star' : 'star_border';
  const label = nowStarred ? 'Unstar message' : 'Star message';
  star.title = label;
  star.setAttribute('aria-label', label);
  saveInboxState(inboxSelect.value);
}

function collapseExpandedRow() {
  const row = messageList.querySelector('.msg-row.expanded');
  if (row) {
    row.classList.remove('expanded');
    row.setAttribute('aria-expanded', 'false');
    const detail = row.querySelector('.msg-detail');
    if (detail) detail.remove();
  }
  expandedId = null;
}

function toggleRowExpand(row) {
  const id = row.dataset.id;
  if (expandedId === id) {
    collapseExpandedRow();
    return;
  }

  // Collapse the previously expanded row (detail section only, no re-render)
  const current = messageList.querySelector('.msg-row.expanded');
  if (current) {
    current.classList.remove('expanded');
    current.setAttribute('aria-expanded', 'false');
    const detail = current.querySelector('.msg-detail');
    if (detail) detail.remove();
  }

  expandedId = id;
  readIds.add(id);
  row.classList.remove('unread');
  row.classList.add('expanded');
  row.setAttribute('aria-expanded', 'true');
  saveInboxState(inboxSelect.value);

  const msg = messageFromId(id);
  if (msg && !row.querySelector('.msg-detail')) {
    row.insertAdjacentHTML('beforeend', renderRowDetail(msg));
  }
  row.scrollIntoView({ block: 'nearest' });
}

// ---- Event handlers -----------------------------------------------------------
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// ---- Compose dialog: open/close with focus management (M10) --------------------
function openComposeDialog() {
  lastFocusedElement = document.activeElement;
  composeDialog.classList.remove('hidden');
  localPartInput.focus();
}

function closeComposeDialog() {
  composeDialog.classList.add('hidden');
  if (lastFocusedElement && lastFocusedElement.isConnected &&
      !composeDialog.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

composeBtn.addEventListener('click', () => {
  if (composeDialog.classList.contains('hidden')) {
    openComposeDialog();
  } else {
    closeComposeDialog();
  }
});

closeComposeBtn.addEventListener('click', closeComposeDialog);

localPartInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createCustomBtn.click();
});

// Focus trap: Tab stays inside the dialog, Escape closes it (M10)
composeDialog.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeComposeDialog();
    e.stopPropagation();
    return;
  }
  if (e.key !== 'Tab') return;

  const focusables = composeDialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    '[tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeComposeDialog();
    sidebar.classList.remove('open');
    collapseExpandedRow();
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
  // Toggle the class in place instead of re-rendering the whole list
  messageList.querySelectorAll('.msg-row').forEach((row) => {
    row.classList.toggle('selected', selectedIds.has(row.dataset.id));
  });
});

deleteBtn.addEventListener('click', async () => {
  if (!inboxSelect.value) return;
  const target = inboxSelect.value;
  const ok = await confirmAction(
    `Delete inbox ${target}? This action cannot be undone.`,
    'Delete'
  );
  if (!ok) return;
  try {
    await fetchJson(`/api/inboxes/${encodeURIComponent(target)}`, { method: 'DELETE' });
    selectedIds.clear();
    starredIds.clear();
    readIds.clear();
    localStorage.removeItem(getStateKey(target));
    showToast(`Inbox ${target} deleted`);
    await loadInboxes();
  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
});

// Shared create handler: empty localPart -> random address (L11)
async function createInboxHandler(localPart = '') {
  const domain = domainSelect.value;
  const body = { domain };
  if (localPart) body.localPart = localPart;

  try {
    const inbox = await fetchJson('/api/inboxes', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    localPartInput.value = '';
    selectedIds.clear();
    starredIds.clear();
    readIds.clear();
    closeComposeDialog();
    showToast(`Inbox ${inbox.address} created`);
    await loadInboxes(inbox.address);
  } catch (err) {
    console.error(err);
    showToast(err.message);
  }
}

createCustomBtn.addEventListener('click', () => {
  createInboxHandler(localPartInput.value.trim());
});

createRandomBtn.addEventListener('click', () => {
  createInboxHandler();
});

// Click delegation on the message list:
// checkbox -> select, star -> toggle star, row -> expand/collapse body
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
    toggleStar(star);
    return;
  }

  const row = e.target.closest('.msg-row');
  if (!row) return;
  toggleRowExpand(row);
});

// Keyboard support: Enter/Space on the star toggles it, on the row expands it (M10)
messageList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.classList.contains('msg-star')) {
    e.preventDefault();
    toggleStar(e.target);
    return;
  }
  if (e.target.classList.contains('msg-row')) {
    e.preventDefault();
    toggleRowExpand(e.target);
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
    // Error state only - the toast would duplicate the message (L15)
    console.error(err);
    renderError(err);
    currentInboxLabel.textContent = 'Connection error';
  });
