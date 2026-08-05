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
- **Human-readable addresses** — generates Indonesian-style random addresses (e.g. `kopihujan42@domain.com`)
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

## Getting Started

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- A domain added to Cloudflare (nameservers pointed to Cloudflare)
- [Node.js](https://nodejs.org/) v18+

### Installation

```bash
git clone https://github.com/ardiannurcahya/HiraishinMail.git
cd HiraishinMail
npm install
```

### Configuration

Login to Cloudflare:

```bash
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create hiraishinmail-db
```

Copy the `database_id` from the output, then update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "hiraishinmail-db"
database_id = "<your-database-id>"   # paste here

[[routes]]
pattern = "mail.yourdomain.com"      # your Worker subdomain
custom_domain = true

[vars]
APP_NAME = "HiraishinMail"
MAIL_DOMAIN = "yourdomain.com"       # your mail domain
WEB_HOST = "mail.yourdomain.com"     # your Worker subdomain
```

### Deploy

Push the database schema and deploy the Worker:

```bash
npm run db:migrate
npm run deploy
```

### DNS Setup

1. **Web UI** — Cloudflare auto-creates the DNS record for your custom domain
2. **Email Routing** — verify it's enabled:
   ```bash
   npx wrangler email routing settings yourdomain.com
   ```
3. **SPF** (recommended) — add a TXT record:
   | Type | Name | Content |
   |------|------|---------|
   | TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |

### Verify

1. Open `https://mail.yourdomain.com`
2. Click **New Inbox** → **Random**
3. Send an email to the generated address
4. Click **Refresh** — the email appears instantly

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run deploy` | Deploy Worker + static assets |
| `npm run db:migrate` | Apply schema to production D1 |
| `npm run db:migrate:local` | Apply schema to local D1 |
| `npx wrangler tail` | Stream live logs from production |
| `npx wrangler d1 execute hiraishinmail-db --remote --command="SELECT * FROM messages LIMIT 10"` | Query production database |

### Multiple Domains

To support multiple mail domains, set `MAIL_DOMAIN` as a comma-separated list:

```toml
[vars]
MAIL_DOMAIN = "domain1.com, domain2.com"
```

The first domain is used as the default. Users can select from all available domains when creating an inbox.

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

## License

[MIT](LICENSE) — developed by [Ardian Nurcahya](https://github.com/ardiannurcahya)
