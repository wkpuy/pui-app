import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { db } from '../db'
import { getAgeDetail, formatCurrency, calcLifeScore } from '../utils/calculations'
import { Card, Divider } from '../components/Card'
import { BIOMARKERS } from './Health'

export default function Dashboard() {
  const navigate = useNavigate()
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const latestHealth = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const retirement = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const financeRecords = useLiveQuery(() => db.financeRecords.toArray())

  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const age = profile ? getAgeDetail(profile.dob) : null

  const totalInvested = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
  const totalCurrent = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
  const gainPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0

  const retirementPct = retirement
    ? Math.min((retirement.currentTotalAssets / ((retirement.monthlyExpenseAtRetirement * 12 * 100) / 4)) * 100, 100)
    : 0

  // Health Score: เฉลี่ยจากทุก BIOMARKERS ที่มีค่า + ปรับด้วยกิจกรรมรายวัน
  const healthScore = (() => {
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
    // Bonus/penalty from daily activity
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
  })()

  const lifeScore = calcLifeScore({
    investmentGainPct: gainPct,
    retirementProgress: retirementPct,
    healthScore,
    stepsAvg: latestDaily?.steps,
  })

  const greeting = (() => {
    const h = time.getHours()
    if (h < 12) return 'อรุณสวัสดิ์'
    if (h < 17) return 'สวัสดีตอนบ่าย'
    return 'สวัสดีตอนเย็น'
  })()

  const thisMonthIncome = financeRecords?.filter(r => r.type === 'income' && r.date.startsWith(time.toISOString().slice(0, 7))).reduce((s, r) => s + r.amount, 0) ?? 0
  const thisMonthExpense = financeRecords?.filter(r => r.type === 'expense' && r.date.startsWith(time.toISOString().slice(0, 7))).reduce((s, r) => s + r.amount, 0) ?? 0

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
            <div className="text-sm opacity-75">{greeting} 👋</div>
            <div className="text-[28px] font-bold leading-tight">{profile.nickname}</div>
          </div>
          <button onClick={() => navigate('/settings')} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
            ⚙️
          </button>
        </div>

        {/* Age real-time */}
        <div className="bg-white/15 rounded-2xl p-3 mb-4">
          <div className="text-xs opacity-75 mb-1">อายุปัจจุบัน</div>
          <div className="text-xl font-bold">
            {age?.years} ปี {age?.months} เดือน {age?.days} วัน
          </div>
          <div className="text-xs opacity-60 mt-0.5">เกิด {new Date(profile.dob).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>

        {/* Life Score */}
        <div className="bg-white/15 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs opacity-75">Life Score</div>
            <div className="text-xs opacity-60">คะแนนชีวิตรวม</div>
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
              <div className="text-xs opacity-60 mt-1">
                {lifeScore >= 80 ? 'ยอดเยี่ยม 🎉' : lifeScore >= 60 ? 'ดี 👍' : 'ต้องปรับปรุง 💪'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <Card onClick={() => navigate('/investment')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-400 mb-1">พอร์ตลงทุน</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(totalCurrent)}</div>
          <div className={`text-sm font-semibold ${gainPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
          </div>
        </Card>
        <Card onClick={() => navigate('/health')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-400 mb-1">สุขภาพ</div>
          <div className="text-lg font-bold text-gray-900">{healthScore}/100</div>
          <div className={`text-sm font-semibold ${healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
            {healthScore >= 80 ? 'ดี' : healthScore >= 60 ? 'ปานกลาง' : 'ต้องดูแล'}
          </div>
        </Card>
        <Card onClick={() => navigate('/retirement')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-400 mb-1">แผนเกษียณ</div>
          <div className="text-lg font-bold text-gray-900">{retirementPct.toFixed(0)}%</div>
          <div className="text-sm text-gray-500">ของเป้าหมาย</div>
        </Card>
        <Card onClick={() => navigate('/finance')} className="!p-3">
          <div className="text-[11px] font-semibold text-gray-400 mb-1">เดือนนี้</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(thisMonthExpense)}</div>
          <div className="text-sm text-green-600">รับ {formatCurrency(thisMonthIncome)}</div>
        </Card>
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

function DailyBriefing({ navigate, age }: { navigate: (path: string) => void; age: number }) {
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
}
