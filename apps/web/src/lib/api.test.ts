import test from 'node:test'
import assert from 'node:assert/strict'

import { apiKey, projectApi } from './api'
import { resolveTaskProjectId } from './taskForm'

const storage = new Map<string, string>()

globalThis.window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  },
} as any

test('apiKey persists in localStorage', () => {
  apiKey.clear()
  assert.equal(apiKey.get(), '')
  apiKey.set('test-key')
  assert.equal(apiKey.get(), 'test-key')
  apiKey.clear()
  assert.equal(apiKey.get(), '')
})

test('request helper sends saved x-api-key header', async () => {
  apiKey.set('header-key')
  let headers: HeadersInit | undefined
  globalThis.fetch = async (_url, init) => {
    headers = init?.headers
    return new Response(JSON.stringify([]), { status: 200 })
  }

  await projectApi.list('workspace-id')

  assert.equal((headers as Record<string, string>)['x-api-key'], 'header-key')
})

test('new task project falls back to active project', () => {
  assert.equal(resolveTaskProjectId('', 'active-project'), 'active-project')
  assert.equal(resolveTaskProjectId('selected-project', 'active-project'), 'selected-project')
})
