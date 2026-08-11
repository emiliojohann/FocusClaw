import test from 'node:test'
import assert from 'node:assert/strict'

import { apiKey, projectApi } from './api'
import {
  hasHydratedDashboardStatus,
  readCachedInProgressStatusId,
  readDashboardCacheRecord,
  resolveInProgressStatusId,
  writeDashboardCacheRecord,
} from './dashboardCache'
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

test('new task project requires an explicit project selection', () => {
  assert.equal(resolveTaskProjectId(''), '')
  assert.equal(resolveTaskProjectId('selected-project'), 'selected-project')
})

test('dashboard cache distinguishes missing status hydration from no in-progress status', () => {
  assert.equal(hasHydratedDashboardStatus({}), false)
  assert.equal(readCachedInProgressStatusId({}), null)
  assert.equal(hasHydratedDashboardStatus({ status: { hydrated: true, inProgressStatusId: null } }), true)
  assert.equal(readCachedInProgressStatusId({ status: { hydrated: true, inProgressStatusId: null } }), null)
})

test('dashboard status resolver matches in progress case-insensitively', () => {
  assert.equal(resolveInProgressStatusId([
    { id: 'todo', name: 'Todo' },
    { id: 'progress', name: '  In Progress  ' },
  ]), 'progress')
  assert.equal(resolveInProgressStatusId([{ id: 'done', name: 'Done' }]), null)
})

test('dashboard cache read/write preserves validated status hydration', () => {
  const cacheStorage = new Map<string, string>()
  const fakeStorage = {
    getItem: (key: string) => cacheStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { cacheStorage.set(key, value) },
  }
  const key = 'dashboard-cache-test'

  writeDashboardCacheRecord(fakeStorage, key, {
    tasks: [{ id: 'task-1' }],
    projects: [{ id: 'project-1' }],
    workspaceId: 'workspace-1',
    activeProjectId: 'project-1',
    projectFilter: 'all',
    tags: [],
    status: { hydrated: true, inProgressStatusId: 'status-progress' },
  })

  const hydrated = readDashboardCacheRecord(fakeStorage, key)
  assert.equal(hasHydratedDashboardStatus(hydrated), true)
  assert.equal(readCachedInProgressStatusId(hydrated), 'status-progress')

  cacheStorage.set(key, JSON.stringify({
    tasks: [],
    projects: [],
    status: { hydrated: true },
  }))

  const invalid = readDashboardCacheRecord(fakeStorage, key)
  assert.equal(hasHydratedDashboardStatus(invalid), false)
})
