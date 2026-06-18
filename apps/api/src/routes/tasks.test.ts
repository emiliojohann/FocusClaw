import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DATABASE_URL = `sqlite:${join(mkdtempSync(join(tmpdir(), 'focusclaw-test-')), 'focusclaw.db')}`

const { createServer } = await import('../server')

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfNextMondayFirstWeek(today = new Date()): Date {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const dayOffset = (8 - start.getDay()) % 7 || 7
  start.setDate(start.getDate() + dayOffset)
  return start
}

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

test('task comments enforce the explicit 1000 char limit', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Comment Workspace', slug: `comments-${Date.now()}` },
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
      payload: { projectId: project.id, title: 'Long comment task' },
    })
    assert.equal(taskResponse.statusCode, 201)
    const task = taskResponse.json()

    const accepted = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/comments`,
      payload: { content: 'x'.repeat(1000) },
    })
    assert.equal(accepted.statusCode, 201)

    const rejected = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/comments`,
      payload: { content: 'x'.repeat(1001) },
    })
    assert.equal(rejected.statusCode, 400)
    assert.match(rejected.json().error, /1-1000 chars/)
  } finally {
    await server.close()
  }
})

test('task comments can be edited and deleted', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Editable Comment Workspace', slug: `editable-comments-${Date.now()}` },
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
      payload: { projectId: project.id, title: 'Editable comment task' },
    })
    assert.equal(taskResponse.statusCode, 201)
    const task = taskResponse.json()

    const created = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/comments`,
      payload: { content: 'First comment' },
    })
    assert.equal(created.statusCode, 201)

    const commentsResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/comments`,
    })
    assert.equal(commentsResponse.statusCode, 200)
    const comment = commentsResponse.json().find((row: any) => row.action === 'comment')
    assert.ok(comment)

    const edited = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}/comments/${comment.id}`,
      payload: { content: 'Updated comment' },
    })
    assert.equal(edited.statusCode, 200)
    assert.equal(JSON.parse(edited.json().changes).content, 'Updated comment')

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}/comments/${comment.id}`,
    })
    assert.equal(deleted.statusCode, 204)

    const remainingResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/comments`,
    })
    assert.equal(remainingResponse.statusCode, 200)
    assert.equal(remainingResponse.json().some((row: any) => row.id === comment.id), false)
  } finally {
    await server.close()
  }
})

test('task descriptions allow 5000 chars and reject longer text', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Description Workspace', slug: `descriptions-${Date.now()}` },
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

    const accepted = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Long description task',
        description: 'x'.repeat(5000),
      },
    })
    assert.equal(accepted.statusCode, 201)
    const task = accepted.json()

    const rejectedCreate = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Too long description task',
        description: 'x'.repeat(5001),
      },
    })
    assert.equal(rejectedCreate.statusCode, 400)
    assert.match(rejectedCreate.json().error, /5000 chars or less/)

    const rejectedUpdate = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      payload: { description: 'x'.repeat(5001) },
    })
    assert.equal(rejectedUpdate.statusCode, 400)
    assert.match(rejectedUpdate.json().error, /5000 chars or less/)
  } finally {
    await server.close()
  }
})

test('dueNextWeek filter returns tasks in the next Monday-first calendar week', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Next Week Workspace', slug: `next-week-${Date.now()}` },
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

    const nextWeekStart = startOfNextMondayFirstWeek()
    const outsideBefore = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Before next week',
        dueDate: localDateKey(addDays(nextWeekStart, -1)),
      },
    })
    assert.equal(outsideBefore.statusCode, 201)

    const inside = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Inside next week',
        dueDate: localDateKey(nextWeekStart),
      },
    })
    assert.equal(inside.statusCode, 201)
    const insideTask = inside.json()

    const outsideAfter = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'After next week',
        dueDate: localDateKey(addDays(nextWeekStart, 7)),
      },
    })
    assert.equal(outsideAfter.statusCode, 201)

    const listResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/project/${project.id}?filter=dueNextWeek`,
    })
    assert.equal(listResponse.statusCode, 200)
    assert.deepEqual(listResponse.json().map((row: any) => row.id), [insideTask.id])
  } finally {
    await server.close()
  }
})

test('project task list includes subtask completion counts', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Subtask Workspace', slug: `subtasks-${Date.now()}` },
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
      payload: { projectId: project.id, title: 'Parent task' },
    })
    assert.equal(taskResponse.statusCode, 201)
    const task = taskResponse.json()

    const firstSubtask = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: 'Done subtask' },
    })
    assert.equal(firstSubtask.statusCode, 201)
    const doneSubtask = firstSubtask.json()

    const secondSubtask = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: 'Open subtask' },
    })
    assert.equal(secondSubtask.statusCode, 201)

    const completeResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/subtasks/${doneSubtask.id}`,
      payload: { archived: true },
    })
    assert.equal(completeResponse.statusCode, 200)
    assert.equal(completeResponse.json().archived, true)

    const listResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/project/${project.id}`,
    })
    assert.equal(listResponse.statusCode, 200)
    const listedTask = listResponse.json().find((row: any) => row.id === task.id)
    assert.equal(listedTask.subtaskTotal, 2)
    assert.equal(listedTask.subtaskCompleted, 1)
  } finally {
    await server.close()
  }
})
