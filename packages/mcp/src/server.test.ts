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
