# Northstar Inventory

A small inventory demo with a login page and API. For quick local use, a Node server serves both from this repository and records access events in `local/data/events.jsonl`. The page can also be hosted from `docs/` with GitHub Pages and the API deployed as a Cloudflare Worker with D1.

## Quick local server

Use Node.js 22 or newer. The repository's `.env` and `worker/.dev.vars` files contain matching demo credentials. If you cloned a fresh copy, create them from `.env.example` and `worker/.dev.vars.example` and set matching values for `API_KEY` and `INVENTORY_API_KEY` and for `DEMO_PASSWORD`.

```bash
node local/server.mjs
```

Open `http://127.0.0.1:8787`. To share this temporary demo over the Internet, install `cloudflared` and run `cloudflared tunnel --url http://127.0.0.1:8787` in another terminal. It prints a public URL, which remains available only while the tunnel and local server run.

The local server also exposes `GET /api/events?since=<ISO timestamp>` for event review using the separate admin token in `worker/.dev.vars`. Event data is stored only on this computer and excluded from Git.

## Worker and GitHub Pages setup

Use Node.js 22 or newer. Copy `.env.example` to `.env` and `worker/.dev.vars.example` to `worker/.dev.vars`. Give `API_KEY` and `INVENTORY_API_KEY` the same value, and give `DEMO_PASSWORD` the same value in both files. Set distinct random values for `ADMIN_TOKEN` and `AUDIT_SALT`. The Worker variables file is excluded from Git.

```bash
cd worker
npm install
npm run db:local
npm run dev
```

In another terminal, from the repository root:

```bash
python3 -m http.server 4173 -d docs
```

For local page testing, set `window.DEMO_API_URL` in `docs/config.js` to `http://localhost:8787`, then open `http://localhost:4173`. The login credentials come from `.env` and `worker/.dev.vars`.

## Deploy

Create a Cloudflare D1 database, replace the placeholder `database_id` in `worker/wrangler.jsonc`, apply the migration, and deploy the Worker:

```bash
cd worker
npx wrangler login
npx wrangler d1 create northstar-inventory-demo-events
npm run db:remote
npm run deploy -- --secrets-file .dev.vars
```

The database creation command prints the ID to put in `wrangler.jsonc`. Configure the page with the deployed Worker URL:

```bash
cd ..
node scripts/configure-api.mjs https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

On GitHub, set **Settings → Pages → Build and deployment** to **Deploy from a branch**, with `main` and `/docs`. The API and page must both be deployed for sign in to work.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `POST /api/login` | Demo sign in |
| `GET /api/private` | Sample inventory; requires `Authorization: Bearer <API_KEY>` |
| `GET /api/events?since=<ISO timestamp>` | Recent access events; requires the separate admin token |

The login is a one-request demo and does not create a lasting session. API events record timestamps, a salted address hash, country code, and a short user agent; they do not store submitted credentials or raw IP addresses.
