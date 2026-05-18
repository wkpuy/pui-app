import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
import { db } from './db'

// Handle ?healthSync=BASE64JSON from iOS Shortcuts automation
// Shortcuts reads Apple Health → encodes JSON → opens this URL → app saves automatically
async function ingestHealthSync(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('healthSync')
  if (!raw) return null

  try {
    const decoded = decodeURIComponent(raw)
    const data = JSON.parse(atob(decoded))
    const rows = Array.isArray(data) ? data : [data]
    if (rows.length === 0) return null

    let added = 0, updated = 0
    for (const row of rows) {
      if (!row.date) continue
      const existing = await db.healthDaily.where('date').equals(row.date).first()
      if (existing) {
        await db.healthDaily.update(existing.id!, { ...row, source: 'apple_health', id: undefined })
        updated++
      } else {
        await db.healthDaily.add({ ...row, source: 'apple_health', id: undefined })
        added++
      }
    }

    // Clean URL so refreshing doesn't re-import
    const clean = window.location.pathname
    window.history.replaceState(null, '', clean)

    await db.syncLog.add({ source: 'apple_health', lastSyncAt: new Date().toISOString(), status: 'success', notes: `+${added} new, ${updated} updated` })
    return `🍎 Apple Health: +${added} วันใหม่${updated > 0 ? `, อัปเดต ${updated}` : ''}`
  } catch (e) {
    console.error('healthSync parse error', e)
    return null
  }
}

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
  const [healthToast, setHealthToast] = useState<string | null>(null)

  useEffect(() => {
    ingestHealthSync().then(msg => {
      if (msg) {
        setHealthToast(msg)
        setTimeout(() => setHealthToast(null), 4000)
      }
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Apple Health auto-sync toast */}
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
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  )
}
