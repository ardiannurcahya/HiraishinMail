<div align="center">

<img src="https://img.shields.io/badge/Cloudflare%20Workers-F48120?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License" />

# HiraishinMail

**Disposable email service on Cloudflare Workers. No VPS, no Docker, zero cost.**

Self-hosted temporary email that runs entirely on Cloudflare's edge network.
Receive emails instantly through a clean, Gmail-inspired web interface.

[Getting Started](#getting-started) · [API Reference](API.md) · [Report Bug](https://github.com/ardiannurcahya/HiraishinMail/issues) · [Request Feature](https://github.com/ardiannurcahya/HiraishinMail/issues)

---

<img src="https://img.shields.io/github/stars/ardiannurcahya/HiraishinMail?style=social" alt="Stars" />
<img src="https://img.shields.io/github/forks/ardiannurcahya/HiraishinMail?style=social" alt="Forks" />

</div>

---

## Features

- **Zero infrastructure** — runs on Cloudflare Workers, D1, and Email Routing
- **Instant delivery** — emails appear in your inbox at edge speed
- **Multiple domains** — configure one or more mail domains
- **Session-based privacy** — each browser session has isolated inboxes
- **Human-readable addresses** — generates Indonesian-style random addresses (e.g. `hiraishin42@hiraishin.dev`)
- **Gmail-inspired UI** — dark theme, star/read/select, responsive design
- **Rate limiting** — built-in protection against inbox spam creation
- **Free tier friendly** — fits within Cloudflare's free plan limits

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Router | Hono |
| Database | Cloudflare D1 (SQLite) |
| Email parsing | PostalMime |
| Static hosting | Cloudflare Workers Assets |
| Language | TypeScript |
| CLI | Wrangler v4 |

## Architecture

```
Sender → Cloudflare MX → Email Worker (email handler)
                                │
                                ▼
                        D1 Database (SQLite)
                                │
                                ▼
                 Worker HTTP handler → Web UI + API
```

---

## Getting Started

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- A domain name (can be purchased from [Rumah Web](https://rumahweb.com), [Namecheap](https://namecheap.com), [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/), etc.)
- [Node.js](https://nodejs.org/) v18 or later

---

## Step-by-Step Installation

### Step 1: Buy a Domain (if you don't have one)

You can buy a domain from any registrar. Below are examples for popular Indonesian registrars:

#### Option A: Rumah Web

1. Go to [rumahweb.com](https://rumahweb.com)
2. Search for your desired domain name
3. Complete the purchase
4. Note down your domain (e.g., `hiraishin.dev`)

#### Option B: Niagahoster

1. Go to [niagahoster.co.id](https://niagahoster.co.id)
2. Search and purchase your domain
3. Complete the purchase

#### Option C: Cloudflare Registrar

1. Go to [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
2. Search and purchase your domain
3. Domain is automatically added to your Cloudflare account

---

### Step 2: Add Domain to Cloudflare

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **"Add a site"** (top right)
3. Enter your domain name (e.g., `hiraishin.dev`)
4. Select **Free plan** (or higher if needed)
5. Click **"Continue"**

Cloudflare will show you **2 nameservers** like:
```
ns1.cloudflare.com
ns2.cloudflare.com
```

**Keep this page open** — you'll need these nameservers in the next step.

---

### Step 3: Update Nameservers at Your Registrar

You need to point your domain's nameservers to Cloudflare. This is required for Cloudflare to manage your DNS.

#### For Rumah Web

1. Log in to [Client Area Rumah Web](https://client.rumahweb.com)
2. Go to **Domains** → **My Domains**
3. Click on your domain name
4. Click **"Nameservers"** tab
5. Change nameservers to:
   ```
   Nameserver 1: ns1.cloudflare.com
   Nameserver 2: ns2.cloudflare.com
   ```
6. Click **"Change Nameservers"**
7. Wait 5-30 minutes for propagation

#### For Niagahoster

1. Log in to [Member Area Niagahoster](https://my.niagahoster.co.id)
2. Go to **Domain** → **Kelola Domain**
3. Click **"Nameserver"**
4. Change to Cloudflare nameservers:
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
5. Save and wait for propagation

#### For Namecheap

1. Log in to [Namecheap](https://www.namecheap.com)
2. Go to **Domain List** → **Manage**
3. Find **"NAMESERVERS"** section
4. Select **"Custom DNS"**
5. Enter:
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
6. Save (green checkmark)

#### For Other Registrars

Look for **"Nameserver"** or **"DNS Management"** settings and change to:
```
ns1.cloudflare.com
ns2.cloudflare.com
```

---

### Step 4: Verify Nameservers in Cloudflare

1. Go back to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click on your domain
3. Cloudflare will automatically check nameservers
4. You'll see **"Active"** status when ready (usually 5-30 minutes, can take up to 24 hours)

You can check propagation status at [whatsmydns.net](https://whatsmydns.net/#NS/yourdomain.com)

---

### Step 5: Enable Email Routing in Cloudflare

1. In Cloudflare Dashboard, select your domain
2. Go to **Email** → **Email Routing** (left sidebar)
3. Click **"Get started"**
4. Cloudflare will automatically add required DNS records:
   - **MX record**: `@ → route.mx.cloudflare.net` (priority: 69)
   - **TXT record**: `@ → v=spf1 include:_spf.mx.cloudflare.net ~all`
5. Click **"Add records and enable"**
6. Verify status shows **"Email Routing is enabled"**

**Important:** If you see a warning about existing MX records, you may need to delete old MX records first.

---

### Step 6: Clone and Configure the Project

```bash
# Clone the repository
git clone https://github.com/ardiannurcahya/HiraishinMail.git
cd HiraishinMail

# Install dependencies
npm install
```

---

### Step 7: Login to Cloudflare CLI

```bash
npx wrangler login
```

This will open your browser. Log in with your Cloudflare account and authorize Wrangler.

---

### Step 8: Create D1 Database

```bash
npx wrangler d1 create hiraishinmail-db
```

You'll see output like:
```
✅ Successfully created DB 'hiraishinmail-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id`** — you'll need it next.

---

### Step 9: Update wrangler.toml

Open `wrangler.toml` and update these values:

```toml
name = "hiraishinmail"
main = "src/index.ts"
compatibility_date = "2025-06-01"

# Set workers_dev to false when using your own domain
workers_dev = false

# ---- D1 Database ----
[[d1_databases]]
binding = "DB"
database_name = "hiraishinmail-db"
database_id = "PASTE_YOUR_DATABASE_ID_HERE"   # ← paste from Step 8

# ---- Email Worker ----
[email]
action = "process"

# ---- Custom domain routes ----
[[routes]]
pattern = "mail.yourdomain.com"               # ← your Worker subdomain
custom_domain = true

# ---- Environment variables ----
[vars]
APP_NAME = "HiraishinMail"
MAIL_DOMAIN = "yourdomain.com"                # ← your mail domain
WEB_HOST = "mail.yourdomain.com"              # ← your Worker subdomain

# ---- Static assets (web frontend) ----
[assets]
directory = "./src/web"

# ---- Observability ----
[observability]
enabled = true
```

**Replace:**
- `PASTE_YOUR_DATABASE_ID_HERE` → your actual database ID from Step 8
- `yourdomain.com` → your actual domain (e.g., `hiraishin.dev`)
- `mail.yourdomain.com` → your desired subdomain for the web UI

---

### Step 10: Deploy the Worker

```bash
# Apply database schema
npm run db:migrate

# Deploy to Cloudflare
npm run deploy
```

You'll see output like:
```
Uploaded hiraishinmail (X.XX sec)
Published hiraishinmail (X.XX sec)
  https://mail.yourdomain.com
```

---

### Step 11: Create DNS Record for Web UI

Cloudflare Workers with `custom_domain = true` automatically creates the DNS record. But if it doesn't:

1. Go to Cloudflare Dashboard → **DNS** → **Records**
2. Click **"Add record"**
3. Add:
   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | AAAA | `mail` | `100::` | Proxied |
4. Click **"Save"**

The `100::` address is a dummy — Cloudflare routes traffic to your Worker automatically.

---

### Step 12: Verify Email Routing

Check that Email Routing is working:

```bash
npx wrangler email routing settings yourdomain.com
```

Expected output:
```
Email routing is enabled for yourdomain.com
```

If not enabled, go to Cloudflare Dashboard → **Email** → **Email Routing** and enable it manually.

---

### Step 13: Test the Service

1. Open your browser and go to `https://mail.yourdomain.com`
2. Click **"New Inbox"** → **"Random"**
3. You'll get an email address like `hiraishin42@yourdomain.com`
4. Send an email to that address from Gmail/any email provider
5. Click **"Refresh"** in the web UI
6. The email should appear instantly!

---

## DNS Records Summary

After setup, your DNS records should look like this:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| MX | `@` | `route.mx.cloudflare.net` | DNS only | Auto |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS only | Auto |
| AAAA | `mail` | `100::` | Proxied | Auto |

**Note:** MX and TXT records should NOT be proxied (orange cloud off). Only the web UI record (AAAA) should be proxied.

---

## Troubleshooting

### Nameservers not propagating

- Wait at least 30 minutes (can take up to 24 hours)
- Check at [whatsmydns.net](https://whatsmydns.net/#NS/yourdomain.com)
- Make sure you saved nameserver changes at your registrar

### Email Routing not working

1. Go to Cloudflare Dashboard → **Email** → **Email Routing**
2. Check if status shows **"Enabled"**
3. Verify MX record exists: `@ → route.mx.cloudflare.net`
4. Try disabling and re-enabling Email Routing

### Emails not arriving

1. Check if the address exists in your inbox list
2. Verify `MAIL_DOMAIN` in `wrangler.toml` matches your actual domain
3. Check Worker logs: `npx wrangler tail`
4. Verify Email Routing is enabled (Step 12)

### "Worker not found" error

1. Make sure you ran `npm run deploy`
2. Check if `pattern` in `wrangler.toml` matches your actual subdomain
3. Wait 1-2 minutes after deployment

### Database errors

1. Verify `database_id` in `wrangler.toml` is correct
2. Run `npm run db:migrate` again
3. Check D1 database exists: `npx wrangler d1 list`

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run deploy` | Deploy Worker + static assets |
| `npm run db:migrate` | Apply schema to production D1 |
| `npm run db:migrate:local` | Apply schema to local D1 |
| `npx wrangler tail` | Stream live logs from production |
| `npx wrangler d1 execute hiraishinmail-db --remote --command="SELECT * FROM messages LIMIT 10"` | Query production database |

---

## Multiple Domains

To support multiple mail domains, set `MAIL_DOMAIN` as a comma-separated list:

```toml
[vars]
MAIL_DOMAIN = "domain1.com, domain2.com"
```

The first domain is used as the default. Users can select from all available domains when creating an inbox.

**Important:** You need to enable Email Routing for each domain in Cloudflare Dashboard.

---

## API Reference

HiraishinMail exposes a REST API under `/api/`. See [API.md](API.md) for full documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Public app configuration |
| `/api/session` | GET | Create or retrieve session |
| `/api/inboxes` | GET | List session inboxes |
| `/api/inboxes` | POST | Create new inbox |
| `/api/inboxes/:address` | DELETE | Delete inbox and all data |
| `/api/inboxes/:address/messages` | GET | Fetch inbox messages |

---

## Project Structure

```
HiraishinMail/
├── wrangler.toml              # Worker config, D1 binding, routes, env vars
├── package.json
├── tsconfig.json
├── API.md                     # Full API reference
└── src/
    ├── index.ts               # Entry point: fetch() + email() handlers
    ├── email-handler.ts       # Inbound email processing (PostalMime → D1)
    ├── api/
    │   └── routes.ts          # Hono router: all /api/* endpoints
    ├── db/
    │   ├── schema.sql         # D1 table definitions
    │   └── queries.ts         # Typed query functions
    ├── utils/
    │   └── random-address.ts  # Human-like random email generator
    └── web/
        ├── index.html         # Frontend UI
        ├── app.js             # Frontend logic (vanilla JS)
        └── styles.css         # Dark theme styles
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
npm install
npx wrangler dev              # test locally
git commit -m "feat: add your feature"
git push origin feature/your-feature
# Open a pull request
```

---

## License

[MIT](LICENSE) — developed by [Ardian Nurcahya](https://github.com/ardiannurcahya)
