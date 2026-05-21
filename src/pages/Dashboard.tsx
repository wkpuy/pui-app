import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useMemo, memo } from 'react'
import { db } from '../db'
import { getAgeDetail, formatCurrency, calcLifeScore } from '../utils/calculations'
import { Card, Divider } from '../components/Card'
import { BIOMARKERS } from './Health'

// Ticks once per minute (synced to the minute boundary) — sufficient for
// showing age in days and greeting text that changes per hour.
function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setTime(new Date())
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000)
    let intervalId: ReturnType<typeof setInterval> | undefined
    const timeoutId = setTimeout(() => {
      tick()
      intervalId = setInterval(tick, 60_000)
    }, msUntilNextMinute)
    return () => {
      clearTimeout(timeoutId)
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [])
  return time
}

export default function Dashboard() {
  const navigate = useNavigate()
  const time = useClock()

  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const latestHealth = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const retirement = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  // Load only current-month finance records from DB — avoids loading entire history
  const monthKey = time.toISOString().slice(0, 7)
  const monthFinance = useLiveQuery(
    () => db.financeRecords.where('date').between(monthKey + '-01', monthKey + '-31', true, true).toArray(),
    [monthKey],
  )

  const [showWeightInput, setShowWeightInput] = useState(false)
  const [weightVal, setWeightVal] = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const weightRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showWeightInput) setTimeout(() => weightRef.current?.focus(), 100)
  }, [showWeightInput])

  async function saveQuickWeight() {
    const w = parseFloat(weightVal)
    if (!w || w < 20 || w > 300) return
    setWeightSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const existing = await db.healthDaily.where('date').equals(today).first()
      if (existing) await db.healthDaily.update(existing.id!, { weightKg: w })
      else await db.healthDaily.add({ date: today, weightKg: w })
      setWeightVal('')
      setShowWeightInput(false)
    } finally { setWeightSaving(false) }
  }

  // age only changes once per day — memoize on profile + date string
  const today = time.toISOString().slice(0, 10)
  const age = useMemo(
    () => profile ? getAgeDetail(profile.dob) : null,
    [profile, today], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Investment totals — only recalc when DB data changes, not on timer
  const { totalCurrent, gainPct } = useMemo(() => {
    const totalInvested = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
    const totalCurrent = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
    const gainPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0
    return { totalInvested, totalCurrent, gainPct }
  }, [investments])

  const retirementPct = useMemo(() => retirement
    ? Math.min((retirement.currentTotalAssets / ((retirement.monthlyExpenseAtRetirement * 12 * 100) / 4)) * 100, 100)
    : 0,
  [retirement])

  // Health score iterates over every biomarker — expensive, memoize on health data
  const healthScore = useMemo(() => {
    if (!latestHealth) return 50
    const STATUS_PTS: Record<string, number> = { optimal: 100, good: 80, warning: 55, high: 25 }
    let total = 0, count = 0
    for (const [k, v] of Object.entries(latestHealth)) {
      if (typeof v !== 'number') continue
      const def = BIOMARKERS[k]
      if (!def) continue
      total += STATUS_PTS[def.evaluate(v)]
      count++
    }
    let score = count > 0 ? total / count : 70
    if (latestDaily?.sleepTotal !== undefined) {
      if (latestDaily.sleepTotal >= 7) score += 3
      else if (latestDaily.sleepTotal < 6) score -= 5
    }
    if (latestDaily?.steps !== undefined) {
      if (latestDaily.steps >= 8000) score += 3
      else if (latestDaily.steps < 4000) score -= 3
    }
    if (latestDaily?.vo2max !== undefined && latestDaily.vo2max >= 42) score += 2
    return Math.max(0, Math.min(100, Math.round(score)))
  }, [latestHealth, latestDaily])

  const lifeScore = useMemo(() => calcLifeScore({
    investmentGainPct: gainPct,
    retirementProgress: retirementPct,
    healthScore,
    stepsAvg: latestDaily?.steps,
  }), [gainPct, retirementPct, healthScore, latestDaily?.steps])

  const greeting = useMemo(() => {
    const h = time.getHours()
    if (h < 12) return 'อรุณสวัสดิ์'
    if (h < 17) return 'สวัสดีตอนบ่าย'
    return 'สวัสดีตอนเย็น'
  }, [time.getHours()]) // eslint-disable-line react-hooks/exhaustive-deps

  const { thisMonthIncome, thisMonthExpense } = useMemo(() => ({
    thisMonthIncome: monthFinance?.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0,
    thisMonthExpense: monthFinance?.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0,
  }), [monthFinance])

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-6xl">👋</div>
        <h2 className="text-2xl font-bold text-gray-900">ยินดีต้อนรับ</h2>
        <p className="text-gray-500">ตั้งค่าข้อมูลส่วนตัวก่อนเริ่มใช้งาน</p>
        <button
          onClick={() => navigate('/settings')}
          className="bg-indigo-600 text-white font-semibold px-8 py-3 rounded-2xl active:scale-95"
        >
          เริ่มตั้งค่า
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm opacity-90">{greeting} 👋</div>
            <div className="text-[28px] font-bold leading-tight">{profile.nickname}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/daily')} aria-label="Daily Brief"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/20 text-white text-[12px] font-semibold active:opacity-70">
              🌅 Daily Brief
            </button>
            <button onClick={() => navigate('/settings')} aria-label="ตั้งค่า" className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-xl">
              ⚙️
            </button>
          </div>
        </div>

        {/* Age real-time */}
        <div className="bg-white/15 rounded-2xl p-3 mb-4">
          <div className="text-xs opacity-90 mb-1">อายุปัจจุบัน</div>
          <div className="text-xl font-bold">
            {age?.years} ปี {age?.months} เดือน {age?.days} วัน
          </div>
          <div className="text-xs opacity-80 mt-0.5">เกิด {new Date(profile.dob).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>

        {/* Life Score */}
        <div className="bg-white/15 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs opacity-90">Life Score</div>
            <div className="text-xs opacity-80">คะแนนชีวิตรวม</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold">{lifeScore}</div>
            <div className="flex-1">
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${lifeScore}%` }}
                />
              </div>
              <div className="text-xs opacity-80 mt-1">
                {lifeScore >= 80 ? 'ยอดเยี่ยม 🎉' : lifeScore >= 60 ? 'ดี 👍' : 'ต้องปรับปรุง 💪'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Net Worth banner */}
      <button
        onClick={() => navigate('/networth')}
        className="mx-4 mt-3 bg-gradient-to-r from-violet-50 to-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-transform"
      >
        <div>
          <div className="text-[11px] font-semibold text-indigo-400 mb-0.5">Net Worth</div>
          <NetWorthBadge />
        </div>
        <div className="text-indigo-400 text-lg">›</div>
      </button>

      {/* Summary cards */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <Card onClick={() => navigate('/investment')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-600 mb-1">พอร์ตลงทุน</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(totalCurrent)}</div>
          <div className={`text-sm font-semibold ${gainPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
          </div>
        </Card>
        <Card onClick={() => navigate('/health')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-600 mb-1">สุขภาพ</div>
          <div className="text-lg font-bold text-gray-900">{healthScore}/100</div>
          <div className={`text-sm font-semibold ${healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
            {healthScore >= 80 ? 'ดี' : healthScore >= 60 ? 'ปานกลาง' : 'ต้องดูแล'}
          </div>
        </Card>
        <Card onClick={() => navigate('/retirement')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-600 mb-1">แผนเกษียณ</div>
          <div className="text-lg font-bold text-gray-900">{retirementPct.toFixed(0)}%</div>
          <div className="text-sm text-gray-500">ของเป้าหมาย</div>
        </Card>
        <Card onClick={() => navigate('/finance')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-600 mb-1">เดือนนี้</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(thisMonthExpense)}</div>
          <div className="text-sm text-green-600">รับ {formatCurrency(thisMonthIncome)}</div>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { icon: '💸', label: '+ รายจ่าย', color: 'bg-red-50 text-red-600', onClick: () => navigate('/finance') },
            { icon: '⚖️', label: '+ น้ำหนัก', color: 'bg-sky-50 text-sky-600', onClick: () => setShowWeightInput(v => !v) },
            { icon: '📅', label: 'ปฏิทิน', color: 'bg-sky-50 text-sky-600', onClick: () => navigate('/calendar') },
            { icon: '💬', label: 'AI Coach', color: 'bg-violet-50 text-violet-600', onClick: () => navigate('/coach') },
            { icon: '🧾', label: 'ภาษี', color: 'bg-amber-50 text-amber-700', onClick: () => navigate('/tax') },
          ].map(a => (
            <button key={a.label} onClick={a.onClick}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform ${a.color}`}>
              <span>{a.icon}</span><span>{a.label}</span>
            </button>
          ))}
        </div>

        {/* Inline weight input */}
        {showWeightInput && (
          <div className="mt-2 flex gap-2 items-center bg-sky-50 rounded-2xl px-4 py-2.5">
            <span aria-hidden="true" className="text-sky-600">⚖️</span>
            <label htmlFor="weight-input" className="sr-only">น้ำหนัก (กก.)</label>
            <input id="weight-input" ref={weightRef} type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveQuickWeight()}
              placeholder="น้ำหนักวันนี้ (กก.)" step="0.1" min="20" max="300"
              className="flex-1 bg-transparent text-[14px] font-semibold text-gray-800 outline-none placeholder:text-sky-300" />
            <button onClick={saveQuickWeight} disabled={weightSaving || !weightVal}
              className="bg-sky-500 text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-40">
              {weightSaving ? '...' : 'บันทึก'}
            </button>
            <button onClick={() => { setShowWeightInput(false); setWeightVal('') }} aria-label="ปิด"
              className="w-11 h-11 flex items-center justify-center text-sky-400 text-lg">×</button>
          </div>
        )}
      </div>

      <Divider />

      {/* Daily Briefing */}
      <DailyBriefing navigate={navigate} age={age?.years ?? 35} />

      <Divider />

      {/* Health snapshot */}
      {latestDaily && (
        <>
          <div className="px-5 pt-4 pb-1 text-[13px] font-semibold text-gray-500">กิจกรรมวันนี้</div>
          <div className="px-4 pb-3 grid grid-cols-4 gap-2">
            {[
              { icon: '👣', label: 'ก้าว', value: latestDaily.steps ? latestDaily.steps.toLocaleString() : '—' },
              { icon: '😴', label: 'นอน', value: latestDaily.sleepTotal ? `${latestDaily.sleepTotal}ชม.` : '—' },
              { icon: '🫀', label: 'HRV', value: latestDaily.hrv !== undefined ? `${latestDaily.hrv}` : '—' },
              { icon: '🔥', label: 'เผาผลาญ', value: latestDaily.caloriesBurned ? latestDaily.caloriesBurned.toString() : '—' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                <div className="text-xl mb-1">{item.icon}</div>
                <div className="text-xs font-bold text-gray-900">{item.value}</div>
                <div className="text-[10px] text-gray-400">{item.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Mapping อายุ → biomarker keys ที่ควรตรวจ (ภายในแอพ)
const AGE_BIOMARKER_REQUIREMENTS: { ageMin: number; keys: string[]; label: string }[] = [
  { ageMin: 30, label: 'อายุ 30+', keys: ['hba1c', 'ldl', 'hdl', 'triglycerides', 'tsh', 'vitaminD'] },
  { ageMin: 35, label: 'อายุ 35+', keys: ['apoB', 'lpA', 'hsCrp', 'fastingInsulin', 'magnesium', 'vitaminB12'] },
  { ageMin: 40, label: 'อายุ 40+', keys: ['cacScore', 'egfr', 'homocysteine'] },
  { ageMin: 45, label: 'อายุ 45+', keys: ['boneDensityTScore'] },
  { ageMin: 50, label: 'อายุ 50+', keys: ['mocaScore'] },
]

const DailyBriefing = memo(function DailyBriefing({ navigate, age }: { navigate: (path: string) => void; age: number }) {
  const investments = useLiveQuery(() => db.investments.toArray())
  const allHealthRecords = useLiveQuery(() => db.healthRecords.orderBy('date').reverse().toArray())
  const installments = useLiveQuery(() => db.installments.toArray())
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray())
  const taxRecords = useLiveQuery(() => db.taxRecords.toArray())

  const alerts: { icon: string; text: string; color: string; path: string }[] = []

  // 1. Investment losses
  if (investments) {
    investments.forEach(inv => {
      const pct = inv.costBasis > 0 ? ((inv.currentValue - inv.costBasis) / inv.costBasis) * 100 : 0
      if (pct < -10) {
        alerts.push({ icon: '📉', text: `${inv.name} ขาดทุน ${pct.toFixed(1)}%`, color: 'bg-red-50', path: '/investment' })
      }
    })
  }

  // 2. Critical/warning biomarkers from latest record
  const latest = allHealthRecords?.[0]
  if (latest) {
    const concerning: string[] = []
    for (const [k, v] of Object.entries(latest)) {
      if (typeof v !== 'number') continue
      const def = BIOMARKERS[k]
      if (!def) continue
      const status = def.evaluate(v)
      if (status === 'high') concerning.push(`${def.label} ${v} ${def.unit}`)
    }
    if (concerning.length > 0) {
      alerts.push({
        icon: '🩺', text: `ผลตรวจผิดปกติ: ${concerning.slice(0, 2).join(', ')}${concerning.length > 2 ? ` +${concerning.length - 2}` : ''}`,
        color: 'bg-red-50', path: '/health',
      })
    }
  }

  // 3. Age-based checkups missing or stale (>365 days)
  const requiredKeys: string[] = []
  for (const req of AGE_BIOMARKER_REQUIREMENTS) {
    if (age >= req.ageMin) requiredKeys.push(...req.keys)
  }
  const tested = new Set<string>()
  if (allHealthRecords) {
    for (const r of allHealthRecords) {
      const days = (Date.now() - new Date(r.date).getTime()) / (1000 * 3600 * 24)
      if (days > 365) continue
      for (const k of requiredKeys) {
        if ((r as any)[k] !== undefined && (r as any)[k] !== null) tested.add(k)
      }
    }
  }
  const missing = requiredKeys.filter(k => !tested.has(k))
  if (missing.length > 0) {
    const labels = missing.slice(0, 3).map(k => BIOMARKERS[k]?.label ?? k).join(', ')
    alerts.push({
      icon: '🧪', text: `อายุ ${age} ปี ควรตรวจเพิ่ม: ${labels}${missing.length > 3 ? ` +${missing.length - 3}` : ''}`,
      color: 'bg-amber-50', path: '/health',
    })
  }

  // 4. Installments — รวมเดือนนี้
  if (installments) {
    const active = installments.filter(i => i.paidInstallments < i.totalInstallments)
    const totalMonthly = active.reduce((s, i) => s + i.monthlyAmount, 0)
    if (totalMonthly > 0) {
      alerts.push({
        icon: '💳', text: `ยอดผ่อนเดือนนี้รวม ${totalMonthly.toLocaleString()} บาท (${active.length} รายการ)`,
        color: 'bg-blue-50', path: '/finance',
      })
    }
  }

  // 5. Tax — แจ้งเตือนปลายปี ถ้ายังมีลดหย่อนเหลือเยอะ
  if (taxRecords) {
    const month = new Date().getMonth() + 1   // 1-12
    const currentBE = new Date().getFullYear() + 543
    const taxRec = taxRecords.find(r => r.year === currentBE)
    if (taxRec && month >= 10) {  // ตั้งแต่ตุลาคมขึ้นไป
      // คำนวณ unused space แบบ inline (เลี่ยง import เพื่อ tree-shake)
      const gross = (taxRec.totalIncome || 0) + (taxRec.bonus || 0) + (taxRec.otherIncome || 0)
      const rmfCap = Math.min(gross * 0.30, 500_000)
      const ssfCap = Math.min(gross * 0.30, 200_000)
      const unusedRmfSsf = Math.max(rmfCap - (taxRec.rmf || 0), 0) + Math.max(ssfCap - (taxRec.ssf || 0), 0)
      if (unusedRmfSsf > 50_000) {
        alerts.push({
          icon: '🧾', text: `ปลายปีแล้ว! RMF/SSF เหลือสิทธิ์ ${unusedRmfSsf.toLocaleString()} บาท → ลองเช็คใน "วางแผนภาษี"`,
          color: 'bg-amber-50', path: '/tax',
        })
      }
    }
  }

  // 6. Subscriptions — ใกล้ต่ออายุภายใน 3 วัน
  if (subscriptions) {
    const upcoming = subscriptions.filter(s => {
      if (!s.active) return false
      const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / (1000 * 3600 * 24))
      return days >= 0 && days <= 3
    })
    for (const s of upcoming.slice(0, 2)) {
      const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / (1000 * 3600 * 24))
      alerts.push({
        icon: '🔔', text: `${s.name} ต่ออายุ${days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`} (${s.amount.toLocaleString()} บาท)`,
        color: 'bg-amber-50', path: '/finance',
      })
    }
  }

  if (alerts.length === 0) {
    alerts.push({ icon: '✅', text: 'ทุกอย่างดูดีวันนี้ 🎉', color: 'bg-green-50', path: '/' })
  }

  return (
    <>
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-gray-500">Daily Briefing</div>
        <button onClick={() => navigate('/coach')} className="text-[12px] text-indigo-600 font-medium">ถามเพิ่มเติม →</button>
      </div>
      <div className="px-4 flex flex-col gap-2 pb-4">
        {alerts.slice(0, 5).map((a, i) => (
          <button key={i} onClick={() => navigate(a.path)} className={`${a.color} rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left active:scale-[0.98]`}>
            <span className="text-lg flex-shrink-0">{a.icon}</span>
            <span className="text-[13px] text-gray-700 font-medium">{a.text}</span>
          </button>
        ))}
      </div>
    </>
  )
})

function NetWorthBadge() {
  const investments  = useLiveQuery(() => db.investments.toArray())
  const condo        = useLiveQuery(() => db.condoMortgage.toArray().then(r => r[0]))
  const installments = useLiveQuery(() => db.installments.toArray())

  const netWorth = useMemo(() => {
    const assets = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
    const realEstate = condo?.totalPrice ?? 0

    const r = (condo?.interestRate ?? 0) / 100 / 12
    const n = (condo?.loanTermYears ?? 0) * 12
    const loan = condo?.loanAmount ?? 0
    const base = r > 0 ? loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : (n > 0 ? loan / n : 0)
    const elapsed = condo
      ? Math.max(0, Math.floor((Date.now() - new Date(condo.startDate).getTime()) / (30.44 * 24 * 3600 * 1000)))
      : 0
    let condoBal = loan
    for (let i = 0; i < Math.min(elapsed, n); i++) {
      const interest = condoBal * r
      condoBal = Math.max(0, condoBal - Math.min(condoBal, base - interest + (condo?.monthlyExtra ?? 0)))
    }

    const instBal = installments
      ?.filter(i => i.paidInstallments < i.totalInstallments)
      .reduce((s, i) => s + (i.totalInstallments - i.paidInstallments) * i.monthlyAmount, 0) ?? 0

    return assets + realEstate - condoBal - instBal
  }, [investments, condo, installments])

  const color = netWorth >= 0 ? 'text-indigo-700' : 'text-red-500'
  return <div className={`text-[17px] font-bold ${color}`}>{formatCurrency(netWorth)}</div>
}
