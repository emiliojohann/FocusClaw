# Agent Automation API

FocusClaw includes a local Agent Automation API so OpenClaw, Hermes, trusted agents, and scripts can work with the same projects and tasks as the web app without controlling the browser UI.

Use this API for agent workflows such as task capture, daily planning, progress updates, and handoffs between humans and agents. OpenClaw should prefer its plugin tools when available; Hermes and other integrations should prefer this API over browser automation because the API is a stable structured interface.

## Local API

Default local base URL:

```text
http://127.0.0.1:3001/api
```

Health check:

```text
GET http://127.0.0.1:3001/health
```

The API runs on the user's computer next to the FocusClaw web app and local SQLite database. It is not a hosted cloud API.

## Authentication

Authentication is optional for loopback-only local development.

If the API server is started without `API_KEY` and `API_HOST` is loopback (`127.0.0.1`, `localhost`, or `::1`), auth is disabled and agents do not need to send an API key.

If `API_HOST` is not loopback, `API_KEY` is required and the API refuses to start without it.

If the API server is started with `API_KEY`, agents must send the same value in the `x-api-key` header:

```text
x-api-key: <configured API_KEY value>
```

Agents should read the key from secure runtime configuration, such as `FOCUSCLAW_API_KEY`. Do not hardcode real keys in prompts, docs, source files, or public examples.

Recommended agent flow:

1. Check `GET /health`.
2. Try the needed API request without a key.
3. If the API returns `401 Invalid or missing API key`, read `FOCUSCLAW_API_KEY` from runtime config.
4. Retry with `x-api-key: <FOCUSCLAW_API_KEY>`.
5. If no key is configured, report that the API is protected and `FOCUSCLAW_API_KEY` is missing.

To rotate the key, change `API_KEY` where the FocusClaw API server is launched, restart the API server, and update each agent's `FOCUSCLAW_API_KEY`.

## Routes

The main route groups are:

```text
/api/workspaces
/api/projects
/api/tasks
/api/tags
/api/backups
```

Common agent operations:

```text
GET    /api/projects?workspaceId=WORKSPACE_ID
GET    /api/projects/workspace/:workspaceId
GET    /api/tasks
GET    /api/tasks?workspaceId=WORKSPACE_ID
GET    /api/tasks?projectId=PROJECT_ID
GET    /api/tasks/project/:projectId
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
GET    /api/tasks/statuses/:workspaceId
POST   /api/tasks/statuses/:workspaceId/in-progress
POST   /api/tasks/:id/complete
GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments
GET    /api/tasks/:id/attachments
POST   /api/tasks/:id/attachments
PATCH  /api/tasks/:id/attachments/:attachmentId
POST   /api/tasks/:id/attachments/:attachmentId/open
DELETE /api/tasks/:id/attachments/:attachmentId
GET    /api/tasks/:id/subtasks
POST   /api/tasks/:id/subtasks
GET    /api/tags/:projectId
```

## Examples

Set local variables for examples:

```bash
export FOCUSCLAW_API="http://127.0.0.1:3001/api"
export FOCUSCLAW_API_KEY=""
```

When auth is enabled, include the header:

```bash
-H "x-api-key: $FOCUSCLAW_API_KEY"
```

List project tasks:

```bash
curl "$FOCUSCLAW_API/tasks/project/PROJECT_ID"
```

List all workspace tasks as JSON:

```bash
curl "$FOCUSCLAW_API/tasks?workspaceId=WORKSPACE_ID"
```

List workspace projects:

```bash
curl "$FOCUSCLAW_API/projects?workspaceId=WORKSPACE_ID"
```

Create a task:

```bash
curl -X POST "$FOCUSCLAW_API/tasks" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_ID","title":"Draft launch notes","assignee":"agent"}'
```

Update a task:

```bash
curl -X PATCH "$FOCUSCLAW_API/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"priority":1,"assignee":"user"}'
```

Task lifecycle uses the existing status definition and completion behavior:

- To Do: patch `statusId` to `null` and `archived` to `false`.
- In Progress: call `POST /api/tasks/statuses/:workspaceId/in-progress`, then patch the returned `id` into `statusId` with `archived: false`. The resolver reuses an existing case-insensitive `In Progress` definition or creates one on first use.
- Done: call `POST /api/tasks/:id/complete`. Do not simulate completion by patching a status because this endpoint also creates the next recurring task when required.

Complete a task:

```bash
curl -X POST "$FOCUSCLAW_API/tasks/TASK_ID/complete"
```

Add attachment metadata:

```bash
curl -X POST "$FOCUSCLAW_API/tasks/TASK_ID/attachments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Draft carousel","kind":"pdf","uri":"/tmp/focusclaw-fixtures/carousel.pdf"}'
```

Rename attachment metadata without changing the stored path:

```bash
curl -X PATCH "$FOCUSCLAW_API/tasks/TASK_ID/attachments/ATTACHMENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed carousel"}'
```

Open an attachment on the machine running the FocusClaw API:

```bash
curl -X POST "$FOCUSCLAW_API/tasks/TASK_ID/attachments/ATTACHMENT_ID/open"
```

Attachments store local file or folder references only. FocusClaw does not upload, copy, host, or delete the original file. HTTP/HTTPS URL attachments are intentionally rejected. The local open endpoint checks that the path still exists and blocks executable/app-style attachments.

## Agent Guidance

Agents should:

- Use project and task titles first; ask for IDs only when necessary.
- Keep owner labels such as `user`, `agent`, and `unassigned` as coordination labels only.
- Treat the API as local and user-owned.
- Detect auth instead of asking the user to debug it first.
- Report missing credentials clearly when the API is protected and no key is configured.

Owner labels do not grant permissions, start background execution, or authorize autonomous workflows by themselves.
