# Changelog

## v2026.6.18 - 2026-06-18

- Includes all FocusClaw changes since `v2026.6.16`.
- Fixed local due-date handling so calendar dates stay stable across local timezone parsing.
- Added task description and comment character counters with corrected limits and alignment.
- Added subtask completion/editing support and improved subtask indicators/action spacing.
- Improved agenda priority ordering, removed duplicate priority labeling, and refined task metadata pills.
- Polished mobile task-card metadata layout.
- Replaced native browser due-date popups with FocusClaw's Monday-first date picker.
- Persisted active Tasks and Calendar filters separately from Settings defaults.
- Removed redundant completed-task `Done` labels from task cards and agenda rows.
- Reduced the extra Tasks first-load refresh delay.
- Added a `Next Week` Tasks status filter.
- Made task comment links clickable and added edit/delete support for task comments.
- Improved date picker placement so it can flip above fields when space is tight.
- Improved light-mode link hover and medium-priority contrast.
- Tightened comment action controls for desktop and mobile metadata fit.
- Refined selected priority buttons with filled active states and removed selector dots.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.18` / `v2026.6.18`.

## v2026.6.16 - 2026-06-16

### Thanks

Special thanks to https://x.com/m_zokov for the help provided on this release.

- Added a FocusClaw OpenClaw skill wrapper so agents can discover when and how to use FocusClaw.
- Added Hermes integration guidance for using FocusClaw through the local REST API.
- Linked the Hermes integration guide from the README.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.16` / `v2026.6.16`.

## v2026.6.15 - 2026-06-15

- Thanked https://x.com/TomTurcotteTech and https://x.com/m_zokov for contributing feedback to this release.
- Updated the visible FocusClaw interface version to `v2026.6.15`.
- Fixed the Vite/Tailwind dependency state after the audit upgrade and aligned Tailwind packages across workspaces.
- Moved agent/API technical plumbing out of normal Settings and into `docs/agent-automation-api.md`.
- Added README coverage for the local Agent Automation API, Tailscale/private access, and agent auth behavior.
- Restored user-facing Private Access settings with Local App URL and Tailscale / Private App URL above Contact & Feedback.
- Fixed mobile Calendar empty-state loader flicker when no dated tasks are available.
- Added a mobile-only New Task button in the top bar across all pages.
- Restored the new FocusClaw logo artwork with an optimized app asset and removed transient hard-refresh logo flicker from the Dashboard empty state.
- Refined Settings button sizing and completed beta review cleanup.

## v2026.6.12 - 2026-06-13

- Includes the earlier `v2026.6.11` app polish that was never released separately.
- Fixed task edits so clearing an existing due date persists a null due date.
- Added a Settings contact/feedback card for `social@focusclaw.app`.
- Added lightweight GitHub latest-release visibility in the app shell and Settings/About.
- Added a compact mobile top bar with the FocusClaw logo while keeping bottom navigation and improving mobile navigation behavior.
- Capped the default Tasks list display at 50 matching tasks with a Show more affordance.
- Added OpenClaw command coverage for projects, tags, due dates, priorities, backups, and app version checks.
- Added universal tags, project deletion, metadata polish, and public release documentation.
- Fixed task due date filters so overdue/upcoming/no-due-date queries are handled correctly.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.12` / `v2026.6.12`.
