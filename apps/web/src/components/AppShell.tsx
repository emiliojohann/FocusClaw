import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Check, Plus, Settings, Smartphone } from 'lucide-react'
import { APP_VERSION, GITHUB_LATEST_RELEASE_API_URL, GITHUB_LATEST_RELEASE_URL } from '@/lib/version'

type AppView = 'tasks' | 'calendar' | 'settings'

interface AppShellProps {
  activeView: AppView
  children: ReactNode
  sidebarContent?: ReactNode
  sidebarVisible?: boolean
  mainClassName?: string
}

const navItems = [
  { view: 'tasks' as const, to: '/', label: 'Tasks', icon: Check },
  { view: 'calendar' as const, to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { view: 'settings' as const, to: '/settings', label: 'Settings', icon: Settings },
]

const UPDATE_PREVIEW_TAG = 'v9999.0.0-preview'
const UPDATE_PREVIEW_STORAGE_KEY = 'focusclaw.previewUpdate'
const NEW_TASK_EVENT = 'focusclaw:new-task'

function normalizeVersionTag(tag: string): number[] {
  return tag.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10)).filter(Number.isFinite)
}

function isNewerVersion(latestTag: string, currentTag: string): boolean {
  const latest = normalizeVersionTag(latestTag)
  const current = normalizeVersionTag(currentTag)
  const maxLength = Math.max(latest.length, current.length)
  for (let index = 0; index < maxLength; index += 1) {
    const latestPart = latest[index] ?? 0
    const currentPart = current[index] ?? 0
    if (latestPart > currentPart) return true
    if (latestPart < currentPart) return false
  }
  return false
}

export function AppShell({
  activeView,
  children,
  sidebarContent,
  sidebarVisible = true,
  mainClassName = 'flex-1 min-w-0',
}: AppShellProps) {
  const [latestReleaseTag, setLatestReleaseTag] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const updateVisualViewportGap = () => {
      const viewport = window.visualViewport
      const bottomGap = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0
      document.documentElement.style.setProperty('--fc-visual-viewport-bottom-gap', `${bottomGap}px`)
    }

    const scheduleUpdate = () => {
      window.requestAnimationFrame(updateVisualViewportGap)
      window.setTimeout(updateVisualViewportGap, 250)
    }

    updateVisualViewportGap()
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('orientationchange', scheduleUpdate)
    window.addEventListener('focusout', scheduleUpdate)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('orientationchange', scheduleUpdate)
      window.removeEventListener('focusout', scheduleUpdate)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (import.meta.env.DEV) {
      let storedPreview = false
      try {
        storedPreview = window.localStorage.getItem(UPDATE_PREVIEW_STORAGE_KEY) === '1'
      } catch {
        storedPreview = false
      }

      const previewEnabled = new URLSearchParams(window.location.search).get('focusclawPreviewUpdate') === '1'
        || storedPreview
        || import.meta.env.VITE_FOCUSCLAW_PREVIEW_UPDATE === '1'

      if (previewEnabled) {
        setLatestReleaseTag(UPDATE_PREVIEW_TAG)
        return () => { cancelled = true }
      }
    }

    fetch(GITHUB_LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((release: { tag_name?: unknown } | null) => {
        if (cancelled || typeof release?.tag_name !== 'string') return
        if (isNewerVersion(release.tag_name, APP_VERSION)) setLatestReleaseTag(release.tag_name)
      })
      .catch(() => {
        // Offline, private repos, and rate limits should not interrupt the app.
      })
    return () => { cancelled = true }
  }, [])

  const renderUpdateIndicator = (className = '') => latestReleaseTag ? (
    <a
      href={GITHUB_LATEST_RELEASE_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center rounded-full border border-[rgba(245,61,45,0.55)] bg-[rgba(245,61,45,0.16)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-hover)] shadow-sm shadow-[rgba(245,61,45,0.18)] ring-1 ring-[rgba(245,61,45,0.18)] transition-colors hover:border-[rgba(245,61,45,0.75)] hover:bg-[rgba(245,61,45,0.22)] ${className}`}
      title={`Latest release: ${latestReleaseTag}`}
    >
      Update available
    </a>
  ) : null

  const openMobileNewTask = () => {
    if (location.pathname === '/' || location.pathname === '/calendar') {
      window.dispatchEvent(new Event(NEW_TASK_EVENT))
      return
    }
    navigate('/?newTask=1')
  }

  return (
    <div className="fc-app-shell min-h-screen bg-[var(--bg-primary)] lg:flex">
      {sidebarVisible ? (
        <aside className="hidden w-60 bg-[var(--bg-secondary)] border-r border-[var(--border)] lg:flex lg:flex-col">
          <Link to="/" className="fc-header-row px-6 border-b border-[var(--border)] flex items-center gap-2 text-white text-lg font-extrabold hover:bg-[var(--bg-elevated)]/40">
            <img src="/fc-logo-app.png" alt="" aria-hidden="true" loading="eager" decoding="sync" className="w-7 h-7 rounded-lg flex-shrink-0" />
            <span>FocusClaw</span>
          </Link>
          {latestReleaseTag ? <div className="px-4 pt-4">{renderUpdateIndicator('w-full')}</div> : null}

          <div className="p-3">
            <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-3 mb-2">Views</h3>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeView === item.view
                return (
                  <Link
                    key={item.view}
                    to={item.to}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                      isActive
                        ? 'fc-sidebar-nav-item-active bg-[var(--bg-elevated)] text-white'
                        : 'text-zinc-400 transition-colors hover:text-white hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--accent)]' : ''}`} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {sidebarContent}

          <div className="flex-1" />
          <div className="p-4 border-t border-[var(--border)]">
            <p className="text-[10px] text-zinc-600 text-center">{APP_VERSION}</p>
          </div>
        </aside>
      ) : null}

      {latestReleaseTag && !sidebarVisible ? (
        <div className="fixed right-4 top-4 z-30 hidden lg:block">
          {renderUpdateIndicator('shadow-lg shadow-black/20')}
        </div>
      ) : null}

      <header className="fc-mobile-topbar z-30 shrink-0 bg-[var(--bg-secondary)]/95 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-11 w-full max-w-md items-center justify-between gap-3">
          <Link to="/" className="fc-mobile-brand mr-auto flex min-w-0 items-center gap-2 rounded-lg pr-2 text-sm font-extrabold text-white">
            <img src="/fc-logo-app.png" alt="" aria-hidden="true" loading="eager" decoding="sync" className="h-7 w-7 flex-shrink-0 rounded-lg" />
            <span className="truncate">FocusClaw</span>
          </Link>
          {latestReleaseTag ? <div className="shrink-0">{renderUpdateIndicator()}</div> : null}
          <button
            type="button"
            onClick={openMobileNewTask}
            className="btn btn-primary fc-mobile-new-task-button h-8 shrink-0 px-2 text-[11px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            New Task
          </button>
        </div>
      </header>

      <main className={mainClassName}>{children}</main>

      <nav className="fc-mobile-nav z-30 shrink-0 bg-[var(--bg-secondary)]/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.view
            return (
              <Link
                key={item.view}
                to={item.to}
                className={`fc-mobile-nav-item flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'fc-mobile-nav-item-active bg-[var(--accent)] text-white'
                    : 'text-zinc-500 hover:bg-[var(--bg-elevated)] hover:text-zinc-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="fc-portrait-lock" role="status" aria-live="polite">
        <img src="/fc-logo-app.png" alt="" aria-hidden="true" className="fc-portrait-lock-logo" />
        <Smartphone className="fc-portrait-lock-icon" aria-hidden="true" />
        <div className="fc-portrait-lock-copy">
          <p className="fc-portrait-lock-title">Rotate or resize your window</p>
          <p className="fc-portrait-lock-text">FocusClaw works best in<br />a taller layout.</p>
        </div>
      </div>
    </div>
  )
}
