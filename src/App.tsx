import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import { useAutoSync } from './hooks/useAutoSync'
import Dashboard from './pages/Dashboard'
import Investment from './pages/Investment'
import Health from './pages/Health'
import Retirement from './pages/Retirement'
import Finance from './pages/Finance'
import AICoach from './pages/AICoach'
import Settings from './pages/Settings'
import AnnualWrapped from './pages/AnnualWrapped'
import ShortcutsGuide from './pages/ShortcutsGuide'
import Calendar from './pages/Calendar'
import Salary from './pages/Salary'
import Condo from './pages/Condo'

export default function App() {
  return (
    <BrowserRouter basename="/pui-app">
      <Routes>
        <Route path="/wrapped" element={<AnnualWrapped />} />
        <Route path="/shortcuts-guide" element={<ShortcutsGuide />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/condo" element={<Condo />} />
        <Route path="*" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

function MainLayout() {
  useAutoSync()
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/investment" element={<Investment />} />
          <Route path="/health" element={<Health />} />
          <Route path="/retirement" element={<Retirement />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/coach" element={<AICoach />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  )
}
