# Changelog

## v2026.08.24.1 - 2026-08-28

### Thanks

Special thanks to [@Minoo7](https://github.com/Minoo7) for identifying and fixing the OpenClaw plugin compatibility issue in [PR #3](https://github.com/emiliojohann/FocusClaw/pull/3).

- Declared all ten registered FocusClaw agent tools in the plugin manifest's `contracts.tools` list so OpenClaw 2026.7 and newer can load and expose them.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.24-1` / `v2026.08.24.1`.

## v2026.08.24 - 2026-08-24

- Added a single daily Highlight task that stays pinned above all other active tasks and automatically advances to the current date without creating duplicates.
- Added a "Pin as Highlight" setting with database enforcement so assigning a new Highlight replaces the previous one.
- Added a yellow star treatment on task cards and a compact yellow corner marker on Calendar cards, with refined sizing across desktop and mobile layouts.
- Prevented highlighted tasks from being dragged or used as reorder targets while leaving normal task reordering unchanged.
- Preserved Highlight state in agent/plugin updates, backups, and CSV exports, and cleared it when the task is completed or archived.
- Improved Highlight readability and alignment across light and dark themes.
- Added priority-aware manual task ordering in list and grid views.
- Made the drag handle available without first selecting Manual sort; a successful reorder switches the dashboard to **Sort: Manual** automatically.
- Aligned the list-view grabber with the priority/project/due metadata row.
- Made the whole task card follow the pointer while dragging on desktop and mobile touch devices.
- Added a 0.5-second mobile long press anywhere on a task to enter Manual sort and begin a full-card drag, while preserving normal taps and scrolling.
- Added extra mobile spacing between task titles and the metadata pill row.
- Replaced native desktop drag-and-drop with FocusClaw's captured-pointer drag so every grab stays active through release.
- Added a window-level pointer fallback so fast list/grid drags still finish when browser pointer capture is unavailable or lost, resolve the drop from the final release coordinates, reset drag state safely across view changes, and move the preview on GPU-accelerated transforms for smoother tracking.
- Kept manual dragging available while prior reorder saves finish, with background saves serialized in gesture order so repeated list/grid switches cannot leave every handle locked.
- Made desktop whole-card drags activate after 4px of movement, captured the pointer from mouse-down so one-step fast gestures cannot outrun activation, and snap releases in card gaps to the nearest valid same-priority target.
- Made list-mode collision follow the dragged card body and its leading edge instead of the cursor alone, so vertical rows snap substantially earlier in both directions.
- Persisted manual order across refreshes and project filters.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.24` / `v2026.08.24`.

## v2026.08.11 - 2026-08-11

- Added a To Do / In Progress / Done lifecycle control to Task Details while keeping Done routed through the recurring-safe completion endpoint.
- Added responsive In Progress, priority, subtask, and owner indicators across Tasks and Calendar, including compact icon treatments for mobile and Calendar overflow agendas.
- Improved light-theme contrast for In Progress, User, and green tag pills while preserving dark-theme colors.
- Matched task metadata pill sizing and roundness, removed requested borders and priority shadows, and kept long mobile Calendar titles truncated without layout overflow.
- Restored Calendar tasks and In Progress status metadata atomically so status icons render in their final position without a delayed jump after reloads or route changes.
- Added API and OpenClaw plugin support for starting tasks and returning them to To Do using each workspace's existing status definitions.
- Added focused web regression coverage for dashboard and Calendar status-cache hydration.
- Pinned the transitive `nanoid` dependency to patched version `3.3.18`, resolving the high-severity infinite-loop denial-of-service advisory `GHSA-2v37-7h3g-55p8`.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.11` / `v2026.08.11`.

## v2026.08.05.1 - 2026-08-06

- Added a root npm override that pins the transitive `fast-uri` runtime dependency to patched version `3.1.5`, preventing resolution below the fix for the high-severity host-confusion advisory `GHSA-7p8r-x3mc-p8w7` / `CVE-2026-18446`.
- Refreshed the dependency manifest and lockfile so GitHub can rescan the explicit patched resolution after its public dependency graph continued reporting stale `fast-uri@3.1.4` data.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.5-1` / `v2026.08.05.1`.

## v2026.08.05 - 2026-08-05

### Thanks

Special thanks to [BeardedChop](https://github.com/BeardedChop) for identifying and fixing the native dependency install-policy issue.

- Approved the required install scripts for `better-sqlite3@12.9.0`, `esbuild@0.28.1`, and the macOS-specific `fsevents@2.3.3` using npm's version-pinned `allowScripts` policy.
- Restored clean fresh installs under npm 11 and forward compatibility with npm 12's stricter dependency lifecycle-script enforcement.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.5` / `v2026.08.05`.

## v2026.08.04 - 2026-08-04

- Changed current and future FocusClaw releases from MIT to `AGPL-3.0-only`; releases published before August 4, 2026 retain their original MIT rights.
- Updated `brace-expansion` from 5.0.8 to 5.0.9 to resolve the high-severity denial-of-service advisory `GHSA-rgw5-rvv9-x895`.
- Updated `fast-uri` from 3.1.4 to 3.1.5 to resolve the high-severity host-confusion advisory `GHSA-7p8r-x3mc-p8w7`.
- Restored a clean dependency audit with zero known vulnerabilities.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.8.4` / `v2026.08.04`.

## v2026.07.13.3 - 2026-07-28

- Includes all FocusClaw changes since `v2026.07.13`, including the internal DEV increments `v2026.07.13.1` and `v2026.07.13.2`.
- Fixed the selected Calendar Month/Week label so it remains white in light mode.
- Matched the inner Month/Week button corner radius concentrically to the surrounding segmented-control field.
- Made the Month/Week segmented control spacing a consistent 2px on every side.
- Fixed the Past Due task filter so completed tasks no longer appear.
- Added multi-select bulk task deletion for grid and list views, with confirmation, descendant cleanup, and API test coverage.
- Updated vulnerable production and development dependencies, including React 19.2.8, React Router 8.3, ESLint 10.8, TypeScript ESLint 8.65, and compatible React lint plugins.
- Restored a clean dependency audit with zero known vulnerabilities.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.7.13-3` / `v2026.07.13.3`.

## v2026.07.13 - 2026-07-13

- Includes all FocusClaw changes since `v2026.07.03`, including the internal DEV increments `v2026.07.03.1`, `v2026.07.03.2`, and `v2026.07.03.3`.
- Fixed OpenClaw and Hermes logo rendering so the app icon keeps a stable square footprint when switching between dark and light themes without adding any wrapper border or background.
- Matched task description and task comment resize affordances by routing both through the same resizable field styling.
- Added an optimized Hermes app logo preload so the blue theme logo does not flash on refresh.
- Kept OpenClaw and Hermes logo assets warm across route changes so page switching does not recreate a cold visible logo image.
- Removed the added route, Tasks, and Calendar fade transitions so filter and reset actions update directly.
- Kept existing task content visible while refreshes run when data is already present.
- Replaced the full task-area spinner on true cold loads with stable skeleton task cards.
- Added a `Due Tomorrow` task status filter to the API and Tasks view, with focused API test coverage.
- Added a Calendar Week view for focused Monday-through-Sunday planning alongside the existing Month view.
- Increased desktop Calendar day capacity to show up to 10 visible task chips before collapsing the rest behind `+ X more`.
- Matched Calendar and Tasks header/filter row heights so switching between them no longer nudges the page content.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.7.13` / `v2026.07.13`.

## v2026.07.03 - 2026-07-03

### Thanks

Special thanks to:

- https://x.com/m_zokov
- https://x.com/TomTurcotteTech
- https://x.com/BChopLXXXII

### Changes

- Includes all FocusClaw changes since `v2026.6.22`, including the internal DEV increments `v2026.6.22.1`, `v2026.6.22.2`, `v2026.6.22.3`, `v2026.06.30`, and `v2026.07.02`.
- Fixed mobile Calendar new-task launch so the top-bar New Task button opens the task creation popup reliably.
- Changed new-task project selection to require an explicit "Select a project" choice instead of defaulting to the active or last-used project.
- Made disabled primary buttons visibly greyed out until required fields are complete.
- Fixed filtered task creation so newly created tasks only appear immediately when they match the active project, status, tag, owner, and search filters, preventing the quick add-then-disappear flash.
- Added agent-friendly JSON route aliases for tasks and projects: `GET /api/tasks`, `GET /api/tasks?workspaceId=...`, `GET /api/tasks?projectId=...`, and `GET /api/projects?workspaceId=...`.
- Kept the existing project-scoped API routes intact for backwards compatibility.
- Increased task and subtask descriptions from 5,000 to 10,000 characters.
- Expanded description editing space in task details and new-task forms so long generated drafts can be reviewed without cramped scrolling.
- Added a Markdown mini editor and preview for task descriptions.
- Added separate Appearance controls for mode (`System`, `Dark`, `Light`) and theme family (`OpenClaw`, `Hermes`), so each family resolves its own dark/light palette automatically.
- Fixed light-theme project pill contrast so project names remain readable.
- Added task attachment metadata support for local paths, images, PDFs, and folders without uploading or owning the original files.
- Added attachment API routes and backup/export coverage.
- Updated Hermes and shared API docs to prefer the discoverable JSON routes.
- Reworked task descriptions into a shared Live/Code editor for task details and new-task creation: Live is the default editable rendered Markdown view, and Code is the raw Markdown/source view for agents and developers.
- Reworked attachments into a local-only `Select a file` flow that infers file/image/PDF type, stores metadata plus the local path, supports rename/open/missing-file handling, and shows compact paperclip indicators on task cards.
- Removed URL attachments from the app and API because FocusClaw cannot validate or control external URL content.
- Hardened Markdown rendering, inline code insertion, local attachment opening, non-loopback API auth, and encrypted backup passphrase requirements.
- Fixed mobile Settings bottom navigation clearance, iOS/Chrome viewport height behavior, and first-navigation layout shifts.
- Updated the landing page, app metadata, README, spec, API docs, Hermes docs, shared API notes, and OpenClaw plugin metadata to position FocusClaw as the local task context layer for OpenClaw, Hermes, and humans.
- Added Hermes logo/favicons and theme-family-aware logo switching across the app and landing page.
- Added Hermes theme family metadata, colors, and transition handling so OpenClaw and Hermes themes switch cleanly.
- Refined the empty task dashboard state with clearer create-task prompts and copy.
- Fixed desktop search and theme-transition spacing so the dashboard search area behaves more smoothly.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.7.3` / `v2026.07.03`.

## v2026.6.22 - 2026-06-22

- Hid native browser search clear controls so FocusClaw shows only its custom search close button.
- Fixed Task Details description saves so edited descriptions persist and empty descriptions can be cleared.
- Reduced task-list flicker after Task Details saves by updating the changed task locally instead of forcing a full reload.
- Removed automatic natural-language recurring-task detection from the API.
- Added explicit Repeats controls for new tasks and Task Details: does not repeat, daily, weekly, every 2 weeks, and monthly.
- Added API coverage for explicit recurring values and for avoiding accidental recurrence from plain weekday text like "by Friday".
- Replaced task-card recurring text pills with compact repeat-icon indicators in grid and list views.
- Adjusted mobile task-card recurring indicators so the repeat icon sits next to the User/Agent pill instead of wrapping the metadata row.
- Updated app, API, plugin, landing, package, and backup version metadata to `2026.6.22` / `v2026.6.22`.

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
