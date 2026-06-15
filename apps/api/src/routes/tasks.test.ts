import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DATABASE_URL = `sqlite:${join(mkdtempSync(join(tmpdir(), 'focusclaw-test-')), 'focusclaw.db')}`

const { createServer } = await import('../server')

test('API_KEY protects API routes and leaves health public', async () => {
  process.env.API_KEY = 'secret'
  const server = await createServer()
  try {
    const noKey = await server.inject({ method: 'GET', url: '/api/workspaces' })
    const health = await server.inject({ method: 'GET', url: '/health' })
    const withKey = await server.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: { 'x-api-key': 'secret' },
    })

    assert.equal(noKey.statusCode, 401)
    assert.equal(health.statusCode, 200)
    assert.equal(withKey.statusCode, 200)
  } finally {
    delete process.env.API_KEY
    await server.close()
  }
})

test('GET /api/tasks/:id/activity returns activity rows', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Test Workspace', slug: `test-${Date.now()}` },
    })
    assert.equal(workspaceResponse.statusCode, 201)
    const workspace = workspaceResponse.json()

    const projectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: workspace.id, name: 'Inbox' },
    })
    assert.equal(projectResponse.statusCode, 201)
    const project = projectResponse.json()

    const taskResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: project.id, title: 'Activity test task' },
    })
    assert.equal(taskResponse.statusCode, 201)
    const task = taskResponse.json()

    const activityResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/activity`,
    })
    assert.equal(activityResponse.statusCode, 200)
    const activity = activityResponse.json()

    assert.equal(activity.length, 1)
    assert.equal(activity[0].taskId, task.id)
    assert.equal(activity[0].action, 'created')
    assert.equal(activity[0].tags, undefined)
  } finally {
    await server.close()
  }
})
