import { BrowserRouter, Routes, Route } from 'react-router'
import DashboardPage from '@/pages/DashboardPage'
import CalendarPage from '@/pages/CalendarPage'
import SettingsPage from '@/pages/SettingsPage'
import SetupPage from '@/pages/SetupPage'
import { THEME_LOGO_SOURCES } from '@/lib/themeSettings'

function ThemeLogoCache() {
  return (
    <div className="fc-theme-logo-cache" aria-hidden="true">
      <img src={THEME_LOGO_SOURCES.openclaw} alt="" decoding="sync" />
      <img src={THEME_LOGO_SOURCES.hermes} alt="" decoding="sync" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeLogoCache />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<SetupPage />} />
      </Routes>
    </BrowserRouter>
  )
}
