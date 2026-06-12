import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database, { Database as BetterSqliteDatabase } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = resolve(moduleDir, '../../../../data/focusclaw.db')
const configuredPath = process.env.DATABASE_URL?.replace(/^sqlite:/, '')
export const DB_PATH = configuredPath ? resolve(configuredPath) : DEFAULT_DB_PATH

mkdirSync(dirname(DB_PATH), { recursive: true })

export const sqlite: BetterSqliteDatabase = new Database(DB_PATH)

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db

// Initialize tables if they don't exist
function initSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS status_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT '#6B7280',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES tasks(id),
      title TEXT NOT NULL,
      description TEXT,
      status_id TEXT REFERENCES status_definitions(id),
      priority INTEGER NOT NULL DEFAULT 2,
      due_date INTEGER,
      start_date INTEGER,
      due_date_natural TEXT,
      assignee TEXT,
      labels TEXT DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      recurring TEXT,
      recurring_end INTEGER,
      depends_on TEXT DEFAULT '[]',
      ai_suggested_priority INTEGER,
      ai_suggested_due_date INTEGER,
      ai_reasoning TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT,
      action TEXT NOT NULL,
      changes TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6B7280',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks(status_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);
  `)
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>
  if (!columns.some((row) => row.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }
}

function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

function migrateTagsToUniversal() {
  const columns = sqlite.pragma('table_info(tags)') as Array<{ name: string }>
  const hasProjectId = columns.some((row) => row.name === 'project_id')
  const rows = sqlite.prepare(`SELECT id, name, color, created_at FROM tags ORDER BY created_at, id`).all() as Array<{ id: string; name: string; color: string | null; created_at: number }>
  const updateTag = sqlite.prepare('UPDATE tags SET name = ? WHERE id = ?')
  const repointTaskTags = sqlite.prepare('UPDATE OR IGNORE task_tags SET tag_id = ? WHERE tag_id = ?')
  const deleteTaskTagRefs = sqlite.prepare('DELETE FROM task_tags WHERE tag_id = ?')
  const deleteTag = sqlite.prepare('DELETE FROM tags WHERE id = ?')
  const seen = new Map<string, string>()
  const canonicalRows = new Map<string, { id: string; name: string; color: string | null; created_at: number }>()

  const tx = sqlite.transaction(() => {
    for (const row of rows) {
      const normalized = normalizeTagName(row.name)
      if (!normalized) {
        deleteTaskTagRefs.run(row.id)
        deleteTag.run(row.id)
        continue
      }

      const existingId = seen.get(normalized)
      if (existingId) {
        repointTaskTags.run(existingId, row.id)
        deleteTaskTagRefs.run(row.id)
        deleteTag.run(row.id)
        continue
      }

      seen.set(normalized, row.id)
      canonicalRows.set(normalized, { ...row, name: normalized })
      if (!hasProjectId && row.name !== normalized) updateTag.run(normalized, row.id)
    }

  })

  tx()
  if (hasProjectId) {
    sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      sqlite.exec(`
        DROP INDEX IF EXISTS idx_tags_project_id;
        DROP INDEX IF EXISTS idx_tags_project_name;
        CREATE TABLE tags_universal (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#6B7280',
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        DROP TABLE tags;
        ALTER TABLE tags_universal RENAME TO tags;
      `)
      const insertUniversalTag = sqlite.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
      const insertTx = sqlite.transaction(() => {
        for (const row of canonicalRows.values()) {
          insertUniversalTag.run(row.id, row.name, row.color, row.created_at)
        }
      })
      insertTx()
    } finally {
      sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name)')
}

function normalizeLegacyTaskLabelsToTags() {
  const selectTasks = sqlite.prepare('SELECT id, project_id, labels FROM tasks WHERE labels IS NOT NULL AND labels != ?')
  const selectTag = sqlite.prepare('SELECT id FROM tags WHERE name = ? LIMIT 1')
  const insertTag = sqlite.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, unixepoch())')
  const insertTaskTag = sqlite.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, unixepoch())')
  const updateTaskLabels = sqlite.prepare('UPDATE tasks SET labels = ? WHERE id = ?')
  const rows = selectTasks.all('[]') as Array<{ id: string; project_id: string; labels: string | null }>

  const tx = sqlite.transaction(() => {
    for (const row of rows) {
      let labels: unknown
      try {
        labels = row.labels ? JSON.parse(row.labels) : []
      } catch {
        labels = []
      }
      if (!Array.isArray(labels)) continue

      const normalizedLabels: string[] = []
      for (const raw of labels) {
        if (typeof raw !== 'string') continue
        const normalized = normalizeTagName(raw)
        if (!normalized) continue
        normalizedLabels.push(normalized)

        let tagId: string | undefined
        const existing = selectTag.get(normalized) as { id: string } | undefined
        if (existing) {
          tagId = existing.id
        } else {
          tagId = crypto.randomUUID()
          insertTag.run(tagId, normalized, '#6B7280')
        }

        insertTaskTag.run(row.id, tagId)
      }
      updateTaskLabels.run(JSON.stringify([...new Set(normalizedLabels)]), row.id)
    }
  })

  tx()
}

initSchema()
migrateTagsToUniversal()
normalizeLegacyTaskLabelsToTags()
