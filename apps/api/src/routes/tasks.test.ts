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

test('API_KEY is required when API host is not loopback', async () => {
  delete process.env.API_KEY
  process.env.API_HOST = '0.0.0.0'
  try {
    await assert.rejects(() => createServer(), /API_KEY is required/)
  } finally {
    delete process.env.API_HOST
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

test('task descriptions allow 10000 chars and reject longer text', async () => {
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
        description: 'x'.repeat(10000),
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
        description: 'x'.repeat(10001),
      },
    })
    assert.equal(rejectedCreate.statusCode, 400)
    assert.match(rejectedCreate.json().error, /10000 chars or less/)

    const rejectedUpdate = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      payload: { description: 'x'.repeat(10001) },
    })
    assert.equal(rejectedUpdate.statusCode, 400)
    assert.match(rejectedUpdate.json().error, /10000 chars or less/)
  } finally {
    await server.close()
  }
})

test('agent-friendly tasks route lists all tasks and supports workspace/project filters', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Agent Workspace', slug: `agent-routes-${Date.now()}` },
    })
    assert.equal(workspaceResponse.statusCode, 201)
    const workspace = workspaceResponse.json()

    const otherWorkspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Other Agent Workspace', slug: `other-agent-routes-${Date.now()}` },
    })
    assert.equal(otherWorkspaceResponse.statusCode, 201)
    const otherWorkspace = otherWorkspaceResponse.json()

    const firstProjectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: workspace.id, name: 'Content' },
    })
    assert.equal(firstProjectResponse.statusCode, 201)
    const firstProject = firstProjectResponse.json()

    const secondProjectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: workspace.id, name: 'Ops' },
    })
    assert.equal(secondProjectResponse.statusCode, 201)
    const secondProject = secondProjectResponse.json()

    const outsideProjectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: otherWorkspace.id, name: 'Outside' },
    })
    assert.equal(outsideProjectResponse.statusCode, 201)
    const outsideProject = outsideProjectResponse.json()

    const contentTaskResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: firstProject.id, title: 'Review generated draft' },
    })
    assert.equal(contentTaskResponse.statusCode, 201)
    const contentTask = contentTaskResponse.json()

    const opsTaskResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: secondProject.id, title: 'Check API aliases' },
    })
    assert.equal(opsTaskResponse.statusCode, 201)
    const opsTask = opsTaskResponse.json()

    const outsideTaskResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: outsideProject.id, title: 'Outside workspace task' },
    })
    assert.equal(outsideTaskResponse.statusCode, 201)
    const outsideTask = outsideTaskResponse.json()

    const workspaceTasks = await server.inject({
      method: 'GET',
      url: `/api/tasks?workspaceId=${workspace.id}`,
    })
    assert.equal(workspaceTasks.statusCode, 200)
    assert.deepEqual(
      workspaceTasks.json().map((row: any) => row.id).sort(),
      [contentTask.id, opsTask.id].sort(),
    )

    const projectTasks = await server.inject({
      method: 'GET',
      url: `/api/tasks?projectId=${firstProject.id}`,
    })
    assert.equal(projectTasks.statusCode, 200)
    assert.deepEqual(projectTasks.json().map((row: any) => row.id), [contentTask.id])

    const allTasks = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    })
    assert.equal(allTasks.statusCode, 200)
    const allTaskIds = allTasks.json().map((row: any) => row.id)
    assert.ok(allTaskIds.includes(contentTask.id))
    assert.ok(allTaskIds.includes(opsTask.id))
    assert.ok(allTaskIds.includes(outsideTask.id))
  } finally {
    await server.close()
  }
})

test('agent-friendly projects route supports workspaceId query', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Project Alias Workspace', slug: `project-alias-${Date.now()}` },
    })
    assert.equal(workspaceResponse.statusCode, 201)
    const workspace = workspaceResponse.json()

    const otherWorkspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Other Project Alias Workspace', slug: `other-project-alias-${Date.now()}` },
    })
    assert.equal(otherWorkspaceResponse.statusCode, 201)
    const otherWorkspace = otherWorkspaceResponse.json()

    const includedProjectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: workspace.id, name: 'Included Project' },
    })
    assert.equal(includedProjectResponse.statusCode, 201)
    const includedProject = includedProjectResponse.json()

    const excludedProjectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: otherWorkspace.id, name: 'Excluded Project' },
    })
    assert.equal(excludedProjectResponse.statusCode, 201)
    const excludedProject = excludedProjectResponse.json()

    const projectsResponse = await server.inject({
      method: 'GET',
      url: `/api/projects?workspaceId=${workspace.id}`,
    })
    assert.equal(projectsResponse.statusCode, 200)
    assert.deepEqual(projectsResponse.json().map((row: any) => row.id), [includedProject.id])
    assert.equal(projectsResponse.json().some((row: any) => row.id === excludedProject.id), false)
  } finally {
    await server.close()
  }
})

test('task attachments can be added, listed, and deleted as metadata', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Attachment Workspace', slug: `attachments-${Date.now()}` },
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
      payload: { projectId: project.id, title: 'Task with attachment' },
    })
    assert.equal(taskResponse.statusCode, 201)
    const task = taskResponse.json()

    const created = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments`,
      payload: {
        name: 'Draft carousel',
        kind: 'pdf',
        uri: '/tmp/focusclaw-fixtures/carousel.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
      },
    })
    assert.equal(created.statusCode, 201)
    const attachment = created.json()
    assert.equal(attachment.taskId, task.id)
    assert.equal(attachment.name, 'Draft carousel')
    assert.equal(attachment.kind, 'pdf')
    assert.equal(attachment.uri, 'file:///tmp/focusclaw-fixtures/carousel.pdf')

    const taskWithAttachment = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    })
    assert.equal(taskWithAttachment.statusCode, 200)
    assert.equal(taskWithAttachment.json().attachmentTotal, 1)

    const renamed = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}/attachments/${attachment.id}`,
      payload: { name: 'Renamed carousel' },
    })
    assert.equal(renamed.statusCode, 200)
    assert.equal(renamed.json().name, 'Renamed carousel')
    assert.equal(renamed.json().uri, 'file:///tmp/focusclaw-fixtures/carousel.pdf')

    const rejectedUrl = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments`,
      payload: {
        name: 'Website',
        kind: 'file',
        uri: 'https://example.com/file.pdf',
      },
    })
    assert.equal(rejectedUrl.statusCode, 400)

    const rejectedUrlKind = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments`,
      payload: {
        name: 'Reference page',
        kind: 'url',
        uri: 'https://example.com/file.pdf',
      },
    })
    assert.equal(rejectedUrlKind.statusCode, 400)

    const rejectedPdf = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments`,
      payload: {
        name: 'Not a PDF',
        kind: 'pdf',
        uri: '/tmp/focusclaw-fixtures/photo.png',
      },
    })
    assert.equal(rejectedPdf.statusCode, 400)

    const blockedApp = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments`,
      payload: {
        name: 'Do not open',
        kind: 'file',
        uri: '/tmp/focusclaw-fixtures/Example.app',
      },
    })
    assert.equal(blockedApp.statusCode, 201)
    const blockedOpen = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments/${blockedApp.json().id}/open`,
    })
    assert.equal(blockedOpen.statusCode, 400)
    assert.match(blockedOpen.json().error, /cannot be opened/i)

    const missingOpen = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/attachments/${attachment.id}/open`,
    })
    assert.equal(missingOpen.statusCode, 404)
    assert.match(missingOpen.json().error, /File not found/i)

    const listed = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/attachments`,
    })
    assert.equal(listed.statusCode, 200)
    assert.deepEqual(listed.json().map((row: any) => row.id), [attachment.id, blockedApp.json().id])
    assert.equal(listed.json()[0].name, 'Renamed carousel')

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}/attachments/${attachment.id}`,
    })
    assert.equal(deleted.statusCode, 204)

    const deletedBlockedApp = await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}/attachments/${blockedApp.json().id}`,
    })
    assert.equal(deletedBlockedApp.statusCode, 204)

    const remaining = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/attachments`,
    })
    assert.equal(remaining.statusCode, 200)
    assert.deepEqual(remaining.json(), [])
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

test('dueTomorrow filter returns tasks due on the next local calendar day', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Tomorrow Workspace', slug: `tomorrow-${Date.now()}` },
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = addDays(today, 1)

    const todayTask = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Due today',
        dueDate: localDateKey(today),
      },
    })
    assert.equal(todayTask.statusCode, 201)

    const tomorrowTaskResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Due tomorrow',
        dueDate: localDateKey(tomorrow),
      },
    })
    assert.equal(tomorrowTaskResponse.statusCode, 201)
    const tomorrowTask = tomorrowTaskResponse.json()

    const dayAfterTomorrowTask = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        projectId: project.id,
        title: 'Due later',
        dueDate: localDateKey(addDays(tomorrow, 1)),
      },
    })
    assert.equal(dayAfterTomorrowTask.statusCode, 201)

    const listResponse = await server.inject({
      method: 'GET',
      url: `/api/tasks/project/${project.id}?filter=dueTomorrow`,
    })
    assert.equal(listResponse.statusCode, 200)
    assert.deepEqual(listResponse.json().map((row: any) => row.id), [tomorrowTask.id])
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

test('project task search matches comments and subtasks', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Search Workspace', slug: `search-${Date.now()}` },
    })
    assert.equal(workspaceResponse.statusCode, 201)
    const workspace = workspaceResponse.json()

    const projectResponse = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { workspaceId: workspace.id, name: 'Search Project' },
    })
    assert.equal(projectResponse.statusCode, 201)
    const project = projectResponse.json()

    const parentResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: project.id, title: 'Parent task' },
    })
    assert.equal(parentResponse.statusCode, 201)
    const parent = parentResponse.json()

    const otherResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId: project.id, title: 'Unrelated task' },
    })
    assert.equal(otherResponse.statusCode, 201)

    const subtaskResponse = await server.inject({
      method: 'POST',
      url: `/api/tasks/${parent.id}/subtasks`,
      payload: { title: 'Passport renewal checklist' },
    })
    assert.equal(subtaskResponse.statusCode, 201)
    const subtask = subtaskResponse.json()

    const commentResponse = await server.inject({
      method: 'POST',
      url: `/api/tasks/${parent.id}/comments`,
      payload: { content: 'UCSD insurance note' },
    })
    assert.equal(commentResponse.statusCode, 201)

    const commentSearch = await server.inject({
      method: 'GET',
      url: `/api/tasks/project/${project.id}?q=ucsd`,
    })
    assert.equal(commentSearch.statusCode, 200)
    assert.deepEqual(commentSearch.json().map((row: any) => row.id), [parent.id])

    const subtaskSearch = await server.inject({
      method: 'GET',
      url: `/api/tasks/project/${project.id}?q=passport`,
    })
    assert.equal(subtaskSearch.statusCode, 200)
    assert.deepEqual(subtaskSearch.json().map((row: any) => row.id), [parent.id, subtask.id])
    assert.equal(subtaskSearch.json().some((row: any) => row.title === 'Unrelated task'), false)
  } finally {
    await server.close()
  }
})

test('weekday due text does not automatically create recurring tasks', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Recurring Workspace', slug: `recurring-${Date.now()}` },
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
      payload: {
        projectId: project.id,
        title: 'Fix all bugs',
        description: 'Make sure this is done by Friday!',
      },
    })
    assert.equal(taskResponse.statusCode, 201)
    assert.equal(taskResponse.json().recurring, null)
  } finally {
    await server.close()
  }
})

test('explicit recurring option creates recurring tasks', async () => {
  const server = await createServer()
  try {
    const workspaceResponse = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Explicit Recurring Workspace', slug: `explicit-recurring-${Date.now()}` },
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
      payload: {
        projectId: project.id,
        title: 'Review weekly metrics',
        recurring: 'weekly',
      },
    })
    assert.equal(taskResponse.statusCode, 201)
    assert.equal(taskResponse.json().recurring, 'weekly')

    const clearResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskResponse.json().id}`,
      payload: { recurring: null },
    })
    assert.equal(clearResponse.statusCode, 200)
    assert.equal(clearResponse.json().recurring, null)
  } finally {
    await server.close()
  }
})
