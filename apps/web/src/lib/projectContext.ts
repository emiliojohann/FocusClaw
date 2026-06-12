import { projectApi, workspaceApi } from '@/lib/api'

export interface WorkspaceRecord {
  id: string
  name: string
  slug?: string
}

export interface ProjectRecord {
  id: string
  name: string
}

const ACTIVE_PROJECT_KEY = 'focusclaw.activeProjectId'

function getStoredProjectId(workspaceId: string): string {
  if (typeof window === 'undefined') return ''
  const scoped = window.localStorage.getItem(`${ACTIVE_PROJECT_KEY}:${workspaceId}`)
  if (scoped) return scoped
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || ''
}

export function setStoredProjectId(workspaceId: string, projectId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
  window.localStorage.setItem(`${ACTIVE_PROJECT_KEY}:${workspaceId}`, projectId)
}

function pickActiveProjectId(projects: ProjectRecord[], preferredId: string): string {
  if (projects.length === 0) return ''
  if (preferredId && projects.some((p) => p.id === preferredId)) return preferredId
  return projects[0].id
}

export async function ensureProjectContext(): Promise<{
  workspace: WorkspaceRecord
  projects: ProjectRecord[]
  activeProjectId: string
}> {
  const workspaces = await workspaceApi.list() as WorkspaceRecord[]
  let workspace = workspaces[0]

  if (!workspace) {
    workspace = await workspaceApi.create('My Workspace', 'default') as WorkspaceRecord
  }

  let projects = await projectApi.list(workspace.id) as ProjectRecord[]
  if (projects.length === 0) {
    const created = await projectApi.create(workspace.id, 'My Project') as ProjectRecord
    projects = [created]
  }

  const activeProjectId = pickActiveProjectId(projects, getStoredProjectId(workspace.id))
  setStoredProjectId(workspace.id, activeProjectId)

  return { workspace, projects, activeProjectId }
}
