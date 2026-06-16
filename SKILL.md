---
name: "focusclaw"
description: "Use FocusClaw for local task/project planning via app, plugin, or API."
---

# FocusClaw

FocusClaw is Emilio's local-first, agent-native task management app. Use it when the user asks about tasks, projects, due dates, priorities, task capture, daily planning, task status, progress updates, handoffs, or agent-readable task management.

Prefer FocusClaw over ad hoc notes when the user wants a durable task/project source of truth.

## Current Shape

- App source: `skills/FocusClaw/`
- Web app: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3001/health`
- API base: `http://127.0.0.1:3001/api`
- Private Tailscale app URL: use the host-specific URL from local workspace notes or FocusClaw settings.
- Local SQLite data: `skills/FocusClaw/data/focusclaw.db`
- OpenClaw plugin package: `skills/FocusClaw/packages/plugin/`

## Use The Best Interface Available

1. If FocusClaw plugin tools are available, use them first.
2. If plugin tools are unavailable but the API is running, use the REST API.
3. If neither is available, inspect local files/docs and explain what is missing before asking Emilio to restart or configure anything.
4. Do not use browser automation for normal task operations when plugin tools or API endpoints can do the job.

Plugin tools, when installed, include:

- `focusclaw_plain_text_command`
- `focusclaw_list_open_tasks`
- `focusclaw_list_due_tasks`
- `focusclaw_find_task`
- `focusclaw_create_task`
- `focusclaw_list_tasks`
- `focusclaw_get_task`
- `focusclaw_update_task`
- `focusclaw_complete_task`
- `focusclaw_delete_task`

## Plain-Text Status Commands

Use these for compact read-only status:

- `focusclaw help`
- `focusclaw today`
- `focusclaw overdue`
- `focusclaw week`
- `focusclaw project <project name>`

Keep status output compact by default: group by project, show title plus due-date/status signal, and hide tags, descriptions, and IDs unless detail is requested.

## Natural Task Actions

For changes, interpret natural language and use the plugin/API:

- Add/create a task
- Find a task by title/project
- Update title, due date, owner label, priority, status, tags, comments, or subtasks
- Mark a task complete
- Delete a task only after explicit confirmation

When the user names a task by title, find it first instead of asking for a task ID. Ask only if multiple matches are ambiguous.

## API Notes

Default flow:

1. Check `GET http://127.0.0.1:3001/health`.
2. Try the needed request without auth.
3. If the API returns `401`, read `FOCUSCLAW_API_KEY` from secure runtime config and retry with `x-api-key`.
4. If no key is configured, report that FocusClaw is protected and the runtime key is missing.

Common endpoints:

- `GET /api/workspaces`
- `GET /api/projects/workspace/:workspaceId`
- `GET /api/tasks/project/:projectId`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/complete`
- `GET /api/tasks/:id/comments`
- `POST /api/tasks/:id/comments`
- `GET /api/tasks/:id/subtasks`
- `POST /api/tasks/:id/subtasks`
- `GET /api/tags`

## Safety And Semantics

- Owner labels like `user`, `agent`, and `unassigned` are coordination labels only.
- Owner labels do not grant permissions, start background execution, schedule work, or authorize autonomous workflows.
- Confirm destructive deletes before calling delete tools or API routes.
- Treat FocusClaw data as private local user data.
- Do not expose FocusClaw publicly; private Tailscale access is the intended remote path.
- Do not restart FocusClaw services unless Emilio asks.

## References

Open only when needed:

- App overview: `skills/FocusClaw/README.md`
- Scope/roadmap: `skills/FocusClaw/SPEC.md`
- API contract: `skills/FocusClaw/docs/agent-automation-api.md`
- Hermes bridge: `skills/FocusClaw/docs/hermes-integration.md`
- Shared endpoint notes: `skills/FocusClaw/packages/shared/API.md`
- Plugin docs: `skills/FocusClaw/packages/plugin/README.md`
- Plugin manifest: `skills/FocusClaw/packages/plugin/openclaw.plugin.json`
