import { BarChart3, Bot, Circle, User } from 'lucide-react'

export const PRIORITY_CONFIG: Record<number, { label: string; badge: string; icon: typeof BarChart3; color: string; bgColor: string }> = {
  1: { label: 'Critical', badge: 'badge-critical', icon: BarChart3, color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' },
  2: { label: 'High', badge: 'badge-high', icon: BarChart3, color: '#f97316', bgColor: 'rgba(249,115,22,0.15)' },
  3: { label: 'Medium', badge: 'badge-medium', icon: BarChart3, color: '#eab308', bgColor: 'rgba(234,179,8,0.15)' },
  4: { label: 'Low', badge: 'badge-low', icon: BarChart3, color: '#a1a1aa', bgColor: 'rgba(113,113,122,0.12)' },
}

export const TAG_COLORS = [
  { bg: 'rgba(245,61,45,0.15)', border: 'rgba(245,61,45,0.3)', text: '#f53d2d' },
  { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
  { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
  { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)', text: '#f97316' },
  { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.3)', text: '#eab308' },
]

export type AssigneeValue = 'user' | 'agent' | ''
export type AssigneeFilter = 'all' | 'user' | 'agent' | 'unassigned'

export const ASSIGNEE_OPTIONS: Array<{
  id: AssigneeValue
  filter: Exclude<AssigneeFilter, 'all'>
  label: string
  color: string
  icon: typeof User
}> = [
  { id: 'user', filter: 'user', label: 'User', color: '#22c55e', icon: User },
  { id: 'agent', filter: 'agent', label: 'Agent', color: '#f53d2d', icon: Bot },
  { id: '', filter: 'unassigned', label: 'Unassigned', color: '#71717a', icon: Circle },
]

const USER_ASSIGNEES = new Set(['user', 'human', 'owner', 'operator', 'emilio'])
const AGENT_ASSIGNEES = new Set(['agent', 'ai', 'assistant'])

export function normalizeAssignee(value?: string | null): AssigneeValue {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return ''
  if (USER_ASSIGNEES.has(normalized)) return 'user'
  if (AGENT_ASSIGNEES.has(normalized)) return 'agent'
  return ''
}

export function serializeAssigneeForApi(value?: string | null): AssigneeValue | null {
  const normalized = normalizeAssignee(value)
  return normalized || null
}

export function getAssigneeOption(value?: string | null) {
  const normalized = normalizeAssignee(value)
  return ASSIGNEE_OPTIONS.find((option) => option.id === normalized) ?? ASSIGNEE_OPTIONS[2]
}

export function assigneeMatchesFilter(value: string | undefined, filter: AssigneeFilter): boolean {
  if (filter === 'all') return true
  const normalized = normalizeAssignee(value)
  return filter === 'unassigned' ? normalized === '' : normalized === filter
}

export interface OverviewTask {
  archived?: boolean
  parentId?: string
  priority: number
  assignee?: string
}

export const DEFAULT_OVERVIEW_STATS = { total: 0, completed: 0, critical: 0, high: 0, medium: 0, low: 0 }

export function getTaskOverviewStats(tasks: OverviewTask[]) {
  const parentTasks = tasks.filter((task) => !task.parentId)
  const activeTasks = parentTasks.filter((task) => !task.archived)

  return {
    total: parentTasks.length,
    completed: parentTasks.filter((task) => task.archived).length,
    critical: activeTasks.filter((task) => task.priority === 1).length,
    high: activeTasks.filter((task) => task.priority === 2).length,
    medium: activeTasks.filter((task) => task.priority === 3).length,
    low: activeTasks.filter((task) => task.priority === 4).length,
  }
}
