import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db'
import { tasks, statusDefinitions, activityLog, projects, workspaces } from '../db/schema'
import { eq, asc, desc, and, isNull } from 'drizzle-orm'
import { hydrateTaskWithTags, hydrateTasksWithTags, replaceTaskTags } from '../lib/taskTags'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMMENT_MAX_LENGTH = 1000
const DESCRIPTION_MAX_LENGTH = 5000

function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s)
}

function addSubtaskCounts<T extends { id: string }>(taskRows: T[], allProjectTasks: Array<{ parentId: string | null; archived: boolean }>): T[] {
  const counts = new Map<string, { total: number; completed: number }>()

  for (const task of allProjectTasks) {
    if (!task.parentId) continue
    const current = counts.get(task.parentId) || { total: 0, completed: 0 }
    current.total += 1
    if (task.archived) current.completed += 1
    counts.set(task.parentId, current)
  }

  return taskRows.map((task) => {
    const count = counts.get(task.id)
    return {
      ...task,
      subtaskTotal: count?.total ?? 0,
      subtaskCompleted: count?.completed ?? 0,
    }
  })
}

function isTooLong(value: string | undefined, maxLength: number): boolean {
  return value !== undefined && value.length > maxLength
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfNextMondayFirstWeek(today: Date): Date {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const dayOffset = (8 - start.getDay()) % 7 || 7
  start.setDate(start.getDate() + dayOffset)
  return start
}

function parseDueDateInput(input: string): Date {
  const dateOnlyMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
  }
  return new Date(input)
}

function taskDueDateKey(dueDate: Date | string | null): string | null {
  if (!dueDate) return null
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate)
  if (Number.isNaN(date.getTime())) return null

  // Older date-picker tasks were saved from YYYY-MM-DD as UTC midnight.
  // Preserve the intended calendar day for those records.
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0

  return isUtcMidnight ? date.toISOString().slice(0, 10) : localDateKey(date)
}

function readActivityChanges(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────
// Natural Language Date Parser
// ─────────────────────────────────────────────
// Lightweight parser for common date expressions — no external deps needed.
// Handles: "today", "tomorrow", "next [day]", "in X days", "next week", "monday-sunday" (standalone or as next X)
function parseNaturalDate(input: string): { dueDate: Date | null; reasoning: string } {
  const now = new Date()
  const lower = input.toLowerCase().trim()

  // today
  if (/\btoday\b/.test(lower)) {
    return { dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59), reasoning: 'Parsed "today"' }
  }

  // tomorrow
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 1)
    return { dueDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), reasoning: 'Parsed "tomorrow"' }
  }

  // in X days / in X weeks
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+(days?|weeks?)\b/)
  if (inDaysMatch) {
    const num = parseInt(inDaysMatch[1])
    const unit = inDaysMatch[2]
    const d = new Date(now)
    if (unit.startsWith('day')) d.setDate(d.getDate() + num)
    else d.setDate(d.getDate() + num * 7)
    return { dueDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), reasoning: `Parsed "in ${num} ${unit}"` }
  }

  // next week
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 7)
    return { dueDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), reasoning: 'Parsed "next week"' }
  }

  // next [day name] — find the next occurrence of that day
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const nextDayMatch = lower.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[1])
    if (targetDay !== -1) {
      const d = new Date(now)
      const diff = (targetDay - d.getDay() + 7) % 7 || 7  // if same day, go to next week
      d.setDate(d.getDate() + diff)
      return { dueDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), reasoning: `Parsed "next ${nextDayMatch[1]}"` }
    }
  }

  // standalone day names: "monday", "friday" → next occurrence
  const singleDayMatch = lower.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)
  if (singleDayMatch) {
    const targetDay = dayNames.indexOf(singleDayMatch[0])
    const d = new Date(now)
    const diff = (targetDay - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return { dueDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), reasoning: `Parsed "${singleDayMatch[0]}"` }
  }

  // priority keywords
  if (/\b(critical|urgent|asap)\b/.test(lower)) {
    return { dueDate: null, reasoning: 'Detected critical priority keyword' }
  }

  return { dueDate: null, reasoning: 'No natural date detected' }
}

// Smart priority detection from keywords
function detectPriorityFromText(input: string): number {
  const lower = input.toLowerCase()
  if (/\b(critical|urgent|asap|p0)\b/.test(lower)) return 1
  if (/\b(high|important|p1)\b/.test(lower)) return 2
  if (/\b(medium|normal|p2)\b/.test(lower)) return 3
  if (/\b(low|p3)\b/.test(lower)) return 4
  return 2 // default high
}

// Detect recurring patterns
function detectRecurring(input: string): string | null {
  const lower = input.toLowerCase()
  if (/\bdaily\b/.test(lower)) return 'daily'
  if (/\bweekly\b/.test(lower)) return 'weekly'
  if (/\bmonthly\b/.test(lower)) return 'monthly'
  if (/\bbiweekly\b/.test(lower)) return 'biweekly'
  if (/\bevery\s+(\d+)\s+days?\b/.test(lower)) {
    const m = lower.match(/\bevery\s+(\d+)\s+days?\b/)
    return m ? `every ${m[1]} days` : null
  }
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (const day of dayNames) {
    if (new RegExp(`\\b${day}\\b`).test(lower)) return `every ${day}`
  }
  return null
}

export async function taskRoutes(fastify: FastifyInstance) {
  // Create task — with natural language support
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const {
      projectId,
      title,
      description,
      statusId,
      priority,
      dueDate,
      assignee,
      labels,
      parentId,
      recurring,
      recurringEnd,
      dependsOn,
    } = request.body as {
      projectId: string
      title: string
      description?: string
      statusId?: string
      priority?: number
      dueDate?: string
      assignee?: string | null
      labels?: string[]
      parentId?: string
      recurring?: string
      recurringEnd?: string
      dependsOn?: string[]
    }

    if (!projectId || !title) {
      return reply.status(400).send({ error: 'projectId and title are required' })
    }
    if (isTooLong(description, DESCRIPTION_MAX_LENGTH)) {
      return reply.status(400).send({ error: `Description must be ${DESCRIPTION_MAX_LENGTH} chars or less` })
    }

    // ── Natural Language Parsing ──────────────────────────────────────────
    const combinedText = `${title} ${description || ''}`
    const { dueDate: nlDueDate, reasoning: dateReasoning } = parseNaturalDate(combinedText)
    const nlPriority = priority ?? detectPriorityFromText(combinedText)
    const nlRecurring = recurring ?? detectRecurring(combinedText)

    // Use NL-parsed date if no explicit dueDate provided
    const finalDueDate = dueDate
      ? (dueDate ? parseDueDateInput(dueDate) : undefined)
      : (nlDueDate || undefined)

    const aiReasoning = [
      dateReasoning,
      nlPriority !== 2 ? `Priority detected: ${nlPriority}` : '',
      nlRecurring ? `Recurring detected: ${nlRecurring}` : '',
    ].filter(Boolean).join('; ')

    // ── Position (for root tasks, or subtasks) ─────────────────────────────
    let position = 0
    if (parentId) {
      // Subtasks get appended to end of parent
      const siblings = await db.select({ maxPos: tasks.position })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId)))
        .orderBy(desc(tasks.position))
        .limit(1)
      position = siblings.length > 0 ? siblings[0].maxPos + 1 : 0
    } else {
      const rootTasks = await db.select({ maxPos: tasks.position })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
        .orderBy(desc(tasks.position))
        .limit(1)
      position = rootTasks.length > 0 ? rootTasks[0].maxPos + 1 : 0
    }

    // ── Dependencies ────────────────────────────────────────────────────────
    const dependsOnJson = dependsOn && dependsOn.length > 0 ? JSON.stringify(dependsOn) : '[]'

    const [task] = await db.insert(tasks).values({
      projectId,
      title,
      description: description ?? null,
      statusId: statusId ?? null,
      priority: nlPriority,
      dueDate: finalDueDate || null,
      assignee: assignee?.trim() || null,
      labels: '[]',
      position,
      parentId: parentId ?? null,
      recurring: nlRecurring ?? null,
      recurringEnd: recurringEnd ? new Date(recurringEnd) : null,
      dependsOn: dependsOnJson,
      dueDateNatural: nlDueDate ? combinedText.match(/\b(next\s+\w+|today|tomorrow|\w+)\b/i)?.[0] ?? null : null,
      aiReasoning: aiReasoning || null
    }).returning()

    if (!task) return reply.status(500).send({ error: 'Failed to create task' })
    const canonicalTags = replaceTaskTags(task.id, projectId, labels || [])

    // Log activity
    await db.insert(activityLog).values({
      taskId: task.id,
      action: 'created',
      changes: JSON.stringify({ title, priority: nlPriority, statusId, aiReasoning }),
      userId: undefined
    })

    return reply.status(201).send({
      ...task,
      tags: canonicalTags,
      labels: JSON.stringify(canonicalTags.map((tag) => tag.name)),
    })
  })

  // List tasks by project
  fastify.get('/project/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as { projectId: string }
    const { sort, order, filter, includeArchived } = request.query as {
      sort?: 'priority' | 'dueDate' | 'createdAt'
      order?: 'asc' | 'desc'
      filter?: 'all' | 'dueToday' | 'dueThisWeek' | 'dueNextWeek' | 'pastDue' | 'noDate' | 'archived'
      includeArchived?: string
    }

    // Validate UUID format before querying
    if (!isValidUUID(projectId)) {
      return reply.send([])
    }

    // Validate project exists
    const projectExists = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    if (projectExists.length === 0) {
      return reply.send([])
    }

    // Open tasks always stay above completed tasks; selected sort applies within each group.
    const sortField = sort === 'dueDate' ? tasks.dueDate : sort === 'createdAt' ? tasks.createdAt : tasks.priority
    const sortDirection = order === 'desc' ? desc(sortField) : asc(sortField)

    const allProjectTasks = await db.select().from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.archived), sortDirection)
    let result = allProjectTasks

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = localDateKey(today)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekKey = localDateKey(nextWeek)
    const nextCalendarWeekStart = startOfNextMondayFirstWeek(today)
    const nextCalendarWeekEnd = new Date(nextCalendarWeekStart)
    nextCalendarWeekEnd.setDate(nextCalendarWeekEnd.getDate() + 7)
    const nextCalendarWeekStartKey = localDateKey(nextCalendarWeekStart)
    const nextCalendarWeekEndKey = localDateKey(nextCalendarWeekEnd)
    const shouldIncludeArchived = includeArchived === 'true'
    const isVisibleForDateFilter = (task: typeof result[number]) => shouldIncludeArchived || !task.archived

    // Apply filters in JS (simpler than SQL date math)
    // NOTE: 'all' is the default — excludes archived tasks unless includeArchived=true.
    //       Date filters include completed tasks only when includeArchived=true.
    //       'noDate' returns active tasks without a due date unless includeArchived=true.
    //       'archived' explicitly returns only archived tasks (completed tasks).
    if (filter === 'dueToday') {
      result = result.filter(t => isVisibleForDateFilter(t) && taskDueDateKey(t.dueDate) === todayKey)
    } else if (filter === 'dueThisWeek') {
      result = result.filter(t => {
        const dueKey = taskDueDateKey(t.dueDate)
        return isVisibleForDateFilter(t) && dueKey !== null && dueKey >= todayKey && dueKey < nextWeekKey
      })
    } else if (filter === 'dueNextWeek') {
      result = result.filter(t => {
        const dueKey = taskDueDateKey(t.dueDate)
        return isVisibleForDateFilter(t) && dueKey !== null && dueKey >= nextCalendarWeekStartKey && dueKey < nextCalendarWeekEndKey
      })
    } else if (filter === 'pastDue') {
      result = result.filter(t => {
        const dueKey = taskDueDateKey(t.dueDate)
        return isVisibleForDateFilter(t) && dueKey !== null && dueKey < todayKey
      })
    } else if (filter === 'noDate') {
      result = result.filter(t => (shouldIncludeArchived || !t.archived) && !t.dueDate)
    } else if (filter === 'archived') {
      result = result.filter(t => t.archived)
    } else if (!shouldIncludeArchived) {
      // 'all' or undefined — default to active tasks only (exclude archived)
      result = result.filter(t => !t.archived)
    }

    const hydrated = addSubtaskCounts(hydrateTasksWithTags(result), allProjectTasks)
    return reply.send(hydrated)
  })

  // Get single task
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)

    if (result.length === 0) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    return reply.send(hydrateTaskWithTags(result[0]))
  })

  // Update task
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<{
      title: string
      description: string
      statusId: string
      priority: number
      dueDate: string | null
      assignee: string | null
      labels: string[]
      archived: boolean
      position: number
      projectId: string
    }>
    const existingTask = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (existingTask.length === 0) {
      return reply.status(404).send({ error: 'Task not found' })
    }
    if (isTooLong(updates.description, DESCRIPTION_MAX_LENGTH)) {
      return reply.status(400).send({ error: `Description must be ${DESCRIPTION_MAX_LENGTH} chars or less` })
    }

    const setObj: Record<string, any> = { ...updates }
    const nextLabels = updates.labels
    delete setObj.labels
    if (updates.labels !== undefined) {
      setObj.labels = JSON.stringify(updates.labels)
    }
    if (updates.dueDate !== undefined) {
      setObj.dueDate = updates.dueDate ? parseDueDateInput(updates.dueDate) : null
    }
    if (updates.assignee !== undefined) {
      setObj.assignee = updates.assignee?.trim() || null
    }
    setObj.updatedAt = new Date()

    const result = await db.update(tasks)
      .set(setObj)
      .where(eq(tasks.id, id))
      .returning()

    const movedToProject = updates.projectId !== undefined && updates.projectId !== existingTask[0].projectId
    if (nextLabels !== undefined) {
      replaceTaskTags(id, result[0].projectId, nextLabels)
    } else if (movedToProject) {
      const existingTagNames = hydrateTaskWithTags(existingTask[0]).tags.map((tag) => tag.name)
      replaceTaskTags(id, result[0].projectId, existingTagNames)
    }

    // Log activity
    await db.insert(activityLog).values({
      taskId: id,
      action: 'updated',
      changes: JSON.stringify(updates)
    })

    return reply.send(hydrateTaskWithTags(result[0]))
  })

  // Delete task permanently. Completion is handled by POST /:id/complete.
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const existingTask = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1)
    if (existingTask.length === 0) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    await db.delete(tasks).where(eq(tasks.parentId, id))
    await db.delete(tasks).where(eq(tasks.id, id))

    return reply.status(204).send()
  })

  // Get task activity
  fastify.get('/:id/activity', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const result = await db.select().from(activityLog)
      .where(eq(activityLog.taskId, id))
      .orderBy(asc(activityLog.createdAt))

    return reply.send(result)
  })

  // GET /tasks/:id/comments — get comments for a task
  fastify.get('/:id/comments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = await db.select().from(activityLog)
      .where(eq(activityLog.taskId, id))
      .orderBy(asc(activityLog.createdAt))
    return reply.send(result)
  })

  // POST /tasks/:id/comments — add comment to a task
  fastify.post('/:id/comments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: string }
    const nextContent = content?.trim()
    if (!nextContent || nextContent.length > COMMENT_MAX_LENGTH) {
      return reply.status(400).send({ error: `Comment must be 1-${COMMENT_MAX_LENGTH} chars` })
    }
    await db.insert(activityLog).values({
      taskId: id,
      action: 'comment',
      changes: JSON.stringify({ content: nextContent }),
      userId: undefined
    })
    return reply.status(201).send({ success: true })
  })

  // PATCH /tasks/:id/comments/:commentId — edit an existing comment
  fastify.patch('/:id/comments/:commentId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    const { content } = request.body as { content: string }
    const nextContent = content?.trim()
    if (!isValidUUID(id) || !isValidUUID(commentId)) return reply.status(400).send({ error: 'Invalid comment ID' })
    if (!nextContent || nextContent.length > COMMENT_MAX_LENGTH) {
      return reply.status(400).send({ error: `Comment must be 1-${COMMENT_MAX_LENGTH} chars` })
    }

    const existing = await db.select().from(activityLog)
      .where(and(eq(activityLog.id, commentId), eq(activityLog.taskId, id), eq(activityLog.action, 'comment')))
      .limit(1)
    if (existing.length === 0) return reply.status(404).send({ error: 'Comment not found' })

    const [updated] = await db.update(activityLog)
      .set({ changes: JSON.stringify({ ...readActivityChanges(existing[0].changes), content: nextContent }) })
      .where(eq(activityLog.id, commentId))
      .returning()

    return reply.send(updated)
  })

  // DELETE /tasks/:id/comments/:commentId — delete an existing comment
  fastify.delete('/:id/comments/:commentId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as { id: string; commentId: string }
    if (!isValidUUID(id) || !isValidUUID(commentId)) return reply.status(400).send({ error: 'Invalid comment ID' })

    const existing = await db.select({ id: activityLog.id }).from(activityLog)
      .where(and(eq(activityLog.id, commentId), eq(activityLog.taskId, id), eq(activityLog.action, 'comment')))
      .limit(1)
    if (existing.length === 0) return reply.status(404).send({ error: 'Comment not found' })

    await db.delete(activityLog).where(eq(activityLog.id, commentId))
    return reply.status(204).send()
  })

  // Reorder tasks within a project
  fastify.post('/reorder', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, taskIds } = request.body as { projectId: string; taskIds: string[] }

    // Update positions in batch
    await Promise.all(taskIds.map((taskId, index) =>
      db.update(tasks)
        .set({ position: index, updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    ))

    return reply.send({ success: true })
  })

  // Status definitions
  fastify.post('/statuses', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId, name, order, color } = request.body as {
      workspaceId: string
      name: string
      order?: number
      color?: string
    }

    const result = await db.insert(statusDefinitions).values({
      workspaceId,
      name,
      order: order || 0,
      color: color || '#6B7280'
    }).returning()

    return reply.status(201).send(result[0])
  })

  fastify.get('/statuses/:workspaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }

    const result = await db.select().from(statusDefinitions)
      .where(eq(statusDefinitions.workspaceId, workspaceId))
      .orderBy(asc(statusDefinitions.order))

    return reply.send(result)
  })

  // ── Subtasks ──────────────────────────────────────────────────────────────

  // GET /tasks/:id/subtasks — get all subtasks of a task
  fastify.get('/:id/subtasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    if (!isValidUUID(id)) return reply.send([])

    const result = await db.select().from(tasks)
      .where(eq(tasks.parentId, id))
      .orderBy(asc(tasks.position))

    return reply.send(result)
  })

  // POST /tasks/:id/subtasks — add a subtask to a task
  fastify.post('/:id/subtasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { title, description, priority } = request.body as {
      title: string
      description?: string
      priority?: number
    }
    if (!title) return reply.status(400).send({ error: 'title is required' })
    if (isTooLong(description, DESCRIPTION_MAX_LENGTH)) {
      return reply.status(400).send({ error: `Description must be ${DESCRIPTION_MAX_LENGTH} chars or less` })
    }

    // Get the parent task to find its projectId
    const parent = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (parent.length === 0) return reply.status(404).send({ error: 'Parent task not found' })

    const { projectId } = parent[0]

    // Siblings
    const siblings = await db.select({ maxPos: tasks.position })
      .from(tasks)
      .where(eq(tasks.parentId, id))
      .orderBy(desc(tasks.position))
      .limit(1)
    const position = siblings.length > 0 ? siblings[0].maxPos + 1 : 0

    const [subtask] = await db.insert(tasks).values({
      projectId,
      parentId: id,
      title,
      description: description ?? null,
      priority: priority ?? 2,
      position,
    }).returning()

    if (!subtask) return reply.status(500).send({ error: 'Failed to create subtask' })

    return reply.status(201).send(hydrateTaskWithTags(subtask))
  })

  // PATCH /subtasks/:id — update a subtask
  fastify.patch('/subtasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<{
      title: string
      description: string
      priority: number
      archived: boolean
    }>
    if (!isValidUUID(id)) return reply.status(400).send({ error: 'Invalid subtask ID' })

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (existing.length === 0 || !existing[0].parentId) return reply.status(404).send({ error: 'Subtask not found' })
    if (updates.title !== undefined && !updates.title.trim()) return reply.status(400).send({ error: 'title is required' })
    if (isTooLong(updates.description, DESCRIPTION_MAX_LENGTH)) {
      return reply.status(400).send({ error: `Description must be ${DESCRIPTION_MAX_LENGTH} chars or less` })
    }

    const setObj: Record<string, any> = { updatedAt: new Date() }
    if (updates.title !== undefined) setObj.title = updates.title.trim()
    if (updates.description !== undefined) setObj.description = updates.description || null
    if (updates.priority !== undefined) setObj.priority = updates.priority
    if (updates.archived !== undefined) setObj.archived = updates.archived

    const [subtask] = await db.update(tasks)
      .set(setObj)
      .where(eq(tasks.id, id))
      .returning()

    return reply.send(hydrateTaskWithTags(subtask))
  })

  // DELETE /subtasks/:id — delete a subtask
  fastify.delete('/subtasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    if (!isValidUUID(id)) return reply.status(400).send({ error: 'Invalid subtask ID' })

    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (existing.length === 0) return reply.status(404).send({ error: 'Subtask not found' })

    await db.delete(tasks).where(eq(tasks.id, id))
    return reply.status(204).send()
  })

  // ── Recurring Tasks ───────────────────────────────────────────────────────


  // POST /tasks/:id/complete — marks a task complete and creates next recurring instance if applicable
  fastify.post('/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const task = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (!task.length) return reply.status(404).send({ error: 'Task not found' })

    const currentTask = task[0]

    // Archive the current instance
    await db.update(tasks)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(tasks.id, id))

    // Log completion
    await db.insert(activityLog).values({
      taskId: id,
      action: 'completed',
      changes: JSON.stringify({ title: currentTask.title }),
      userId: undefined
    })

    // If recurring, create the next instance
    if (currentTask.recurring) {
      const nextDue = calculateNextRecurringDate(currentTask.recurring, currentTask.dueDate as Date | null)
      const [nextTask] = await db.insert(tasks).values({
        projectId: currentTask.projectId,
        title: currentTask.title,
        description: currentTask.description,
        priority: currentTask.priority,
        dueDate: nextDue,
        recurring: currentTask.recurring,
        position: currentTask.position
      }).returning()
      if (nextTask) {
        replaceTaskTags(nextTask.id, nextTask.projectId, hydrateTaskWithTags(currentTask).tags.map((tag) => tag.name))
      }
    }

    return reply.send({ success: true, recurring: currentTask.recurring ? true : false })
  })

  // ── CSV Export ────────────────────────────────────────────────────────────
  const priorityLabels: Record<number, string> = {
    1: 'Critical',
    2: 'High',
    3: 'Medium',
    4: 'Low'
  }

  const csvEscape = (value: unknown): string => {
    const raw = value == null ? '' : String(value)
    return `"${raw.replace(/"/g, '""')}"`
  }

  const csvHeaders = ['id', 'project', 'title', 'description', 'priority', 'due_date', 'assignee', 'tags', 'status', 'created_at', 'updated_at']

  const buildTasksCsv = (taskRows: Array<any>, projectNameById: Map<string, string>) => {
    const rows = taskRows.map((t: any) => [
      csvEscape(t.id),
      csvEscape(projectNameById.get(t.projectId) || ''),
      csvEscape(t.title || ''),
      csvEscape(t.description || ''),
      csvEscape(priorityLabels[t.priority] || 'Unknown'),
      t.dueDate ? csvEscape(new Date(t.dueDate).toISOString().split('T')[0]) : '',
      csvEscape(t.assignee || ''),
      csvEscape(Array.isArray(t.tags) ? t.tags.map((tag: any) => tag.name).join('; ') : ''),
      csvEscape(t.archived ? 'completed' : 'active'),
      csvEscape(t.createdAt ? new Date(t.createdAt).toISOString() : ''),
      csvEscape(t.updatedAt ? new Date(t.updatedAt).toISOString() : '')
    ])

    return [
      csvHeaders.join(','),
      ...rows.map((r: string[]) => r.join(','))
    ].join('\n')
  }

  // GET /tasks/export — download all tasks across all projects as CSV
  fastify.get('/export', async (_request: FastifyRequest, reply: FastifyReply) => {
    const allProjects = await db.select().from(projects)
    const projectNameById = new Map(allProjects.map((project) => [project.id, project.name]))
    const allTasks = hydrateTasksWithTags(await db.select().from(tasks)
      .orderBy(asc(tasks.projectId), asc(tasks.archived), asc(tasks.priority), asc(tasks.dueDate)))

    const csvContent = buildTasksCsv(allTasks, projectNameById)

    reply.header('Content-Type', 'text/csv')
    const exportedDate = new Date().toISOString().split('T')[0]
    reply.header('Content-Disposition', `attachment; filename="focusclaw-tasks-all-${exportedDate}.csv"`)
    return reply.send(csvContent)
  })

  // GET /tasks/export/:projectId — download project tasks as CSV
  fastify.get('/export/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as { projectId: string }

    if (!isValidUUID(projectId)) {
      return reply.status(400).send({ error: 'Invalid project ID' })
    }

    const projectExists = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    if (projectExists.length === 0) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    // Fetch all tasks for the project, including completed tasks
    const allTasks = hydrateTasksWithTags(await db.select().from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.archived), asc(tasks.priority), asc(tasks.dueDate)))
    const csvContent = buildTasksCsv(allTasks, new Map([[projectId, projectExists[0].name]]))

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="focusclaw-tasks-${projectId.slice(0, 8)}.csv"`)
    return reply.send(csvContent)
  })
}

// Helper: calculate next due date from a recurring pattern
function calculateNextRecurringDate(recurring: string, currentDue: Date | null): Date {
  const from = currentDue ? new Date(currentDue) : new Date()
  const lower = recurring.toLowerCase()


  if (lower === 'daily') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 23, 59, 59)
  }
  if (lower === 'weekly') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7, 23, 59, 59)
  }
  if (lower === 'biweekly') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 14, 23, 59, 59)
  }
  if (lower === 'monthly') {
    return new Date(from.getFullYear(), from.getMonth() + 1, from.getDate(), 23, 59, 59)
  }
  // every X days
  const daysMatch = lower.match(/every\s+(\d+)\s+days?/)
  if (daysMatch) {
    const num = parseInt(daysMatch[1])
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + num, 23, 59, 59)
  }
  // every [day name]
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const d = new Date(from)
      const diff = ((i - d.getDay()) + 7) % 7 || 7
      d.setDate(d.getDate() + diff)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
    }
  }
  // Default: daily
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 23, 59, 59)
}
