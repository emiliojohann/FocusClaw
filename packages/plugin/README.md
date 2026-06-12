# FocusClaw — OpenClaw Plugin

The official OpenClaw plugin for FocusClaw task management. This plugin registers tools that allow AI agents to interact with FocusClaw tasks directly.

## Tools Registered

| Tool | Description |
|------|-------------|
| `focusclaw_plain_text_command` | Read-only handler for the documented `focusclaw ...` plain-text commands |
| `focusclaw_list_open_tasks` | Compact read-only open task summary across all projects, or one project by name/ID |
| `focusclaw_list_due_tasks` | Compact read-only task summary for `today`, `overdue`, or `week` |
| `focusclaw_find_task` | Find tasks by title/project so users do not need to copy task IDs |
| `focusclaw_create_task` | Create a new task |
| `focusclaw_list_tasks` | Legacy project-ID task list |
| `focusclaw_get_task` | Get task details |
| `focusclaw_update_task` | Update a task (status, priority, title, etc.) |
| `focusclaw_complete_task` | Mark a task as complete (archive) |
| `focusclaw_delete_task` | Permanently delete a task after user confirmation |

## Agent + Integration Usage

The MVP uses plain-text triggers, not slash commands, for read-only status through any connected agent or messaging integration:

- `focusclaw help` - explain the available commands
- `focusclaw today` - open tasks due today
- `focusclaw overdue` - overdue open tasks
- `focusclaw week` - open tasks due this week
- `focusclaw project Launch Plan` - open tasks for one project

Compact status output groups tasks by project and shows title plus due-date/status signal. Tags, descriptions, and task IDs are hidden unless an agent/tool caller explicitly requests detailed output.

Create, edit, complete, and delete actions should remain natural agent actions, for example:

- `Add a task to Launch Plan: prepare screenshots, due Friday.`
- `Mark the onboarding checklist complete.`
- `Delete the task about drafting the first content batch.`

Use `focusclaw_find_task` before update, complete, or delete when the user describes a task by title. Confirm destructive deletes before calling `focusclaw_delete_task`.

## Configuration

Add to your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "focusclaw": {
        "enabled": true,
        "config": {
          "apiUrl": "http://localhost:3001",
          "apiKey": "your-api-key",
          "workspaceSlug": "my-workspace",
          "defaultProjectId": "project-uuid-here"
        }
      }
    }
  }
}
```

Use `http://localhost:3001` when OpenClaw and FocusClaw run on the same machine. If OpenClaw is running on a different device in your tailnet, use the FocusClaw host machine's Tailscale API URL instead:

```json
{
  "apiUrl": "http://<FOCUSCLAW_TAILSCALE_IP_OR_NAME>:3001"
}
```

## Installation

```bash
openclaw plugins install ./path/to/focusclaw/packages/plugin
openclaw gateway restart
```

## Development

```bash
cd packages/plugin
npm install
npm run build
```

## License

MIT
