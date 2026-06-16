# Changelog

## v2026.6.16 - 2026-06-16

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

- Added OpenClaw command coverage for projects, tags, due dates, priorities, backups, and app version checks.
- Added universal tags, project deletion, metadata polish, and public release documentation.
- Improved mobile layouts with a compact top bar and cleaner navigation behavior.
- Added latest GitHub release visibility in the app shell and Settings/About.
- Fixed task due date filters so overdue/upcoming/no-due-date queries are handled correctly.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.12` / `v2026.6.12`.

## v2026.6.11 - 2026-06-11

- Fixed task edits so clearing an existing due date persists a null due date.
- Added a Settings contact/feedback card for `social@focusclaw.app`.
- Added lightweight GitHub latest-release visibility in the app shell and Settings/About.
- Added a compact mobile top bar with the FocusClaw logo while keeping bottom navigation.
- Capped the default Tasks list display at 50 matching tasks with a Show more affordance.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.11` / `v2026.6.11`.
