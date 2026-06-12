import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import { Type } from '@sinclair/typebox'

type PluginConfig = {
  apiUrl?: string
  apiKey?: string
  workspaceSlug?: string
  defaultProjectId?: string
}

type Project = {
  id: string
  name: string
  workspaceId: string
}

type Task = {
  id: string
  projectId: string
  title: string
  description?: string | null
  statusId?: string | null
  priority?: number
  dueDate?: string | null
  assignee?: string | null
  labels?: string | string[]
  tags?: Array<{ name: string }>
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}

type ToolContext = { pluginConfig?: unknown }

const dueRanges = ['today', 'overdue', 'week'] as const
type DueRange = typeof dueRanges[number]

const CreateTaskParams = Type.Object({
  title: Type.String({ description: 'Task title' }),
  description: Type.Optional(Type.String({ description: 'Task description (markdown supported)' })),
  projectId: Type.String({ description: 'Project ID to create task in' }),
  statusId: Type.Optional(Type.String({ description: 'Status ID (for example Backlog, In Progress, Done)' })),
  priority: Type.Optional(Type.Integer({ description: 'Priority: 1=Critical, 2=High, 3=Medium, 4=Low', default: 2 })),
  dueDate: Type.Optional(Type.String({ description: 'Due date in ISO format, for example 2026-05-01' })),
  assigneeId: Type.Optional(Type.String({ description: 'Owner label or user ID to assign the task to' })),
  labels: Type.Optional(Type.Array(Type.String(), { description: 'Labels/tags for the task' })),
})

const ListTasksParams = Type.Object({
  projectId: Type.String({ description: 'Project ID to list tasks from' }),
  status: Type.Optional(Type.String({ description: 'Filter by status, for example Backlog, In Progress, Done' })),
  priority: Type.Optional(Type.Integer({ description: 'Filter by priority: 1=Critical, 2=High, 3=Medium, 4=Low' })),
  assigneeId: Type.Optional(Type.String({ description: 'Filter by assignee user ID or owner label' })),
  includeArchived: Type.Optional(Type.Boolean({ description: 'Include archived/completed tasks', default: false })),
})

const ListOpenTasksParams = Type.Object({
  project: Type.Optional(Type.String({ description: 'Optional project name or project ID. Omit for open tasks across all projects.' })),
  includeDetails: Type.Optional(Type.Boolean({ description: 'Include task IDs, tags, descriptions, and owner labels. Defaults to false for compact chat output.', default: false })),
  limit: Type.Optional(Type.Integer({ description: 'Maximum tasks to show across all projects. Defaults to 40.', default: 40 })),
})

const ListDueTasksParams = Type.Object({
  range: Type.Union([
    Type.Literal('today'),
    Type.Literal('overdue'),
    Type.Literal('week'),
  ], { description: 'Due-date filter: today, overdue, or week' }),
  project: Type.Optional(Type.String({ description: 'Optional project name or project ID. Omit for matching tasks across all projects.' })),
  includeDetails: Type.Optional(Type.Boolean({ description: 'Include task IDs, tags, descriptions, and owner labels. Defaults to false for compact chat output.', default: false })),
  limit: Type.Optional(Type.Integer({ description: 'Maximum tasks to show across all projects. Defaults to 40.', default: 40 })),
})

const PlainTextCommandParams = Type.Object({
  command: Type.String({ description: 'Plain-text read-only FocusClaw command, for example focusclaw help, focusclaw today, focusclaw overdue, focusclaw week, or focusclaw project Launch Plan.' }),
})

const FindTaskParams = Type.Object({
  query: Type.String({ description: 'Task title search text. Use this before update/complete/delete so the user does not need task IDs.' }),
  project: Type.Optional(Type.String({ description: 'Optional project name or project ID to narrow the search.' })),
  includeArchived: Type.Optional(Type.Boolean({ description: 'Include completed/archived tasks in search results.', default: false })),
  limit: Type.Optional(Type.Integer({ description: 'Maximum matches to return. Defaults to 10.', default: 10 })),
})

const GetTaskParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to retrieve. Use focusclaw_find_task first when the user described the task by title.' }),
})

const UpdateTaskParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to update. Use focusclaw_find_task first when the user described the task by title.' }),
  title: Type.Optional(Type.String({ description: 'New title' })),
  description: Type.Optional(Type.String({ description: 'New description' })),
  statusId: Type.Optional(Type.String({ description: 'New status ID' })),
  priority: Type.Optional(Type.Integer({ description: 'New priority: 1=Critical, 2=High, 3=Medium, 4=Low' })),
  dueDate: Type.Optional(Type.String({ description: 'New due date in ISO format, or null via JSON to clear it' })),
  assigneeId: Type.Optional(Type.String({ description: 'New owner label or assignee user ID' })),
  labels: Type.Optional(Type.Array(Type.String(), { description: 'Replacement labels/tags' })),
  archived: Type.Optional(Type.Boolean({ description: 'Archive or unarchive the task' })),
})

const CompleteTaskParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to mark as complete. Use focusclaw_find_task first when the user described the task by title.' }),
})

const DeleteTaskParams = Type.Object({
  taskId: Type.String({ description: 'Task ID to permanently delete. This is destructive; confirm with the user before calling this tool.' }),
})

function getConfig(context: ToolContext): Required<Pick<PluginConfig, 'apiUrl'>> & PluginConfig {
  const config = context.pluginConfig as PluginConfig | undefined
  return { ...config, apiUrl: config?.apiUrl || 'http://localhost:3001' }
}

function headers(config: PluginConfig, hasBody = false): Record<string, string> {
  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
  }
}

async function apiRequest<T>(config: PluginConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...headers(config, init.body !== undefined),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? JSON.parse(text) as T : undefined as T
}

async function loadProjects(config: PluginConfig): Promise<Project[]> {
  if (config.workspaceSlug) {
    const workspace = await apiRequest<{ id: string }>(config, `/api/workspaces/${encodeURIComponent(config.workspaceSlug)}`)
    return apiRequest<Project[]>(config, `/api/projects/workspace/${workspace.id}`)
  }

  const workspaces = await apiRequest<Array<{ id: string }>>(config, '/api/workspaces')
  const projectLists = await Promise.all(workspaces.map((workspace) => apiRequest<Project[]>(config, `/api/projects/workspace/${workspace.id}`)))
  return projectLists.flat()
}

function matchesProject(project: Project, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return project.id === query || project.name.toLowerCase() === normalized || project.name.toLowerCase().includes(normalized)
}

async function resolveProjects(config: PluginConfig, projectQuery?: string): Promise<Project[]> {
  const projects = await loadProjects(config)
  if (projectQuery?.trim()) {
    const matches = projects.filter((project) => matchesProject(project, projectQuery))
    if (matches.length === 0) {
      throw new Error(`No FocusClaw project matched "${projectQuery}".`)
    }
    return matches
  }

  if (projects.length > 0) return projects
  if (config.defaultProjectId) {
    const project = await apiRequest<Project>(config, `/api/projects/${config.defaultProjectId}`)
    return [project]
  }
  return []
}

async function loadTasksForProjects(config: PluginConfig, projects: Project[], includeArchived = false): Promise<Array<Task & { projectName: string }>> {
  const taskLists = await Promise.all(projects.map(async (project) => {
    const qs = includeArchived ? '?includeArchived=true' : ''
    const tasks = await apiRequest<Task[]>(config, `/api/tasks/project/${project.id}${qs}`)
    return tasks.map((task) => ({ ...task, projectName: project.name }))
  }))
  return taskLists.flat()
}

function startOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function dueFilter(task: Task, range: DueRange): boolean {
  if (task.archived || !task.dueDate) return false
  const due = new Date(task.dueDate)
  const today = startOfToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  if (range === 'today') return due >= today && due < tomorrow
  if (range === 'overdue') return due < today
  return due >= today && due < nextWeek
}

function formatDate(value?: string | null): string {
  if (!value) return 'no date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString().split('T')[0]
}

function statusSignal(task: Task): string {
  if (task.archived) return 'completed'
  if (task.dueDate) {
    const due = new Date(task.dueDate)
    const today = startOfToday()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (due < today) return `overdue ${formatDate(task.dueDate)}`
    if (due < tomorrow) return 'due today'
    return `due ${formatDate(task.dueDate)}`
  }
  return task.statusId || 'open'
}

function labelsFor(task: Task): string[] {
  if (Array.isArray(task.tags)) return task.tags.map((tag) => tag.name)
  if (Array.isArray(task.labels)) return task.labels
  if (typeof task.labels === 'string') {
    try {
      const parsed = JSON.parse(task.labels)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function formatGroupedTasks(tasks: Array<Task & { projectName: string }>, options: { includeDetails?: boolean; limit?: number; emptyText: string }): string {
  const limit = Math.max(1, options.limit ?? 40)
  const visibleTasks = tasks.slice(0, limit)
  if (visibleTasks.length === 0) return options.emptyText

  const groups = new Map<string, Array<Task & { projectName: string }>>()
  for (const task of visibleTasks) {
    const group = groups.get(task.projectName) || []
    group.push(task)
    groups.set(task.projectName, group)
  }

  const lines: string[] = []
  for (const [projectName, projectTasks] of groups) {
    lines.push(projectName)
    for (const task of projectTasks) {
      const detailBits = options.includeDetails
        ? [
            `id ${task.id}`,
            task.assignee ? `owner ${task.assignee}` : '',
            labelsFor(task).length ? `tags ${labelsFor(task).join(', ')}` : '',
            task.description ? `notes ${task.description}` : '',
          ].filter(Boolean).join('; ')
        : ''
      lines.push(`- ${task.title} (${statusSignal(task)})${detailBits ? ` — ${detailBits}` : ''}`)
    }
  }

  if (tasks.length > visibleTasks.length) {
    lines.push(`...and ${tasks.length - visibleTasks.length} more.`)
  }

  return lines.join('\n')
}

function plainTextHelp(): string {
  return [
    'FocusClaw read-only commands:',
    '- focusclaw help - show this help',
    '- focusclaw today - tasks due today',
    '- focusclaw overdue - overdue open tasks',
    '- focusclaw week - tasks due this week',
    '- focusclaw project [project name] - open tasks for one project',
    '',
    'For changes, ask naturally: "Add a task...", "Mark ... complete", or "Delete the task about...".',
  ].join('\n')
}

function sortOpenTasks(tasks: Array<Task & { projectName: string }>): Array<Task & { projectName: string }> {
  return [...tasks].sort((a, b) => {
    if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName)
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.title.localeCompare(b.title)
  })
}

function toolText(text: string) {
  return { content: [{ type: 'text', text }] }
}

function toolError(prefix: string, err: unknown) {
  return {
    content: [{ type: 'text', text: `${prefix}: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  }
}

export default definePluginEntry({
  id: 'focusclaw',
  name: 'FocusClaw',
  description: 'Agent-native task management. Read compact task status, then create, update, complete, or delete tasks in FocusClaw from OpenClaw.',
  register(api) {
    api.registerTool({
      name: 'focusclaw_plain_text_command',
      description: 'Read-only handler for simple plain-text FocusClaw commands such as focusclaw help, focusclaw today, focusclaw overdue, focusclaw week, and focusclaw project name. Does not create, edit, complete, or delete tasks.',
      parameters: PlainTextCommandParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        const command = params.command.trim().replace(/\s+/g, ' ')
        const lower = command.toLowerCase()
        const prefix = 'focusclaw'

        if (lower === `${prefix} help` || lower === 'help') return toolText(plainTextHelp())
        if (lower !== prefix && !lower.startsWith(`${prefix} `)) {
          return toolText(plainTextHelp())
        }

        const rest = lower === prefix ? '' : command.slice(prefix.length).trim()
        try {
          if (!rest) {
            return toolText(plainTextHelp())
          }

          if (rest === 'today' || rest === 'overdue' || rest === 'week') {
            const projects = await resolveProjects(config)
            const tasks = sortOpenTasks(await loadTasksForProjects(config, projects, false).then((items) => items.filter((task) => dueFilter(task, rest))))
            return toolText(formatGroupedTasks(tasks, { emptyText: `No open tasks found for ${rest}.` }))
          }

          const projectPrefix = 'project '
          if (!rest.toLowerCase().startsWith(projectPrefix)) {
            return toolText(plainTextHelp())
          }

          const projectName = rest.slice(projectPrefix.length).trim()
          if (!projectName) return toolText(plainTextHelp())

          const projects = await resolveProjects(config, projectName)
          const tasks = sortOpenTasks(await loadTasksForProjects(config, projects, false))
          return toolText(formatGroupedTasks(tasks, { emptyText: `No open tasks found for ${projectName}.` }))
        } catch (err) {
          return toolError('Error running FocusClaw command', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_list_open_tasks',
      description: 'Compact read-only summary of open FocusClaw tasks grouped by project. Supports all projects or an optional project name/ID. Defaults hide tags, descriptions, and task IDs for Telegram/plain-text status.',
      parameters: ListOpenTasksParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const projects = await resolveProjects(config, params.project)
          const tasks = sortOpenTasks(await loadTasksForProjects(config, projects, false))
          return toolText(formatGroupedTasks(tasks, {
            includeDetails: params.includeDetails,
            limit: params.limit,
            emptyText: params.project ? `No open tasks found for ${params.project}.` : 'No open tasks found.',
          }))
        } catch (err) {
          return toolError('Error listing open tasks', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_list_due_tasks',
      description: 'Compact read-only summary of open FocusClaw tasks due today, overdue, or due this week, grouped by project. Optional project name/ID filter. Defaults hide tags, descriptions, and task IDs.',
      parameters: ListDueTasksParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const projects = await resolveProjects(config, params.project)
          const tasks = sortOpenTasks(await loadTasksForProjects(config, projects, false).then((items) => items.filter((task) => dueFilter(task, params.range))))
          return toolText(formatGroupedTasks(tasks, {
            includeDetails: params.includeDetails,
            limit: params.limit,
            emptyText: `No open tasks found for ${params.range}.`,
          }))
        } catch (err) {
          return toolError('Error listing due tasks', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_find_task',
      description: 'Find FocusClaw tasks by title and optional project name/ID so users do not need to copy task IDs before update, complete, or delete actions.',
      parameters: FindTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const projects = await resolveProjects(config, params.project)
          const query = params.query.trim().toLowerCase()
          const tasks = sortOpenTasks(await loadTasksForProjects(config, projects, params.includeArchived))
            .filter((task) => task.title.toLowerCase().includes(query))
          return toolText(formatGroupedTasks(tasks, {
            includeDetails: true,
            limit: params.limit ?? 10,
            emptyText: `No tasks matched "${params.query}".`,
          }))
        } catch (err) {
          return toolError('Error finding tasks', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_create_task',
      description: 'Create a new task in FocusClaw. Use natural user phrasing to infer title/details, then call this tool with a project ID.',
      parameters: CreateTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const task = await apiRequest<Task>(config, '/api/tasks', {
            method: 'POST',
            body: JSON.stringify({
              projectId: params.projectId,
              title: params.title,
              description: params.description,
              statusId: params.statusId,
              priority: params.priority ?? 2,
              dueDate: params.dueDate,
              assignee: params.assigneeId,
              labels: params.labels,
            }),
          })
          return toolText(`Created: ${task.title} (${statusSignal(task)})`)
        } catch (err) {
          return toolError('Error creating task', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_list_tasks',
      description: 'Legacy project-ID task list. Prefer focusclaw_list_open_tasks for user-facing compact summaries.',
      parameters: ListTasksParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const searchParams = new URLSearchParams()
          if (params.status) searchParams.set('status', params.status)
          if (params.priority) searchParams.set('priority', String(params.priority))
          if (params.assigneeId) searchParams.set('assigneeId', params.assigneeId)
          if (params.includeArchived) searchParams.set('includeArchived', 'true')

          const qs = searchParams.toString()
          const tasks = await apiRequest<Task[]>(config, `/api/tasks/project/${params.projectId}${qs ? `?${qs}` : ''}`)
          const rows = tasks
            .filter((task) => params.includeArchived || !task.archived)
            .filter((task) => params.priority === undefined || task.priority === params.priority)
            .filter((task) => !params.status || task.statusId === params.status)
            .map((task) => `- ${task.title} (${statusSignal(task)})`)
            .join('\n')
          return toolText(rows || 'No tasks found in this project.')
        } catch (err) {
          return toolError('Error listing tasks', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_get_task',
      description: 'Get full details of a specific FocusClaw task. Use focusclaw_find_task first when the user describes a task by title.',
      parameters: GetTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          const task = await apiRequest<Task>(config, `/api/tasks/${params.taskId}`)
          const labels = labelsFor(task)
          return toolText([
            task.title,
            `ID: ${task.id}`,
            `Status: ${task.archived ? 'completed' : task.statusId || 'open'}`,
            `Priority: ${task.priority ?? 'none'}`,
            `Due: ${formatDate(task.dueDate)}`,
            `Owner: ${task.assignee || 'unassigned'}`,
            `Tags: ${labels.length ? labels.join(', ') : 'none'}`,
            `Description: ${task.description || 'none'}`,
          ].join('\n'))
        } catch (err) {
          return toolError('Error fetching task', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_update_task',
      description: 'Update a FocusClaw task after identifying it with focusclaw_find_task when needed. Use this for natural-language edit requests.',
      parameters: UpdateTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        const { taskId, assigneeId, ...updates } = params
        const payload = { ...updates, ...(assigneeId !== undefined ? { assignee: assigneeId } : {}) }
        try {
          const task = await apiRequest<Task>(config, `/api/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
          return toolText(`Updated: ${task.title} (${statusSignal(task)})`)
        } catch (err) {
          return toolError('Error updating task', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_complete_task',
      description: 'Mark a FocusClaw task complete after identifying it with focusclaw_find_task when needed.',
      parameters: CompleteTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          await apiRequest(config, `/api/tasks/${params.taskId}/complete`, { method: 'POST' })
          return toolText('Task marked complete.')
        } catch (err) {
          return toolError('Error completing task', err)
        }
      },
    })

    api.registerTool({
      name: 'focusclaw_delete_task',
      description: 'Permanently delete a FocusClaw task. This is destructive: agents should confirm the exact task with the user before calling this tool, and should use focusclaw_find_task first when the user did not provide an ID.',
      parameters: DeleteTaskParams,
      async execute(_id, params, context) {
        const config = getConfig(context)
        try {
          await apiRequest(config, `/api/tasks/${params.taskId}`, { method: 'DELETE' })
          return toolText('Task deleted.')
        } catch (err) {
          return toolError('Error deleting task', err)
        }
      },
    })
  },
})
