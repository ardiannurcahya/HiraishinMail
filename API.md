# API Reference

All endpoints are served under `/api/`.

**Base URL:** `https://<WEB_HOST>/api/`

## Authentication

HiraishinMail uses anonymous session tokens. No login required.

1. `GET /api/session` → returns a `sessionId`
2. Pass `x-session-id` header on all subsequent requests
3. Inboxes are scoped to the session — Browser A cannot see Browser B's inboxes

---

## Endpoints

### `GET /api/config`

Returns public app configuration. No authentication required.

**Response** `200 OK`

```json
{
  "appName": "HiraishinMail",
  "mailDomain": "yourdomain.com",
  "mailDomains": ["yourdomain.com", "mail.yourdomain.com"],
  "webHost": "mail.yourdomain.com"
}
```

---

### `GET /api/session`

Creates or retrieves a browser session.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-session-id` | No | Existing session ID. Omit to create a new one. |

**Response** `200 OK`

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### `GET /api/inboxes`

Lists all inboxes linked to your session.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-session-id` | **Yes** | Session ID |

**Response** `200 OK`

```json
[
  {
    "address": "kopihujan23@yourdomain.com",
    "created_at": "2026-06-26 07:48:19"
  }
]
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `Missing x-session-id` |

---

### `POST /api/inboxes`

Creates a new inbox (or claims an existing one) and links it to your session.

**Rate limit:** 10 requests per minute per IP.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-session-id` | **Yes** | Session ID |
| `Content-Type` | **Yes** | `application/json` |

**Body**

| Field | Required | Description |
|-------|----------|-------------|
| `localPart` | No | Custom username (e.g. `"myname"`). Omit for random. |
| `domain` | No | Domain override from `mailDomains`. Defaults to first domain. |

**Examples**

```bash
# Custom address
curl -s -X POST https://mail.yourdomain.com/api/inboxes \
  -H "x-session-id: <session>" \
  -H "Content-Type: application/json" \
  -d '{"localPart": "myinbox"}'

# Random address
curl -s -X POST https://mail.yourdomain.com/api/inboxes \
  -H "x-session-id: <session>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Random on specific domain
curl -s -X POST https://mail.yourdomain.com/api/inboxes \
  -H "x-session-id: <session>" \
  -H "Content-Type: application/json" \
  -d '{"domain": "mail.yourdomain.com"}'
```

**Response**

| Status | Meaning |
|--------|---------|
| `201 Created` | New inbox created |
| `200 OK` | Existing inbox claimed (linked to session) |

```json
{
  "address": "kopihujan42@yourdomain.com",
  "created_at": "2026-06-26 07:48:19"
}
```

**Errors**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Missing x-session-id` | No session header |
| `400` | `Invalid domain: ...` | Domain not in `mailDomains` |
| `400` | `Invalid local part: ...` | Characters outside `[a-z0-9._-]` |
| `400` | `Local part too long` | Exceeds 64 characters |
| `429` | `Rate limit exceeded` | More than 10 requests/min |

---

### `DELETE /api/inboxes/:address`

**Permanently deletes** an inbox, all its messages, and all session links. This action is irreversible.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-session-id` | **Yes** | Session ID |

**Path Parameters**

| Param | Description |
|-------|-------------|
| `address` | Full email address, URI-encoded (e.g. `test123%40yourdomain.com`) |

**Response** `200 OK`

```json
{ "ok": true }
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `Missing x-session-id` |

---

### `GET /api/inboxes/:address/messages`

Fetches all messages for an inbox. The inbox must be linked to your session.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-session-id` | **Yes** | Session ID |

**Path Parameters**

| Param | Description |
|-------|-------------|
| `address` | Full email address, URI-encoded |

**Response** `200 OK`

```json
[
  {
    "id": "msg_1782461413912_0956a83c",
    "inbox_address": "test123@yourdomain.com",
    "from_address": "someone@gmail.com",
    "subject": "Hello",
    "body": "This is the email body",
    "received_at": "2026-06-26 08:10:14"
  }
]
```

**Errors**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `Missing x-session-id` | No session header |
| `403` | `Inbox not in this session` | Inbox exists but not linked to your session |

---

## Error Format

All errors follow this format:

```json
{
  "error": "Human-readable error message"
}
```

## Session Isolation

| Scenario | Behavior |
|----------|----------|
| New browser | Empty inbox list |
| After creating inbox A | Only inbox A appears |
| Open in incognito | Empty — different session |
| Refresh same browser | Inboxes persist via `localStorage` |

## Full Example

```bash
DOMAIN="mail.yourdomain.com"

# Get session
SESSION=$(curl -s https://$DOMAIN/api/session | jq -r '.sessionId')

# Create random inbox
INBOX=$(curl -s -X POST https://$DOMAIN/api/inboxes \
  -H "x-session-id: $SESSION" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.address')
echo "Created: $INBOX"

# Wait for email to arrive...

# Read messages
ENCODED=$(echo -n "$INBOX" | jq -sRr '@uri')
curl -s "https://$DOMAIN/api/inboxes/$ENCODED/messages" \
  -H "x-session-id: $SESSION" | jq '.'

# Delete inbox (permanent)
curl -s -X DELETE "https://$DOMAIN/api/inboxes/$ENCODED" \
  -H "x-session-id: $SESSION"
```
