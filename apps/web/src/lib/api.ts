export const API_BASE = import.meta.env?.VITE_API_URL || '/api'
const API_KEY_STORAGE_KEY = 'focusclaw.apiKey'

function getSavedApiKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function authHeaders(): HeadersInit {
  const key = getSavedApiKey()
  return key ? { 'x-api-key': key } : {}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hasBody = options.body && options.body !== undefined
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(readApiError(error) || `HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? JSON.parse(text) : undefined as T
}

function readApiError(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Some endpoints may return plain text.
  }
  return raw
}

// Tasks
export const taskApi = {
  list: (projectId: string, params?: { sort?: string; order?: string; filter?: string; includeArchived?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.sort) searchParams.set('sort', params.sort)
    if (params?.order) searchParams.set('order', params.order)
    if (params?.filter) searchParams.set('filter', params.filter)
    if (params?.includeArchived) searchParams.set('includeArchived', 'true')
    const qs = searchParams.toString()
    return request<any[]>(`/tasks/project/${projectId}${qs ? `?${qs}` : ''}`)
  },

  getComments: (taskId: string) =>
    request<any[]>(`/tasks/${taskId}/comments`),
  addComment: (taskId: string, content: string) =>
    request<any>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  updateComment: (taskId: string, commentId: string, content: string) =>
    request<any>(`/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  deleteComment: (taskId: string, commentId: string) =>
    request<void>(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE', headers: {} }),
  get: (taskId: string) =>
    request<any>(`/tasks/${taskId}`),
  create: (data: {
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
  }) =>
    request<any>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (taskId: string, data: Partial<{
    title: string
    description: string
    statusId: string
    priority: number
    dueDate: string | null
    assignee: string | null
    projectId: string
    labels: string[]
    archived: boolean
    parentId: string
    recurring: string
    recurringEnd: string
    dependsOn: string[]
  }>) =>
    request<any>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  finish: (taskId: string) =>
    request<{ success: boolean; recurring: boolean }>(`/tasks/${taskId}/complete`, {
      method: 'POST',
    }),
  reorder: (projectId: string, taskIds: string[]) =>
    request<{ success: boolean }>('/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ projectId, taskIds }),
    }),
  // Subtasks
  getSubtasks: (taskId: string) =>
    request<any[]>(`/tasks/${taskId}/subtasks`),
  addSubtask: (taskId: string, data: { title: string; description?: string; priority?: number }) =>
    request<any>(`/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSubtask: (subtaskId: string, data: Partial<{ title: string; description: string; priority: number; archived: boolean }>) =>
    request<any>(`/tasks/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  // CSV Export
  exportCSV: () => {
    return `${API_BASE}/tasks/export`
  },

  // Delete
  delete: (taskId: string) =>
    request<void>(`/tasks/${taskId}`, { method: 'DELETE', headers: {} }),

  // Subtasks
  deleteSubtask: (subtaskId: string) =>
    request<void>(`/tasks/subtasks/${subtaskId}`, { method: 'DELETE', headers: {} }),
}

// Workspaces
export const workspaceApi = {
  list: () => request<any[]>('/workspaces'),
  get: (slug: string) => request<any>(`/workspaces/${slug}`),
  create: (name: string, slug: string) =>
    request<any>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    }),
  update: (id: string, data: { name?: string; slug?: string }) =>
    request<any>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
}

// Projects
export const projectApi = {
  list: (workspaceId: string) =>
    request<any[]>(`/projects/workspace/${workspaceId}`),
  create: (workspaceId: string, name: string, description?: string) =>
    request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, name, ...(description ? { description } : {}) }),
    }),
  update: (projectId: string, data: { name?: string; description?: string | null }) =>
    request<any>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (projectId: string, options: { mode: 'deleteTasks' | 'moveTasks'; targetProjectId?: string }) =>
    request<{ deletedProjectId: string; movedToProjectId?: string; movedTaskCount: number; deletedTaskCount: number }>(`/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify(options),
    }),
}

// Tags
export const tagApi = {
  list: (_projectId?: string) =>
    request<any[]>('/tags'),
  create: (_projectId: string | undefined, name: string, color?: string) =>
    request<any>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<any>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ deletedTagId: string; updatedTaskCount: number }>(`/tags/${id}`, { method: 'DELETE', headers: {} }),
}

export interface LocalBackupInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface BackupSettings {
  dailyTime: string
  lastAutomaticSnapshotDate: string
  lastAutomaticSnapshotTime: string
}

function filenameFromContentDisposition(header: string | null): string {
  const fallback = `focusclaw-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.focusclawbackup`
  if (!header) return fallback
  const match = header.match(/filename="([^"]+)"/)
  return match?.[1] || fallback
}

export const backupApi = {
  list: () => request<LocalBackupInfo[]>('/backups'),
  getSettings: () => request<BackupSettings>('/backups/settings'),
  updateSettings: (dailyTime: string) =>
    request<BackupSettings>('/backups/settings', {
      method: 'PUT',
      body: JSON.stringify({ dailyTime }),
    }),
  createSnapshot: () =>
    request<LocalBackupInfo & { kind: 'manual' | 'automatic' }>('/backups/snapshots', {
      method: 'POST',
    }),
  restoreSnapshot: (fileName: string) =>
    request<{ success: boolean; safetyBackupPath: string; restoredAt: string; metadata: { appVersion: string; schemaVersion: string; exportedAt: string } }>(`/backups/snapshots/${encodeURIComponent(fileName)}/restore`, {
      method: 'POST',
    }),
  deleteSnapshot: (fileName: string) =>
    request<void>(`/backups/snapshots/${encodeURIComponent(fileName)}`, { method: 'DELETE', headers: {} }),
  exportSnapshotEncrypted: async (fileName: string, passphrase: string) => {
    const response = await fetch(`${API_BASE}/backups/snapshots/${encodeURIComponent(fileName)}/export`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(readApiError(error) || `HTTP ${response.status}`)
    }

    return {
      blob: await response.blob(),
      filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
    }
  },
  exportEncrypted: (passphrase: string) =>
    request<LocalBackupInfo & { metadata: { appVersion: string; schemaVersion: string; exportedAt: string } }>('/backups/export', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    }),
  importEncrypted: (params: { passphrase: string; fileName?: string; fileContentBase64?: string }) =>
    request<{ success: boolean; safetyBackupPath: string; importedAt: string; metadata: { appVersion: string; schemaVersion: string; exportedAt: string } }>('/backups/import', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  delete: (fileName: string) =>
    request<void>(`/backups/${encodeURIComponent(fileName)}`, { method: 'DELETE', headers: {} }),
  downloadUrl: (fileName: string) =>
    `${API_BASE}/backups/download/${encodeURIComponent(fileName)}`,
}

export const apiKey = {
  get: () => getSavedApiKey(),
  set: (key: string) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, key)
    } catch {
      // API key persistence is best-effort for local-first browser use.
    }
  },
  clear: () => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(API_KEY_STORAGE_KEY)
    } catch {
      // API key persistence is best-effort for local-first browser use.
    }
  },
}
