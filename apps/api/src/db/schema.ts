import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'

function generateId() {
  return crypto.randomUUID()
}

function now() {
  return Math.floor(Date.now() / 1000)
}

// Workspaces
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Projects
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Status definitions
export const statusDefinitions = sqliteTable('status_definitions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  color: text('color').default('#6B7280'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Tasks
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  projectId: text('project_id').notNull(),
  parentId: text('parent_id'),
  title: text('title').notNull(),
  description: text('description'),
  statusId: text('status_id'),
  priority: integer('priority').notNull().default(2),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  startDate: integer('start_date', { mode: 'timestamp' }),
  dueDateNatural: text('due_date_natural'),
  assignee: text('assignee'),
  labels: text('labels').default('[]'),
  position: integer('position').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  recurring: text('recurring'),
  recurringEnd: integer('recurring_end', { mode: 'timestamp' }),
  dependsOn: text('depends_on').default('[]'),
  aiSuggestedPriority: integer('ai_suggested_priority'),
  aiSuggestedDueDate: integer('ai_suggested_due_date', { mode: 'timestamp' }),
  aiReasoning: text('ai_reasoning'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Activity log
export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  taskId: text('task_id').notNull(),
  userId: text('user_id'),
  action: text('action').notNull(),
  changes: text('changes').default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Tags
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  color: text('color').default('#6B7280'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Task-tags join table
export const taskTags = sqliteTable('task_tags', {
  taskId: text('task_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (t) => ({
  pk: primaryKey({ columns: [t.taskId, t.tagId] }),
}))

// Workspace members
export const workspaceMembers = sqliteTable('workspace_members', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})
