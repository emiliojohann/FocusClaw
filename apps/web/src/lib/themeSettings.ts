export type ThemePreference = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

const THEME_KEY = 'focusclaw.theme.preference'
const DEFAULT_THEME: ThemePreference = 'dark'

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'dark' || value === 'light'
}

export function getThemePreference(): ThemePreference {
  if (!hasStorage()) return DEFAULT_THEME
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return isThemePreference(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference
}

export function applyThemePreference(preference = getThemePreference()): ResolvedTheme {
  const resolvedTheme = resolveTheme(preference)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.themePreference = preference
    document.documentElement.dataset.theme = resolvedTheme
  }
  return resolvedTheme
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  if (hasStorage()) {
    try {
      window.localStorage.setItem(THEME_KEY, preference)
    } catch {
      // Theme preference can fall back to the current page session.
    }
  }
  return applyThemePreference(preference)
}

export function initializeTheme(): void {
  applyThemePreference()
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

  const media = window.matchMedia('(prefers-color-scheme: light)')
  const refreshSystemTheme = () => {
    if (getThemePreference() === 'system') applyThemePreference('system')
  }

  media.addEventListener('change', refreshSystemTheme)
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) applyThemePreference()
  })
}
