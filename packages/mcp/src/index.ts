#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createFocusClawServer, loadConfig } from './server.js'

const server = createFocusClawServer(loadConfig())
const transport = new StdioServerTransport()

await server.connect(transport)
