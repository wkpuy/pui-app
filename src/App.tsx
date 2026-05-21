import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
// @ts-ignore — virtual module provided by vite-plugin-pwa at build time
import { useRegisterSW } from 'virtual:pwa-register/react'
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
import Calendar from './pages/Calendar'
import Salary from './pages/Salary'
import Condo from './pages/Condo'
import Tax from './pages/Tax'
import NetWorth from './pages/NetWorth'
import Lumen from './pages/Lumen'
import { exchangeCode, saveWhoopTokens } from './api/whoop'

async function handleWhoopCallback(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code) return null

  const savedState = localStorage.getItem('whoop_oauth_state')
  if (state && savedState && state !== savedState) return null

  try {
    const tokens = await exchangeCode(code)
    saveWhoopTokens(tokens)
    window.history.replaceState(null, '', window.location.pathname)
    return '✅ เชื่อมต่อ WHOOP สำเร็จ!'
  } catch (e) {
    console.error('WHOOP callback error', e)
    window.history.replaceState(null, '', window.location.pathname)
    return '❌ เชื่อมต่อ WHOOP ไม่สำเร็จ'
  }
}

export default function App() {
  return (
    <BrowserRouter basename="/pui-app">
      <Routes>
        <Route path="/wrapped" element={<AnnualWrapped />} />
        <Route path="*" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

function MainLayout() {
  useAutoSync()
  const [healthToast, setHealthToast] = useState<string | null>(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    handleWhoopCallback().then(msg => {
      if (msg) {
        setHealthToast(msg)
        setTimeout(() => setHealthToast(null), 4000)
      }
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* PWA update banner */}
      {needRefresh && (
        <div className="fixed top-0 inset-x-0 z-[999] bg-indigo-600 text-white text-[13px] font-semibold px-4 py-3 flex items-center justify-between">
          <span>มีเวอร์ชั่นใหม่พร้อมใช้งาน</span>
          <button onClick={() => updateServiceWorker(true)} className="bg-white text-indigo-600 text-[12px] font-bold px-3 py-1 rounded-lg active:scale-95">
            อัพเดท
          </button>
        </div>
      )}
      {/* WHOOP toast */}
      {healthToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-2xl shadow-xl">
          {healthToast}
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/investment" element={<Investment />} />
          <Route path="/health" element={<Health />} />
          <Route path="/retirement" element={<Retirement />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/coach" element={<AICoach />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/salary" element={<Salary />} />
          <Route path="/condo" element={<Condo />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/networth" element={<NetWorth />} />
          <Route path="/lumen" element={<Lumen />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  )
}
