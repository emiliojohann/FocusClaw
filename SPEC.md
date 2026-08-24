# FocusClaw Spec

> Current working spec for the FocusClaw MVP.

## Product Direction

FocusClaw is the local-first task context layer for OpenClaw, Hermes, and humans. The first version is optimized around one shared task source of truth that agents can read and update without browser automation.

## Current Scope

- Web dashboard for active and completed tasks.
- Calendar view for tasks with due dates, including completed tasks shown in a muted state.
- Fastify REST API backed by SQLite through Drizzle ORM.
- OpenClaw plugin tools for task create, list, get, lifecycle/update, and recurring-safe completion.
- Hermes-compatible REST API access for the same task records.
- Workspace-wide tag definitions.

## Current API Shape

- `GET /health`
- `GET /api/tasks/project/:projectId`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `GET /api/tasks/statuses/:workspaceId`
- `POST /api/tasks/statuses/:workspaceId/in-progress`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/complete`
- `GET /api/tasks/:id/subtasks`
- `POST /api/tasks/:id/subtasks`
- `POST /api/tasks/reorder`
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
- `sort=manual` returns tasks by their persisted manual position.

The dashboard's **Sort: Manual** mode keeps root tasks grouped by priority and lets users drag tasks into any order within the same priority group. Drag grips remain available under each completion circle regardless of the selected sort; on desktop, moving any non-interactive part of a task card by at least 4px begins the same drag while a click still opens Task Details. The first valid drag automatically switches the dashboard to **Sort: Manual**. Desktop cards capture the pointer from mouse-down, active drags keep window-level move/release listeners as a fallback, and nearby gaps snap to the closest valid same-priority card. List collision uses the dragged card's center plus a directional leading-edge bias, while multi-column grid drops use the target card's horizontal half. The release coordinates are always evaluated before completion and view-mode changes cancel unfinished gestures. Reorder requests are serialized in gesture order without disabling the handles, so persistence latency cannot block later drags or layout switches. The full-card preview moves on a compositor transform for smooth tracking. On coarse-pointer mobile devices, a stationary 0.5-second press anywhere on a task enters Manual sort and begins the same full-card drag; movement before activation cancels the hold so normal scrolling remains available. Reordering a filtered subset changes only those tasks' relative slots, preserves hidden tasks, and supports tasks from multiple projects in the same workspace.

## Roadmap

- Add automated API tests around task filtering, tags, and plugin auth.
- Add a CI typecheck/build path.
- Keep assignment labels clear without implying execution permissions.
