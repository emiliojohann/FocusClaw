# FocusClaw MCP

Portable stdio MCP server for a locally running FocusClaw installation. It calls the existing FocusClaw REST API and never reads the SQLite database directly.

## Local development setup

From the FocusClaw repository:

```bash
npm install
npm --workspace @focusclaw/mcp run build
```

Configure an MCP client to run:

```bash
node /absolute/path/to/FocusClaw/packages/mcp/dist/index.js
```

Optional environment variables:

```text
FOCUSCLAW_API_URL=http://127.0.0.1:3001
FOCUSCLAW_API_KEY=[OPTIONAL_API_KEY]
FOCUSCLAW_MCP_TIMEOUT_MS=10000
```

The API URL defaults to the local FocusClaw API. Never put credentials inside the URL.

## Grok Build

After building the server, add it with Grok Build's stdio MCP command:

```bash
grok mcp add focusclaw -- node /absolute/path/to/FocusClaw/packages/mcp/dist/index.js
```

Pass any required environment variables through Grok's MCP configuration. Run `grok mcp --help` first if your installed version uses different option ordering.

Run `grok mcp list`, then use Grok Build's MCP status command to verify that the FocusClaw tools are available.

Grok Build support is community-testing pending. The MCP server itself has passed automated tests, protocol handshake and tool discovery, and a live read-only call against FocusClaw.

## Safety

- Task deletion requires `confirmed: true` and must follow explicit user confirmation for the exact task.
- Task completion uses FocusClaw's completion endpoint so recurring tasks are handled correctly.
- Assignee and owner values are coordination labels, not authorization or execution grants.
- The server binds no port. Network exposure remains controlled by the FocusClaw API configuration.

For the complete setup, smoke test, troubleshooting steps, and bug-report checklist, see [`docs/mcp-integration.md`](../../docs/mcp-integration.md).
