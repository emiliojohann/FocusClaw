import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export type FocusClawConfig = {
  apiUrl: string
  apiKey?: string
  timeoutMs: number
}

type Task = {
  id: string
  projectId: string
  title: string
  statusId?: string | null
  archived?: boolean
}

type Project = {
  id: string
  workspaceId: string
  name: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FocusClawConfig {
  const rawUrl = env.FOCUSCLAW_API_URL || 'http://127.0.0.1:3001'
  const parsed = new URL(rawUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('FOCUSCLAW_API_URL must use http or https.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('FOCUSCLAW_API_URL must not contain credentials.')
  }

  const timeoutMs = Number(env.FOCUSCLAW_MCP_TIMEOUT_MS || '10000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    throw new Error('FOCUSCLAW_MCP_TIMEOUT_MS must be between 100 and 120000.')
  }

  return {
    apiUrl: parsed.toString().replace(/\/$/, ''),
    apiKey: env.FOCUSCLAW_API_KEY || undefined,
    timeoutMs,
  }
}

export class FocusClawClient {
  constructor(private readonly config: FocusClawConfig) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {}),
        ...init.headers,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      let message = `FocusClaw API returned HTTP ${response.status}.`
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string }
        message = parsed.error || parsed.message || message
      } catch {
        // Do not echo arbitrary HTML or proxy responses into the model context.
      }
      throw new Error(message)
    }

    if (response.status === 204) return undefined as T
    const text = await response.text()
    return text ? JSON.parse(text) as T : undefined as T
  }
}

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  }
}

function failure(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Unknown FocusClaw error.' }],
    isError: true,
  }
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function guarded(handler: (args: any) => Promise<unknown>) {
  return async (args: any) => {
    try {
      return result(await handler(args))
    } catch (error) {
      return failure(error)
    }
  }
}

export function createFocusClawServer(config: FocusClawConfig): McpServer {
  const client = new FocusClawClient(config)
  const server = new McpServer({
    name: 'focusclaw',
    version: '2026.9.1-1',
  }, {
    instructions: [
      'Use FocusClaw as the user-owned source of truth for projects and tasks.',
      'Find tasks by title before asking the user for IDs.',
      'Use focusclaw_complete_task for completion so recurring tasks are handled correctly.',
      'Never call focusclaw_delete_task without explicit confirmation for the exact task.',
      'Owner labels coordinate work; they do not grant authority or start execution.',
    ].join(' '),
  })

  server.registerTool('focusclaw_health', {
    description: 'Check whether the local FocusClaw API is reachable.',
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async () => client.request('/health')))

  server.registerTool('focusclaw_list_workspaces', {
    description: 'List FocusClaw workspaces. Use this before listing projects when the workspace is unknown.',
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async () => client.request('/api/workspaces')))

  server.registerTool('focusclaw_list_projects', {
    description: 'List FocusClaw projects, optionally within one workspace.',
    inputSchema: {
      workspaceId: z.string().optional().describe('Optional workspace ID'),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async ({ workspaceId }) => client.request(`/api/projects${queryString({ workspaceId })}`)))

  server.registerTool('focusclaw_list_tasks', {
    description: 'List FocusClaw tasks, optionally filtered by workspace, project, archive state, or search text.',
    inputSchema: {
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
      includeArchived: z.boolean().optional().default(false),
      query: z.string().optional().describe('Search title, description, project, tags, comments, and subtasks'),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async ({ workspaceId, projectId, includeArchived, query }) => client.request(`/api/tasks${queryString({
    workspaceId,
    projectId,
    includeArchived: includeArchived || undefined,
    q: query,
  })}`)))

  server.registerTool('focusclaw_find_task', {
    description: 'Find FocusClaw tasks by natural search text before updating, completing, commenting on, or deleting a task.',
    inputSchema: {
      query: z.string().min(1),
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
      includeArchived: z.boolean().optional().default(false),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async ({ query, workspaceId, projectId, includeArchived }) => client.request(`/api/tasks${queryString({
    q: query,
    workspaceId,
    projectId,
    includeArchived: includeArchived || undefined,
  })}`)))

  server.registerTool('focusclaw_get_task', {
    description: 'Get one FocusClaw task by ID. Prefer focusclaw_find_task when the user supplied a title.',
    inputSchema: { taskId: z.string().min(1) },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, guarded(async ({ taskId }) => client.request(`/api/tasks/${encodeURIComponent(taskId)}`)))

  server.registerTool('focusclaw_create_task', {
    description: 'Create a FocusClaw task in a known project.',
    inputSchema: {
      projectId: z.string().min(1),
      title: z.string().min(1).max(500),
      description: z.string().max(10000).optional(),
      priority: z.number().int().min(1).max(4).optional(),
      dueDate: z.string().optional().describe('ISO date or date-time'),
      assignee: z.string().optional().describe('Coordination label or assignee ID'),
      labels: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, guarded(async (args) => client.request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(args),
  })))

  server.registerTool('focusclaw_update_task', {
    description: 'Update a FocusClaw task. Use lifecycle=inProgress or lifecycle=todo for those states; use focusclaw_complete_task for Done.',
    inputSchema: {
      taskId: z.string().min(1),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(10000).nullable().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      dueDate: z.string().nullable().optional(),
      assignee: z.string().nullable().optional(),
      labels: z.array(z.string()).optional(),
      archived: z.boolean().optional(),
      highlight: z.boolean().optional(),
      statusId: z.string().nullable().optional(),
      lifecycle: z.enum(['todo', 'inProgress']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, guarded(async ({ taskId, lifecycle, ...updates }) => {
    let lifecycleStatusId: string | null | undefined
    if (lifecycle === 'todo') {
      lifecycleStatusId = null
    } else if (lifecycle === 'inProgress') {
      const task = await client.request<Task>(`/api/tasks/${encodeURIComponent(taskId)}`)
      const project = await client.request<Project>(`/api/projects/${encodeURIComponent(task.projectId)}`)
      const status = await client.request<{ id: string }>(`/api/tasks/statuses/${encodeURIComponent(project.workspaceId)}/in-progress`, { method: 'POST' })
      lifecycleStatusId = status.id
    }

    return client.request(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...updates,
        ...(lifecycleStatusId !== undefined ? { statusId: lifecycleStatusId, archived: false } : {}),
      }),
    })
  }))

  server.registerTool('focusclaw_complete_task', {
    description: 'Complete a FocusClaw task through the lifecycle endpoint so recurring tasks are handled correctly.',
    inputSchema: { taskId: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, guarded(async ({ taskId }) => client.request(`/api/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST' })))

  server.registerTool('focusclaw_add_comment', {
    description: 'Add a comment to a FocusClaw task.',
    inputSchema: {
      taskId: z.string().min(1),
      content: z.string().min(1).max(1000),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, guarded(async ({ taskId, content }) => client.request(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })))

  server.registerTool('focusclaw_add_subtask', {
    description: 'Add a subtask under a FocusClaw task.',
    inputSchema: {
      taskId: z.string().min(1),
      title: z.string().min(1).max(500),
      description: z.string().max(10000).optional(),
      priority: z.number().int().min(1).max(4).optional(),
      dueDate: z.string().optional(),
      assignee: z.string().optional(),
      labels: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, guarded(async ({ taskId, ...body }) => client.request(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })))

  server.registerTool('focusclaw_delete_task', {
    description: 'Permanently delete one exact FocusClaw task. Only call after the user explicitly confirms deletion of that task.',
    inputSchema: {
      taskId: z.string().min(1),
      confirmed: z.literal(true).describe('Must be true only after explicit user confirmation'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, guarded(async ({ taskId }) => {
    await client.request(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' })
    return { deletedTaskId: taskId }
  }))

  return server
}
