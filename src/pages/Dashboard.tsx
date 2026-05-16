import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { db } from '../db'
import { getAgeDetail, formatCurrency, calcLifeScore } from '../utils/calculations'
import { Card, Divider } from '../components/Card'

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

  const healthScore = (() => {
    if (!latestHealth) return 50
    let score = 100
    if (latestHealth.ldl && latestHealth.ldl > 130) score -= 15
    if (latestHealth.glucose && latestHealth.glucose > 100) score -= 10
    if (latestHealth.systolic && latestHealth.systolic > 130) score -= 10
    return score
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
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm opacity-75">{greeting} 👋</div>
            <div className="text-2xl font-bold">{profile.nickname}</div>
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
      <DailyBriefing navigate={navigate} />

      <Divider />

      {/* Health snapshot */}
      {latestDaily && (
        <>
          <div className="px-5 pt-4 pb-1 text-[13px] font-semibold text-gray-500">กิจกรรมวันนี้</div>
          <div className="px-4 pb-3 grid grid-cols-4 gap-2">
            {[
              { icon: '👣', label: 'ก้าว', value: (latestDaily.steps ?? 0).toLocaleString() },
              { icon: '😴', label: 'นอน', value: `${latestDaily.sleepTotal ?? 0}ชม.` },
              { icon: '💧', label: 'น้ำ', value: `${((latestDaily.waterMl ?? 0) / 1000).toFixed(1)}L` },
              { icon: '🔥', label: 'เผาผลาญ', value: (latestDaily.caloriesBurned ?? 0).toString() },
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

function DailyBriefing({ navigate }: { navigate: (path: string) => void }) {
  const investments = useLiveQuery(() => db.investments.toArray())

  const alerts: { icon: string; text: string; color: string; path: string }[] = []

  if (investments) {
    investments.forEach(inv => {
      const pct = ((inv.currentValue - inv.costBasis) / inv.costBasis) * 100
      if (pct < -10) {
        alerts.push({ icon: '📉', text: `${inv.name} ขาดทุน ${pct.toFixed(1)}%`, color: 'bg-red-50', path: '/investment' })
      }
    })
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
        {alerts.slice(0, 3).map((a, i) => (
          <button key={i} onClick={() => navigate(a.path)} className={`${a.color} rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left active:scale-[0.98]`}>
            <span className="text-lg flex-shrink-0">{a.icon}</span>
            <span className="text-[13px] text-gray-700 font-medium">{a.text}</span>
          </button>
        ))}
      </div>
    </>
  )
}
