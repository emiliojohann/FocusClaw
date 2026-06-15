# Agent Automation API

FocusClaw includes a local Agent Automation API so trusted agents and scripts can work with the same projects and tasks as the web app without controlling the browser UI.

Use this API for agent workflows such as task capture, daily planning, progress updates, and handoffs between humans and agents. Agents should prefer this API over browser automation because the API is a stable structured interface.

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

Authentication is optional for local development.

If the API server is started without `API_KEY`, auth is disabled and agents do not need to send an API key.

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
GET    /api/projects/workspace/:workspaceId
GET    /api/tasks/project/:projectId
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
POST   /api/tasks/:id/complete
GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments
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

Complete a task:

```bash
curl -X POST "$FOCUSCLAW_API/tasks/TASK_ID/complete"
```

## Agent Guidance

Agents should:

- Use project and task titles first; ask for IDs only when necessary.
- Keep owner labels such as `user`, `agent`, and `unassigned` as coordination labels only.
- Treat the API as local and user-owned.
- Detect auth instead of asking the user to debug it first.
- Report missing credentials clearly when the API is protected and no key is configured.

Owner labels do not grant permissions, start background execution, or authorize autonomous workflows by themselves.
