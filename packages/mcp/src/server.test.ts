import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createFocusClawServer, FocusClawClient, loadConfig } from './server.js'

test('loadConfig uses safe local defaults and rejects credentials in URLs', () => {
  assert.deepEqual(loadConfig({}), {
    apiUrl: 'http://127.0.0.1:3001',
    apiKey: undefined,
    timeoutMs: 10000,
  })
  assert.throws(() => loadConfig({ FOCUSCLAW_API_URL: 'http://user:pass@localhost:3001' }), /must not contain credentials/)
})

test('FocusClawClient sends the API key and parses JSON', async () => {
  const httpServer = createServer((request, response) => {
    assert.equal(request.headers['x-api-key'], 'test-key')
    assert.equal(request.url, '/health')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address()
  assert(address && typeof address === 'object')

  try {
    const client = new FocusClawClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'test-key',
      timeoutMs: 1000,
    })
    assert.deepEqual(await client.request('/health'), { ok: true })
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()))
  }
})

test('FocusClawClient returns sanitized API errors', async () => {
  const httpServer = createServer((_request, response) => {
    response.writeHead(502, { 'content-type': 'text/html' })
    response.end('<html>private proxy details</html>')
  })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address()
  assert(address && typeof address === 'object')

  try {
    const client = new FocusClawClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 1000,
    })
    await assert.rejects(() => client.request('/health'), /^Error: FocusClaw API returned HTTP 502\.$/)
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()))
  }
})

test('MCP Zod schemas preserve defaults, constraints, and tool calls after dependency upgrades', async () => {
  const requests: string[] = []
  const httpServer = createServer((request, response) => {
    requests.push(request.url || '')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify([]))
  })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address()
  assert(address && typeof address === 'object')
  const mcpServer = createFocusClawServer({ apiUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 1000 })
  const mcpClient = new Client({ name: 'focusclaw-schema-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  try {
    await Promise.all([mcpServer.connect(serverTransport), mcpClient.connect(clientTransport)])
    const { tools } = await mcpClient.listTools()
    const createTask = tools.find((tool) => tool.name === 'focusclaw_create_task')
    assert(createTask)
    assert.deepEqual(createTask.inputSchema.required, ['projectId', 'title'])
    const titleSchema = createTask.inputSchema.properties?.title as { maxLength?: number }
    assert.equal(titleSchema.maxLength, 500)

    for (const arguments_ of [
      { projectId: 'project', title: '' },
      { projectId: 'project', title: 'x'.repeat(501) },
      { projectId: 'project', title: 'Valid', priority: 5 },
      { title: 'Missing project' },
    ]) {
      const invalid = await mcpClient.callTool({ name: 'focusclaw_create_task', arguments: arguments_ })
      assert.equal(invalid.isError, true)
    }
    const invalidLifecycle = await mcpClient.callTool({
      name: 'focusclaw_update_task', arguments: { taskId: 'task', lifecycle: 'invalid' },
    })
    assert.equal(invalidLifecycle.isError, true)
    assert.equal(requests.length, 0, 'Invalid arguments must not reach the API')

    const defaults = await mcpClient.callTool({ name: 'focusclaw_list_tasks', arguments: {} })
    assert.notEqual(defaults.isError, true)
    const filtered = await mcpClient.callTool({
      name: 'focusclaw_list_tasks', arguments: { includeArchived: true, query: 'next task' },
    })
    assert.notEqual(filtered.isError, true)
    assert.deepEqual(requests, ['/api/tasks', '/api/tasks?includeArchived=true&q=next+task'])
  } finally {
    await mcpClient.close()
    await mcpServer.close()
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()))
  }
})

test('MCP handshake exposes tools and can call the read-only health tool', async () => {
  const httpServer = createServer((request, response) => {
    assert.equal(request.url, '/health')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok' }))
  })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address()
  assert(address && typeof address === 'object')

  const mcpServer = createFocusClawServer({
    apiUrl: `http://127.0.0.1:${address.port}`,
    timeoutMs: 1000,
  })
  const mcpClient = new Client({ name: 'focusclaw-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  try {
    await Promise.all([
      mcpServer.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ])
    const tools = await mcpClient.listTools()
    assert(tools.tools.some((tool) => tool.name === 'focusclaw_health'))
    assert(tools.tools.some((tool) => tool.name === 'focusclaw_delete_task'))

    const health = await mcpClient.callTool({ name: 'focusclaw_health', arguments: {} })
    assert.deepEqual(health.content, [{ type: 'text', text: '{\n  "status": "ok"\n}' }])
  } finally {
    await mcpClient.close()
    await mcpServer.close()
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
