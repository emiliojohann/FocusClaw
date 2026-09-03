# FocusClaw MCP Integration

FocusClaw includes a portable stdio MCP server for Grok Build, Codex, Claude Code, and other MCP clients. It translates specific MCP tools into calls to the existing local FocusClaw REST API.

## Build

Start FocusClaw normally, then build the MCP server from the FocusClaw repository:

```bash
npm install
npm --workspace @focusclaw/mcp run build
```

The server entry point is:

```text
/absolute/path/to/FocusClaw/packages/mcp/dist/index.js
```

## Compatibility Status

The MCP server has passed its build, automated tests, protocol handshake, tool discovery, and a live read-only health call against FocusClaw. Grok Build compatibility is community-testing pending because the maintainers do not currently have access to its paid early-access CLI. A Grok-specific issue does not imply that the MCP protocol or other clients are broken.

## Grok Build

Use the stdio MCP command supported by the installed Grok Build version:

```bash
grok mcp add focusclaw -- node /absolute/path/to/FocusClaw/packages/mcp/dist/index.js
grok mcp list
```

In Grok Build, use `/mcps` to check or refresh the connection.

If the FocusClaw API uses an API key, pass it through Grok's MCP environment configuration instead of placing it in a prompt or repository:

```bash
grok mcp add focusclaw \
  -e FOCUSCLAW_API_URL=http://127.0.0.1:3001 \
  -e FOCUSCLAW_API_KEY=[FOCUSCLAW_API_KEY] \
  -- node /absolute/path/to/FocusClaw/packages/mcp/dist/index.js
```

Run `grok mcp --help` first if your Grok Build version uses different option ordering.

## Codex

```bash
codex mcp add focusclaw -- node /absolute/path/to/FocusClaw/packages/mcp/dist/index.js
codex mcp list
```

Inside Codex, use `/mcp` to confirm the tools are available.

## Configuration

The MCP process accepts these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `FOCUSCLAW_API_URL` | `http://127.0.0.1:3001` | FocusClaw API origin, without `/api` |
| `FOCUSCLAW_API_KEY` | unset | Optional value sent as `x-api-key` |
| `FOCUSCLAW_MCP_TIMEOUT_MS` | `10000` | Request timeout from 100 to 120000 milliseconds |

The API URL must use HTTP or HTTPS and cannot contain embedded credentials.

## Tools

The server exposes 12 focused tools:

- Health, workspace, project, task list, task search, and task detail
- Create, update, complete, comment, and subtask actions
- Explicitly confirmed task deletion

Agents should find tasks by title before asking for an ID. Completion must use `focusclaw_complete_task` so recurring tasks are handled correctly. Deletion requires `confirmed: true` after explicit user confirmation for the exact task.

## Smoke Test

Ask the connected agent:

```text
Check FocusClaw health, then list my workspaces. Do not create or modify anything.
```

After that succeeds, test a write only with an intentionally approved disposable task.

## Troubleshooting and Bug Reports

Before reporting a problem:

1. Confirm FocusClaw is running by opening `http://127.0.0.1:3001/health`.
2. Rebuild the MCP server with `npm --workspace @focusclaw/mcp run build`.
3. Run your client's MCP list or status command and reconnect the server.
4. Confirm that the configured `FOCUSCLAW_API_URL` points to the same machine running FocusClaw. The default `127.0.0.1` always means the MCP client's local machine.

Include the FocusClaw version, operating system, Node.js version, MCP client and version, the exact failing tool or step, and sanitized error output in a bug report. Never include API keys, credentials, private task contents, or secret-bearing configuration.
