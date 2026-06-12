export type TaskSort = 'priority' | 'dueDate' | 'createdAt'
export type TaskFilter = 'all' | 'dueToday' | 'dueThisWeek' | 'pastDue' | 'noDate' | 'archived'
export type TaskViewMode = 'list' | 'grid'

export interface TaskViewDefaults {
  sort: TaskSort
  filter: TaskFilter
}

export interface CalendarViewDefaults {
  showCompleted: boolean
}

const TASK_DEFAULTS_KEY = 'focusclaw.taskViewDefaults'
const TASK_VIEW_MODE_KEY = 'focusclaw.taskViewMode'
const CALENDAR_DEFAULTS_KEY = 'focusclaw.calendarViewDefaults'
const OVERVIEW_PANEL_VISIBLE_KEY = 'focusclaw.overviewPanelVisible'

export const TASK_VIEW_DEFAULTS: TaskViewDefaults = {
  sort: 'priority',
  filter: 'all',
}

export const CALENDAR_VIEW_DEFAULTS: CalendarViewDefaults = {
  showCompleted: false,
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getTaskViewDefaults(): TaskViewDefaults {
  if (!canUseStorage()) return TASK_VIEW_DEFAULTS

  try {
    const raw = window.localStorage.getItem(TASK_DEFAULTS_KEY)
    if (!raw) return TASK_VIEW_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<TaskViewDefaults>
    if (!parsed.sort || !parsed.filter) return TASK_VIEW_DEFAULTS
    return {
      sort: parsed.sort,
      filter: parsed.filter,
    }
  } catch {
    return TASK_VIEW_DEFAULTS
  }
}

export function setTaskViewDefaults(defaults: TaskViewDefaults): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(TASK_DEFAULTS_KEY, JSON.stringify(defaults))
}

export function getTaskViewMode(): TaskViewMode {
  if (!canUseStorage()) return 'list'

  try {
    const raw = window.localStorage.getItem(TASK_VIEW_MODE_KEY)
    return raw === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

export function setTaskViewMode(mode: TaskViewMode): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(TASK_VIEW_MODE_KEY, mode)
}

export function getCalendarViewDefaults(): CalendarViewDefaults {
  if (!canUseStorage()) return CALENDAR_VIEW_DEFAULTS

  try {
    const raw = window.localStorage.getItem(CALENDAR_DEFAULTS_KEY)
    if (!raw) return CALENDAR_VIEW_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<CalendarViewDefaults>
    return {
      showCompleted: Boolean(parsed.showCompleted),
    }
  } catch {
    return CALENDAR_VIEW_DEFAULTS
  }
}

export function setCalendarViewDefaults(defaults: CalendarViewDefaults): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(CALENDAR_DEFAULTS_KEY, JSON.stringify(defaults))
}

export function getOverviewPanelVisible(): boolean {
  if (!canUseStorage()) return true

  try {
    const raw = window.localStorage.getItem(OVERVIEW_PANEL_VISIBLE_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

export function setOverviewPanelVisible(visible: boolean): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(OVERVIEW_PANEL_VISIBLE_KEY, String(visible))
}
