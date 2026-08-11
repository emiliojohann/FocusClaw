export interface DashboardStatusCache {
  hydrated: boolean
  inProgressStatusId: string | null
}

export interface DashboardCacheRecord<TTask, TProject, TTag> {
  tasks: TTask[]
  projects: TProject[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
  tags: TTag[]
  status?: DashboardStatusCache
}

function readHydratedStatus(value: unknown): DashboardStatusCache | undefined {
  if (!value || typeof value !== 'object') return undefined
  const status = value as Partial<DashboardStatusCache>
  if (status.hydrated !== true) return undefined
  if (status.inProgressStatusId !== null && typeof status.inProgressStatusId !== 'string') return undefined
  return { hydrated: true, inProgressStatusId: status.inProgressStatusId }
}

export function readDashboardCacheRecord<TTask, TProject, TTag>(
  storage: Pick<Storage, 'getItem'>,
  key: string
): DashboardCacheRecord<TTask, TProject, TTag> | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  const parsed = JSON.parse(raw) as Partial<DashboardCacheRecord<TTask, TProject, TTag>>
  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) return null
  return {
    tasks: parsed.tasks,
    projects: parsed.projects,
    workspaceId: parsed.workspaceId || '',
    activeProjectId: parsed.activeProjectId || '',
    projectFilter: parsed.projectFilter || 'all',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    status: readHydratedStatus(parsed.status),
  }
}

export function writeDashboardCacheRecord<TTask, TProject, TTag>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  snapshot: DashboardCacheRecord<TTask, TProject, TTag>
) {
  storage.setItem(key, JSON.stringify(snapshot))
}

export function hasHydratedDashboardStatus(cache: { status?: DashboardStatusCache } | null | undefined): boolean {
  return cache?.status?.hydrated === true
}

export function readCachedInProgressStatusId(cache: { status?: DashboardStatusCache } | null | undefined): string | null {
  return hasHydratedDashboardStatus(cache) ? cache?.status?.inProgressStatusId ?? null : null
}

export function resolveInProgressStatusId(statuses: Array<{ name: string; id: string }>): string | null {
  return statuses.find((status) => status.name.trim().toLowerCase() === 'in progress')?.id ?? null
}
