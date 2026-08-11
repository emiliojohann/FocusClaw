import type { DashboardStatusCache } from './dashboardCache'

export interface CalendarCacheRecord<TTask, TProject> {
  tasks: TTask[]
  overviewTasks: TTask[]
  projects: TProject[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
  status?: DashboardStatusCache
}

function readHydratedStatus(value: unknown): DashboardStatusCache | undefined {
  if (!value || typeof value !== 'object') return undefined
  const status = value as Partial<DashboardStatusCache>
  if (status.hydrated !== true) return undefined
  if (status.inProgressStatusId !== null && typeof status.inProgressStatusId !== 'string') return undefined
  return { hydrated: true, inProgressStatusId: status.inProgressStatusId }
}

export function readCalendarCacheRecord<TTask, TProject>(
  storage: Pick<Storage, 'getItem'>,
  key: string
): CalendarCacheRecord<TTask, TProject> | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  const parsed = JSON.parse(raw) as Partial<CalendarCacheRecord<TTask, TProject>>
  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.overviewTasks) || !Array.isArray(parsed.projects)) return null
  return {
    tasks: parsed.tasks,
    overviewTasks: parsed.overviewTasks,
    projects: parsed.projects,
    workspaceId: parsed.workspaceId || '',
    activeProjectId: parsed.activeProjectId || '',
    projectFilter: parsed.projectFilter || 'all',
    status: readHydratedStatus(parsed.status),
  }
}

export function writeCalendarCacheRecord<TTask, TProject>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  snapshot: CalendarCacheRecord<TTask, TProject>
) {
  storage.setItem(key, JSON.stringify(snapshot))
}
