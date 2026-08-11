import test from 'node:test'
import assert from 'node:assert/strict'
import { hasHydratedDashboardStatus, readCachedInProgressStatusId } from './dashboardCache'
import { readCalendarCacheRecord, writeCalendarCacheRecord } from './calendarCache'

test('calendar cache restores tasks and in-progress status atomically', () => {
  const cacheStorage = new Map<string, string>()
  const storage = {
    getItem: (key: string) => cacheStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { cacheStorage.set(key, value) },
  }
  const key = 'calendar-cache-test'

  writeCalendarCacheRecord(storage, key, {
    tasks: [{ id: 'task-1', statusId: 'status-progress' }],
    overviewTasks: [{ id: 'task-1', statusId: 'status-progress' }],
    projects: [{ id: 'project-1' }],
    workspaceId: 'workspace-1',
    activeProjectId: 'project-1',
    projectFilter: 'all',
    status: { hydrated: true, inProgressStatusId: 'status-progress' },
  })

  const hydrated = readCalendarCacheRecord<{ id: string; statusId: string }, { id: string }>(storage, key)
  assert.equal(hasHydratedDashboardStatus(hydrated), true)
  assert.equal(readCachedInProgressStatusId(hydrated), 'status-progress')
  assert.equal(hydrated?.tasks[0]?.statusId, 'status-progress')
})

test('calendar cache rejects malformed status hydration', () => {
  const storage = {
    getItem: () => JSON.stringify({
      tasks: [],
      overviewTasks: [],
      projects: [],
      status: { hydrated: true },
    }),
  }

  const hydrated = readCalendarCacheRecord(storage, 'calendar-cache-test')
  assert.equal(hasHydratedDashboardStatus(hydrated), false)
})
