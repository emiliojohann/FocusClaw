# FocusClaw

Agent-native task management for humans and AI agents.

FocusClaw is a local-first task app and REST API backed by SQLite. It gives humans a fast web interface while giving AI agents a structured task source of truth they can read, update, and coordinate through.

## Why FocusClaw Exists

Most task tools are built for humans first. Agents can sometimes use them, but usually through brittle UI scraping, ad hoc notes, or one-off integrations.

FocusClaw is built around a shared task model:

- Projects, tasks, subtasks, comments, tags, due dates, priorities, and owner labels
- A web app for normal human task management
- A REST API for OpenClaw, Hermes, scripts, and any HTTP-capable agent stack
- Local SQLite storage with snapshots and encrypted exports

Owner labels such as `user`, `agent`, and `unassigned` are coordination labels only. They do not trigger background execution, scheduled runs, permissions, or autonomous workflows.

## Status

FocusClaw is in early development. The self-hosted app is usable locally, and the private Tailscale access path works for devices inside the same tailnet. See [SPEC.md](./SPEC.md) for scope and roadmap.

## Stack

- Frontend: React 19, Vite, Tailwind CSS
- Backend: Fastify, SQLite, Drizzle ORM
- Storage: local SQLite database at `data/focusclaw.db`
- Agent access: local Agent Automation API, OpenClaw plugin first, other agent platforms via HTTP
- Deployment: local-first self-hosting, optional private Tailscale access

## Quick Start

Local development is the default path.

Requires Node.js `^20.19.0` or `>=22.12.0`.

```bash
git clone https://github.com/emiliojohann/FocusClaw.git
cd FocusClaw
npm install
./start.sh
```

The default local URLs are:

- Web app: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`
- API health check: `http://127.0.0.1:3001/health`

`./start.sh` creates the local `data/` directory and points the API at `data/focusclaw.db`.

FocusClaw includes a local Agent Automation API for trusted agents and scripts. It lets agents read projects, create tasks, update work, and mark tasks complete without controlling the browser UI. See [Agent Automation API](./docs/agent-automation-api.md) for the technical contract.

## Common Workflows

### Agent + Integration Usage

FocusClaw supports simple read-only plain-text status commands through any connected agent or messaging integration. Slash commands are not required for the MVP.

Use these plain-text triggers for quick status:

- `focusclaw help` - explain the available commands
- `focusclaw today` - open tasks due today
- `focusclaw overdue` - overdue open tasks
- `focusclaw week` - open tasks due this week
- `focusclaw project Launch Plan` - open tasks for one project

Status output is compact by default: tasks are grouped by project and show title plus due-date/status signal. Tags, descriptions, and task IDs stay hidden unless an agent/tool caller explicitly asks for detailed output.

Add, edit, delete, and complete actions stay as agent tool actions using natural language. Examples:

- `Add a task to Launch Plan: prepare screenshots, due Friday.`
- `Mark the onboarding checklist complete.`
- `Delete the task about drafting the first content batch.`

Agents should find tasks by title/project before asking users for task IDs.

### Projects And Tasks

Create projects, add tasks, set priority, choose due dates, assign owner labels, and mark work complete from the web app.

Agents can work with the same records through the local Agent Automation API. This keeps human task planning and agent execution context in one structured place.

### Universal Tags

Tags are workspace-wide labels that can be used across every project. Add tags while editing a task, or manage saved tags from **Settings -> Tag Management**. If the project filter is set to **All**, filtering by a tag shows matching tasks from all projects.

### Views, Filters, And Calendar

The task dashboard supports list/grid views, priority/due-date/created-date sorting, tag filters, owner filters, and due-date filters such as due today, due this week, past due, no date, and completed.

The calendar view shows tasks with due dates and can optionally include completed tasks. Default task and calendar view preferences can be changed from **Settings -> Default View Settings**.

### Comments And Subtasks

Open a task to edit details, add comments, and create subtasks. Comments keep discussion and handoff context attached to the task record so humans and agents can read the same history.

### CSV Export

Use **Settings -> Tasks Export** to download a CSV of all tasks across all projects, including completed tasks and project names.

### Backups

Use **Settings -> Local Snapshots & Encrypted Exports** to create local snapshots, schedule automatic daily snapshots, restore a snapshot, or download an encrypted backup file.

Local snapshots are stored at `~/.focusclaw/backups`. Encrypted exports require a passphrase of at least 6 characters. Restores and imports create a safety backup before replacing the current workspace data.

## Advanced: Private Tailscale Access

FocusClaw can run on one host machine and be accessed from another device in the same private Tailscale tailnet without exposing FocusClaw to the public internet.

The recommended shape is:

```text
Laptop browser
  -> Tailscale Serve HTTPS URL
  -> host machine localhost web app
  -> host machine localhost API
  -> host machine SQLite database
```

FocusClaw stays bound to localhost:

- Web app: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

Tailscale Serve publishes the web app privately on a dedicated HTTPS port:

```text
https://<HOST_TAILSCALE_DNS_NAME>:8443/
```

This keeps the root Tailscale hostname free for other apps while giving FocusClaw its own URL.

### Start With Tailscale

Install and sign in to Tailscale on the host machine and on each device that should access FocusClaw. Then run:

```bash
./start.sh --tailscale
```

By default, Tailscale mode:

- Keeps the API bound to `127.0.0.1:3001`
- Keeps the web app bound to `127.0.0.1:5173`
- Runs `tailscale serve --bg --yes --https 8443 5173`
- Prints the private FocusClaw URL

Example:

```text
https://your-host.your-tailnet.ts.net:8443/
```

The web app uses `/api`, so API calls stay on the same browser origin and are proxied back to the local API server.

### Custom Tailscale URL Or Port

To show a specific URL in startup output and Settings:

```bash
FOCUSCLAW_PUBLIC_URL=https://<HOST_TAILSCALE_DNS_NAME>:8443 ./start.sh --tailscale
```

To use a different Tailscale Serve HTTPS port:

```bash
TAILSCALE_SERVE_PORT=9443 ./start.sh --tailscale
```

Use a dedicated port per app if the same machine hosts multiple private tools.

### Security Notes

- Tailscale Serve is private to your tailnet.
- Tailscale Funnel is not required for FocusClaw private access.
- Do not enable public router port forwarding for FocusClaw.
- Do not bind FocusClaw to `0.0.0.0` unless you intentionally want local LAN exposure.
- Users must be in the same tailnet, or explicitly granted access through Tailscale, to open the Tailscale Serve URL.

### Settings Page URLs

The Settings page shows app access URLs for the FocusClaw instance you are currently viewing.

- **Local App URL** is usually `http://127.0.0.1:5173`.
- **Tailscale / Private App URL** is the Tailscale Serve URL, usually `https://<HOST_TAILSCALE_DNS_NAME>:8443/`.

If you are viewing a separate development clone on another device, Settings describes that clone, not the host machine's database.

## Manual Development

Most development should use `./start.sh`, but the apps can run manually.

```bash
npm install
npm run dev
```

Useful environment variables:

```bash
PORT=3001
API_HOST=127.0.0.1
API_KEY=dev-api-key
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=5173
VITE_API_PROXY_TARGET=http://127.0.0.1:3001
VITE_API_URL=/api
VITE_PRIVATE_APP_URL=https://<HOST_TAILSCALE_DNS_NAME>:8443
VITE_PRIVATE_API_URL=/api
CORS_ORIGINS=https://<HOST_TAILSCALE_DNS_NAME>:8443,http://localhost:5173,http://127.0.0.1:5173
```

If `CORS_ORIGINS` is unset, the API allows the local app origins and any configured `FOCUSCLAW_PUBLIC_URL` or `VITE_PRIVATE_APP_URL`. Set `CORS_ORIGINS` explicitly when a browser app calls the API from another origin.

## Troubleshooting

- **Port already in use:** change `PORT` for the API or `VITE_DEV_PORT` for the web app.
- **API unreachable:** confirm `./start.sh` is still running, then open `http://127.0.0.1:3001/health`.
- **401 errors:** if `API_KEY` is set on the API, agents and scripts must send the matching value as `x-api-key`. See [Agent Automation API](./docs/agent-automation-api.md).
- **Linux Rollup optional dependency errors:** remove `node_modules` and run `npm install` again so platform-specific optional packages are installed.
- **`npm ci` fails after dependency edits:** use `npm install` for local development, then commit the updated lockfile when changes are ready.
- **Logs:** `./start.sh` runs the API and web app in the foreground, so startup, CORS, auth, and Vite errors print in that terminal.

## Repository Layout

```text
apps/api       Fastify API server
apps/web       React web app
apps/landing   Landing page package
packages/plugin OpenClaw plugin package
data/          Local SQLite database directory
```

## License

MIT. See [LICENSE](./LICENSE).
