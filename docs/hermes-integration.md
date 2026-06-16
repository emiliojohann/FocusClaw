# Hermes Integration

FocusClaw can be used by Hermes through the local REST API. Hermes does not need the OpenClaw plugin to work with FocusClaw, and should prefer API calls over browser automation.

Use this document as the Hermes-specific bridge. For endpoint details, request/response shape, and curl examples, see [Agent Automation API](./agent-automation-api.md).

## What Hermes Should Use

- API base: `http://127.0.0.1:3001/api`
- Health check: `http://127.0.0.1:3001/health`
- Optional auth header: `x-api-key: <FOCUSCLAW_API_KEY>`
- Source of truth: the user's local FocusClaw SQLite database through the API

If Hermes runs on a different machine, use the private network URL configured for that FocusClaw host instead of localhost. Do not expose FocusClaw publicly.

## Suggested Hermes Skill Setup

Create or point Hermes to a FocusClaw skill directory, for example:

```text
~/.hermes/skills/focusclaw/SKILL.md
```

The skill should tell Hermes:

```text
Use FocusClaw as the task and project source of truth. Prefer the FocusClaw REST API over browser automation. Use project and task titles first, ask for IDs only when multiple matches are ambiguous, and confirm destructive deletes before calling delete endpoints.
```

Hermes should also know these environment variables:

```bash
export FOCUSCLAW_API="http://127.0.0.1:3001/api"
export FOCUSCLAW_API_KEY=""
```

When auth is enabled, Hermes should send:

```text
x-api-key: <FOCUSCLAW_API_KEY>
```

## Recommended Flow

1. Check `GET http://127.0.0.1:3001/health`.
2. Try read-only status first when the user asks what is open, due today, overdue, or due this week.
3. For edits, find the task by title/project before asking the user for an ID.
4. Use API calls for create, update, complete, comment, subtask, and tag operations.
5. Confirm destructive deletes with the user before calling delete endpoints.
6. If the API returns `401`, retry with `FOCUSCLAW_API_KEY` from runtime configuration.
7. If the API is unavailable, report that FocusClaw is not reachable instead of falling back to brittle browser automation.

## Common Workflows

### List tasks for a project

```bash
curl "$FOCUSCLAW_API/tasks/project/PROJECT_ID"
```

### Create a task

```bash
curl -X POST "$FOCUSCLAW_API/tasks" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_ID","title":"Draft launch notes","assignee":"agent"}'
```

### Update a task

```bash
curl -X PATCH "$FOCUSCLAW_API/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"priority":1,"assignee":"user"}'
```

### Complete a task

```bash
curl -X POST "$FOCUSCLAW_API/tasks/TASK_ID/complete"
```

## Safety Rules

- Treat FocusClaw data as private local user data.
- Owner labels such as `user`, `agent`, and `unassigned` are coordination labels only.
- Owner labels do not grant permissions, schedule work, or authorize autonomous execution.
- Confirm deletes before using delete endpoints.
- Do not hardcode real API keys in prompts, docs, source files, or public examples.
- Do not restart FocusClaw services unless the user asks.

## Relationship To OpenClaw

OpenClaw can use the FocusClaw plugin tools when they are installed. Hermes should not assume those OpenClaw tool names exist.

For Hermes, the portable interface is the REST API documented in [Agent Automation API](./agent-automation-api.md).
