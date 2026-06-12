# FocusClaw API Notes

FocusClaw exposes a local REST API for the web app, OpenClaw tools, Hermes integrations, and any agent platform that can call HTTP endpoints. The API is task management only: create, read, update, complete, comment, tag, and export tasks.

Assignment values such as `user` and `agent` are labels. They do not grant permissions, block other agents from helping, or start background execution.

## Agent + Integration MVP

Read-only status uses plain-text triggers handled by an agent/plugin layer or messaging integration, not slash-command routing:

- `focusclaw help`
- `focusclaw today`
- `focusclaw overdue`
- `focusclaw week`
- `focusclaw project Launch Plan`

The plugin should keep these summaries compact by default: group by project, show title plus due-date/status signal, and hide tags, descriptions, and task IDs unless detailed output is explicitly requested. Add, edit, complete, and delete remain agent tool actions using the REST endpoints below.

## Current Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/workspaces` | List workspaces |
| `POST` | `/api/workspaces` | Create workspace |
| `GET` | `/api/projects/workspace/:workspaceId` | List projects |
| `POST` | `/api/projects` | Create project |
| `DELETE` | `/api/projects/:id` | Delete project, optionally moving tasks first |
| `GET` | `/api/tasks/project/:projectId` | List project tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `PATCH` | `/api/tasks/:id` | Update task fields |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/:id/complete` | Mark task complete |
| `GET` | `/api/tasks/:id/comments` | List comments |
| `POST` | `/api/tasks/:id/comments` | Add comment |
| `GET` | `/api/tasks/:id/subtasks` | List subtasks |
| `POST` | `/api/tasks/:id/subtasks` | Add subtask |
| `GET` | `/api/tasks/export` | Export all tasks as CSV |
| `GET` | `/api/tasks/export/:projectId` | Export one project's tasks as CSV |
| `GET` | `/api/tags` | List universal tags |
| `GET` | `/api/tags/:projectId` | Legacy-compatible universal tag list |
| `POST` | `/api/tags` | Create tag |
| `PUT` | `/api/tags/:id` | Update tag |
| `DELETE` | `/api/tags/:id` | Delete tag |

There are no agent-run, webhook, or scheduled automation endpoints in the MVP.
