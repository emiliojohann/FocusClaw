export type ThemePreference = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'
export type ThemeFamily = 'openclaw' | 'hermes'

const THEME_KEY = 'focusclaw.theme.preference'
const THEME_FAMILY_KEY = 'focusclaw.theme.family'
const DEFAULT_THEME: ThemePreference = 'dark'
const DEFAULT_THEME_FAMILY: ThemeFamily = 'openclaw'
const DEFAULT_LOGO_SRC = '/fc-logo-app.png'
const HERMES_LOGO_SRC = '/grok-hermes.png'
let themeTransitionReleaseTimer: number | undefined

export const THEME_FAMILY_CHANGE_EVENT = 'focusclaw:theme-family-change'

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

export const THEME_FAMILY_OPTIONS: Array<{ value: ThemeFamily; label: string }> = [
  { value: 'openclaw', label: 'OpenClaw' },
  { value: 'hermes', label: 'Hermes' },
]

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'dark' || value === 'light'
}

function isThemeFamily(value: string | null): value is ThemeFamily {
  return value === 'openclaw' || value === 'hermes'
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

export function getThemeFamily(): ThemeFamily {
  if (!hasStorage()) return DEFAULT_THEME_FAMILY
  try {
    const stored = window.localStorage.getItem(THEME_FAMILY_KEY)
    if (stored === 'classic') return 'openclaw'
    return isThemeFamily(stored) ? stored : DEFAULT_THEME_FAMILY
  } catch {
    return DEFAULT_THEME_FAMILY
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference
}

export function getThemeLogoSrc(family = getThemeFamily()): string {
  return family === 'hermes' ? HERMES_LOGO_SRC : DEFAULT_LOGO_SRC
}

function updateFavicon(src: string): void {
  if (typeof document === 'undefined') return
  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    document.head.appendChild(favicon)
  }
  favicon.type = 'image/png'
  favicon.href = src
}

function suppressThemeTransitions(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  document.documentElement.dataset.themeSwitching = 'true'
  if (themeTransitionReleaseTimer) window.clearTimeout(themeTransitionReleaseTimer)
  themeTransitionReleaseTimer = window.setTimeout(() => {
    delete document.documentElement.dataset.themeSwitching
    themeTransitionReleaseTimer = undefined
  }, 80)
}

export function applyThemePreference(preference = getThemePreference()): ResolvedTheme {
  const resolvedTheme = resolveTheme(preference)
  if (typeof document !== 'undefined') {
    suppressThemeTransitions()
    document.documentElement.dataset.themePreference = preference
    document.documentElement.dataset.theme = resolvedTheme
  }
  return resolvedTheme
}

export function applyThemeFamily(family = getThemeFamily()): ThemeFamily {
  if (typeof document !== 'undefined') {
    suppressThemeTransitions()
    document.documentElement.dataset.themeFamily = family
    updateFavicon(getThemeLogoSrc(family))
    window.dispatchEvent(new CustomEvent(THEME_FAMILY_CHANGE_EVENT, { detail: { family } }))
  }
  return family
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

export function setThemeFamily(family: ThemeFamily): ThemeFamily {
  if (hasStorage()) {
    try {
      window.localStorage.setItem(THEME_FAMILY_KEY, family)
    } catch {
      // Theme family can fall back to the current page session.
    }
  }
  return applyThemeFamily(family)
}

export function initializeTheme(): void {
  applyThemePreference()
  applyThemeFamily()
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

  const media = window.matchMedia('(prefers-color-scheme: light)')
  const refreshSystemTheme = () => {
    if (getThemePreference() === 'system') applyThemePreference('system')
  }

  media.addEventListener('change', refreshSystemTheme)
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) applyThemePreference()
    if (event.key === THEME_FAMILY_KEY) applyThemeFamily()
  })
}
