# FocusClaw Spec

> Current working spec for the FocusClaw MVP.

## Product Direction

FocusClaw is an agent-native task manager. The first version is local-first and optimized for people and AI agents working from one shared task source of truth.

## Current Scope

- Web dashboard for active and completed tasks.
- Calendar view for tasks with due dates, including completed tasks shown in a muted state.
- Fastify REST API backed by SQLite through Drizzle ORM.
- Plugin tools for task create, list, get, update, and complete.
- Workspace-wide tag definitions.

## Current API Shape

- `GET /health`
- `GET /api/tasks/project/:projectId`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/complete`
- `GET /api/tasks/:id/subtasks`
- `POST /api/tasks/:id/subtasks`
- `GET /api/tasks/export`
- `GET /api/tasks/export/:projectId`
- `GET /api/tags/:projectId`
- `POST /api/tags`
- `PUT /api/tags/:id`
- `DELETE /api/tags/:id`

## Task List Filtering

`GET /api/tasks/project/:projectId` defaults to active, non-archived tasks.

Supported query params:

- `filter=all` returns active tasks by default.
- `filter=archived` returns archived tasks only.
- `filter=dueToday`, `filter=dueThisWeek`, and `filter=pastDue` return active tasks in those date buckets.
- `includeArchived=true` returns active and archived tasks when no explicit archived-only filter is set.

## Roadmap

- Add automated API tests around task filtering, tags, and plugin auth.
- Add a CI typecheck/build path.
- Keep assignment labels clear without implying execution permissions.
