import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { formatCurrency } from '../utils/calculations'

export default function AnnualWrapped() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()
  const yearStr = year.toString()

  const investments = useLiveQuery(() => db.investments.toArray())
  const allDaily = useLiveQuery(() => db.healthDaily.orderBy('date').toArray())
  const allFinance = useLiveQuery(() => db.financeRecords.orderBy('date').toArray())
  const allHealth = useLiveQuery(() => db.healthRecords.orderBy('date').toArray())

  const yearDaily = allDaily?.filter(d => d.date.startsWith(yearStr)) ?? []
  const yearFinance = allFinance?.filter(r => r.date.startsWith(yearStr)) ?? []

  const totalSteps = yearDaily.reduce((s, d) => s + (d.steps ?? 0), 0)
  const avgSleep = yearDaily.length > 0 ? yearDaily.reduce((s, d) => s + (d.sleepTotal ?? 0), 0) / yearDaily.length : 0
  const totalIncome = yearFinance.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = yearFinance.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const totalSaved = totalIncome - totalExpense

  const portfolioGain = investments ? investments.reduce((s, i) => s + (i.currentValue - i.costBasis), 0) : 0
  const portfolioGainPct = investments ? investments.reduce((s, i) => s + i.costBasis, 0) > 0
    ? (portfolioGain / investments.reduce((s, i) => s + i.costBasis, 0)) * 100 : 0 : 0

  const topExpenseCategory = yearFinance
    .filter(r => r.type === 'expense')
    .reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + r.amount; return acc }, {} as Record<string, number>)
  const topCat = Object.entries(topExpenseCategory).sort((a, b) => b[1] - a[1])[0]

  const healthRecordsThisYear = allHealth?.filter(r => r.date.startsWith(yearStr)) ?? []

  const stats = [
    { icon: '👣', title: 'เดินรวม', value: totalSteps.toLocaleString(), unit: 'ก้าว', color: 'from-green-400 to-emerald-600' },
    { icon: '😴', title: 'นอนเฉลี่ย', value: avgSleep.toFixed(1), unit: 'ชม./วัน', color: 'from-blue-400 to-indigo-600' },
    { icon: '💰', title: 'ออมได้ปีนี้', value: formatCurrency(totalSaved), unit: '', color: 'from-amber-400 to-orange-500' },
    { icon: '📈', title: 'พอร์ตปีนี้', value: `${portfolioGainPct >= 0 ? '+' : ''}${portfolioGainPct.toFixed(1)}%`, unit: `${formatCurrency(portfolioGain)}`, color: portfolioGainPct >= 0 ? 'from-green-500 to-teal-600' : 'from-red-400 to-rose-600' },
    { icon: '🛍️', title: 'จ่ายเยอะสุด', value: topCat?.[0] ?? '—', unit: topCat ? formatCurrency(topCat[1]) : '', color: 'from-purple-400 to-violet-600' },
    { icon: '🩺', title: 'ผลตรวจ', value: healthRecordsThisYear.length.toString(), unit: 'ครั้ง', color: 'from-pink-400 to-rose-500' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <button onClick={() => navigate("/")} className="text-white/60 text-sm">← กลับ</button>
        <div className="text-white font-bold text-lg">ปี {year} ของคุณ 🎉</div>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Hero */}
        <div className="text-center py-6">
          <div className="text-6xl mb-4">🎊</div>
          <div className="text-white text-2xl font-bold mb-2">ปี {year} สรุปแล้ว</div>
          <div className="text-white/60 text-sm">ดูว่าปีนี้คุณทำอะไรไปบ้าง</div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {stats.map((s, i) => (
            <div key={i} className={`bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white`}>
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-xs opacity-80 mb-1">{s.title}</div>
              <div className="text-xl font-bold leading-tight">{s.value}</div>
              {s.unit && <div className="text-xs opacity-70 mt-0.5">{s.unit}</div>}
            </div>
          ))}
        </div>

        {/* Share button */}
        <div className="text-center">
          <div className="text-white/40 text-xs mb-4">Personal App · {year}</div>
          <button
            onClick={() => {
              const text = `ปี ${year} ของฉัน:\n👣 เดิน ${totalSteps.toLocaleString()} ก้าว\n💰 ออม ${formatCurrency(totalSaved)}\n📈 พอร์ต ${portfolioGainPct >= 0 ? '+' : ''}${portfolioGainPct.toFixed(1)}%\n😴 นอนเฉลี่ย ${avgSleep.toFixed(1)} ชม./วัน`
              if (navigator.share) navigator.share({ text })
            }}
            className="bg-white/20 text-white font-semibold px-8 py-3 rounded-2xl active:scale-95"
          >
            แชร์ผลลัพธ์
          </button>
        </div>
      </div>
    </div>
  )
}
