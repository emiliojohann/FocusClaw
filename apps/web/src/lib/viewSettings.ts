export type TaskSort = 'priority' | 'dueDate' | 'createdAt'
export type TaskFilter = 'all' | 'dueToday' | 'dueThisWeek' | 'dueNextWeek' | 'pastDue' | 'noDate' | 'archived'
export type TaskViewMode = 'list' | 'grid'

export interface TaskViewDefaults {
  sort: TaskSort
  filter: TaskFilter
}

export interface TaskViewState extends TaskViewDefaults {
  projectFilter: string
  tagFilter: string
  assigneeFilter: string
  searchQuery: string
}

export interface CalendarViewDefaults {
  showCompleted: boolean
}

export interface CalendarViewState extends CalendarViewDefaults {
  projectFilter: string
  assigneeFilter: string
}

const TASK_DEFAULTS_KEY = 'focusclaw.taskViewDefaults'
const TASK_VIEW_STATE_KEY = 'focusclaw.taskViewState'
const TASK_VIEW_MODE_KEY = 'focusclaw.taskViewMode'
const CALENDAR_DEFAULTS_KEY = 'focusclaw.calendarViewDefaults'
const CALENDAR_VIEW_STATE_KEY = 'focusclaw.calendarViewState'
const OVERVIEW_PANEL_VISIBLE_KEY = 'focusclaw.overviewPanelVisible'

export const TASK_VIEW_DEFAULTS: TaskViewDefaults = {
  sort: 'priority',
  filter: 'all',
}

export const CALENDAR_VIEW_DEFAULTS: CalendarViewDefaults = {
  showCompleted: false,
}

export const TASK_VIEW_STATE_DEFAULTS: TaskViewState = {
  ...TASK_VIEW_DEFAULTS,
  projectFilter: 'all',
  tagFilter: 'all',
  assigneeFilter: 'all',
  searchQuery: '',
}

export const CALENDAR_VIEW_STATE_DEFAULTS: CalendarViewState = {
  ...CALENDAR_VIEW_DEFAULTS,
  projectFilter: 'all',
  assigneeFilter: 'all',
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

export function getTaskViewState(): TaskViewState {
  const defaults = getTaskViewDefaults()
  if (!canUseStorage()) return { ...TASK_VIEW_STATE_DEFAULTS, ...defaults }

  try {
    const raw = window.localStorage.getItem(TASK_VIEW_STATE_KEY)
    if (!raw) return { ...TASK_VIEW_STATE_DEFAULTS, ...defaults }
    const parsed = JSON.parse(raw) as Partial<TaskViewState>
    return {
      sort: parsed.sort || defaults.sort,
      filter: parsed.filter || defaults.filter,
      projectFilter: parsed.projectFilter || 'all',
      tagFilter: parsed.tagFilter || 'all',
      assigneeFilter: parsed.assigneeFilter || 'all',
      searchQuery: parsed.searchQuery || '',
    }
  } catch {
    return { ...TASK_VIEW_STATE_DEFAULTS, ...defaults }
  }
}

export function setTaskViewState(state: Partial<TaskViewState>): void {
  if (!canUseStorage()) return
  const current = getTaskViewState()
  window.localStorage.setItem(TASK_VIEW_STATE_KEY, JSON.stringify({ ...current, ...state }))
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

export function getCalendarViewState(): CalendarViewState {
  const defaults = getCalendarViewDefaults()
  if (!canUseStorage()) return { ...CALENDAR_VIEW_STATE_DEFAULTS, ...defaults }

  try {
    const raw = window.localStorage.getItem(CALENDAR_VIEW_STATE_KEY)
    if (!raw) return { ...CALENDAR_VIEW_STATE_DEFAULTS, ...defaults }
    const parsed = JSON.parse(raw) as Partial<CalendarViewState>
    return {
      showCompleted: parsed.showCompleted ?? defaults.showCompleted,
      projectFilter: parsed.projectFilter || 'all',
      assigneeFilter: parsed.assigneeFilter || 'all',
    }
  } catch {
    return { ...CALENDAR_VIEW_STATE_DEFAULTS, ...defaults }
  }
}

export function setCalendarViewState(state: Partial<CalendarViewState>): void {
  if (!canUseStorage()) return
  const current = getCalendarViewState()
  window.localStorage.setItem(CALENDAR_VIEW_STATE_KEY, JSON.stringify({ ...current, ...state }))
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
