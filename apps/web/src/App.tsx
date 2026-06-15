import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DashboardPage from '@/pages/DashboardPage'
import CalendarPage from '@/pages/CalendarPage'
import SettingsPage from '@/pages/SettingsPage'
import SetupPage from '@/pages/SetupPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<SetupPage />} />
      </Routes>
    </BrowserRouter>
  )
}
