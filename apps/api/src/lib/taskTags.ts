import { sqlite } from '../db'

export interface CanonicalTag {
  id: string
  name: string
  color: string | null
  createdAt: number | Date
}

type RawTagRow = {
  id: string
  name: string
  color: string | null
  created_at: number
}

export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

function parseLabelNames(labels: unknown): string[] {
  if (Array.isArray(labels)) return labels.filter((label): label is string => typeof label === 'string')
  if (typeof labels !== 'string') return []

  try {
    const parsed = JSON.parse(labels)
    return Array.isArray(parsed) ? parsed.filter((label): label is string => typeof label === 'string') : []
  } catch {
    return []
  }
}

function toCanonicalTag(row: RawTagRow): CanonicalTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  }
}

export function getTaskTags(taskId: string): CanonicalTag[] {
  const rows = sqlite.prepare(`
    SELECT tags.id, tags.name, tags.color, tags.created_at
    FROM task_tags
    JOIN tags ON tags.id = task_tags.tag_id
    WHERE task_tags.task_id = ?
    ORDER BY tags.name
  `).all(taskId) as RawTagRow[]

  return rows.map(toCanonicalTag)
}

export function getTaskTagsMap(taskIds: string[]): Map<string, CanonicalTag[]> {
  const tagMap = new Map<string, CanonicalTag[]>()
  if (taskIds.length === 0) return tagMap

  const placeholders = taskIds.map(() => '?').join(',')
  const rows = sqlite.prepare(`
    SELECT task_tags.task_id, tags.id, tags.name, tags.color, tags.created_at
    FROM task_tags
    JOIN tags ON tags.id = task_tags.tag_id
    WHERE task_tags.task_id IN (${placeholders})
    ORDER BY tags.name
  `).all(...taskIds) as Array<RawTagRow & { task_id: string }>

  for (const row of rows) {
    const current = tagMap.get(row.task_id) || []
    current.push(toCanonicalTag(row))
    tagMap.set(row.task_id, current)
  }

  return tagMap
}

export function hydrateTaskWithTags<T extends { id: string; labels?: unknown }>(task: T): T & { tags: CanonicalTag[]; labels: string } {
  const canonicalTags = getTaskTags(task.id)
  const names = canonicalTags.length > 0
    ? canonicalTags.map((tag) => tag.name)
    : parseLabelNames(task.labels).map(normalizeTagName).filter(Boolean)

  return {
    ...task,
    tags: canonicalTags,
    labels: JSON.stringify(names),
  }
}

export function hydrateTasksWithTags<T extends { id: string; labels?: unknown }>(tasks: T[]): Array<T & { tags: CanonicalTag[]; labels: string }> {
  const tagMap = getTaskTagsMap(tasks.map((task) => task.id))

  return tasks.map((task) => {
    const canonicalTags = tagMap.get(task.id) || []
    const names = canonicalTags.length > 0
      ? canonicalTags.map((tag) => tag.name)
      : parseLabelNames(task.labels).map(normalizeTagName).filter(Boolean)

    return {
      ...task,
      tags: canonicalTags,
      labels: JSON.stringify(names),
    }
  })
}

export function ensureTags(names: string[]): CanonicalTag[] {
  const selectTag = sqlite.prepare('SELECT id, name, color, created_at FROM tags WHERE name = ? LIMIT 1')
  const insertTag = sqlite.prepare('INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, unixepoch())')

  const uniqueNames = [...new Set(names.map(normalizeTagName).filter(Boolean))]
  const result: CanonicalTag[] = []

  for (const name of uniqueNames) {
    let row = selectTag.get(name) as RawTagRow | undefined
    if (!row) {
      insertTag.run(crypto.randomUUID(), name, '#6B7280')
      row = selectTag.get(name) as RawTagRow | undefined
    }
    if (row) result.push(toCanonicalTag(row))
  }

  return result
}

export function replaceTaskTags(taskId: string, projectId: string, labels: string[] = []): CanonicalTag[] {
  void projectId
  const tags = ensureTags(labels)
  const deleteTaskTags = sqlite.prepare('DELETE FROM task_tags WHERE task_id = ?')
  const insertTaskTag = sqlite.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, unixepoch())')
  const updateTaskLabels = sqlite.prepare('UPDATE tasks SET labels = ?, updated_at = unixepoch() WHERE id = ?')

  const tx = sqlite.transaction(() => {
    deleteTaskTags.run(taskId)
    for (const tag of tags) {
      insertTaskTag.run(taskId, tag.id)
    }
    updateTaskLabels.run(JSON.stringify(tags.map((tag) => tag.name)), taskId)
  })

  tx()
  return tags
}

export function syncTaskLabelCache(taskId: string): void {
  const names = getTaskTags(taskId).map((tag) => tag.name)
  sqlite.prepare('UPDATE tasks SET labels = ?, updated_at = unixepoch() WHERE id = ?').run(JSON.stringify(names), taskId)
}

export function syncAllTaskLabelCaches(): void {
  const rows = sqlite.prepare('SELECT id FROM tasks').all() as Array<{ id: string }>
  const tx = sqlite.transaction(() => {
    for (const row of rows) syncTaskLabelCache(row.id)
  })
  tx()
}

export function removeTagFromTasks(tagId: string, tagName: string): number {
  const normalizedName = normalizeTagName(tagName)
  if (!tagId || !normalizedName) return 0

  const taskRows = sqlite.prepare(`
    SELECT
      tasks.id,
      tasks.labels,
      EXISTS (
        SELECT 1 FROM task_tags
        WHERE task_tags.task_id = tasks.id
          AND task_tags.tag_id = ?
      ) AS has_tag
    FROM tasks
    WHERE has_tag = 1
      OR (tasks.labels IS NOT NULL AND tasks.labels != '[]')
  `).all(tagId) as Array<{ id: string; labels: string | null; has_tag: number }>

  const deleteTaskTag = sqlite.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?')
  const selectRemainingTaskTags = sqlite.prepare(`
    SELECT tags.name
    FROM task_tags
    JOIN tags ON tags.id = task_tags.tag_id
    WHERE task_tags.task_id = ?
    ORDER BY tags.name
  `)
  const updateTaskLabels = sqlite.prepare('UPDATE tasks SET labels = ?, updated_at = unixepoch() WHERE id = ?')

  let updatedTaskCount = 0
  const tx = sqlite.transaction(() => {
    for (const task of taskRows) {
      const labelNames = parseLabelNames(task.labels).map(normalizeTagName).filter(Boolean)
      const nextLabelNames = labelNames.filter((label) => label !== normalizedName)
      const labelChanged = nextLabelNames.length !== labelNames.length
      const hadTaskTag = Number(task.has_tag) === 1

      if (!hadTaskTag && !labelChanged) continue

      if (hadTaskTag) deleteTaskTag.run(task.id, tagId)

      const remainingTagNames = (selectRemainingTaskTags.all(task.id) as Array<{ name: string }>)
        .map((tag) => normalizeTagName(tag.name))
        .filter(Boolean)
      const mergedNames = [...new Set([...nextLabelNames, ...remainingTagNames])]
      updateTaskLabels.run(JSON.stringify(mergedNames), task.id)
      updatedTaskCount += 1
    }
  })

  tx()
  return updatedTaskCount
}
