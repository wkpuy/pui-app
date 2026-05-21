import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useMemo, memo } from 'react'
import { db } from '../db'
import { getAgeDetail, formatCurrency } from '../utils/calculations'
import { fetchCalendarEvents } from '../api/google'
import { BIOMARKERS } from './Health'

// ─── Clock — ticks every minute ───────────────────────────────────────────────
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
    return () => { clearTimeout(timeoutId); if (intervalId !== undefined) clearInterval(intervalId) }
  }, [])
  return time
}

function greetingText(h: number) {
  if (h < 12) return 'อรุณสวัสดิ์'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatEventTime(ev: any): string {
  if (ev.start?.dateTime) {
    return new Date(ev.start.dateTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }
  return 'ทั้งวัน'
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const time = useClock()
  const today = time.toISOString().slice(0, 10)
  const monthKey = time.toISOString().slice(0, 7)

  // ── DB ────────────────────────────────────────────────────────────────────
  const profile       = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const todayDaily    = useLiveQuery(() => db.healthDaily.where('date').equals(today).first(), [today])
  const latestDaily   = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const latestRecord  = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const todayLumen    = useLiveQuery(() => db.lumenEntries.where('date').equals(today).first(), [today])
  const medications   = useLiveQuery(() => db.medications.where('active').equals(1).toArray())
  const medLogs       = useLiveQuery(() => db.medicationLogs.where('date').equals(today).toArray(), [today])
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray())
  const monthFinance  = useLiveQuery(
    () => db.financeRecords.where('date').between(monthKey + '-01', monthKey + '-31', true, true).toArray(),
    [monthKey],
  )
  const googleTokens  = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))
  const investments   = useLiveQuery(() => db.investments.toArray())

  // ── Calendar ─────────────────────────────────────────────────────────────
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [calLoading, setCalLoading] = useState(false)

  useEffect(() => {
    if (!googleTokens?.accessToken) return
    setCalLoading(true)
    const start = new Date(today + 'T00:00:00')
    const end   = new Date(today + 'T23:59:59')
    fetchCalendarEvents(googleTokens.accessToken, start.toISOString(), end.toISOString())
      .then(evs => setTodayEvents(evs.filter((e: any) => e.summary)))
      .catch(() => setTodayEvents([]))
      .finally(() => setCalLoading(false))
  }, [googleTokens?.accessToken, today]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quick weight ──────────────────────────────────────────────────────────
  const [showWeightInput, setShowWeightInput] = useState(false)
  const [weightVal, setWeightVal] = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const weightRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (showWeightInput) setTimeout(() => weightRef.current?.focus(), 100) }, [showWeightInput])

  async function saveQuickWeight() {
    const w = parseFloat(weightVal)
    if (!w || w < 20 || w > 300) return
    setWeightSaving(true)
    try {
      const existing = await db.healthDaily.where('date').equals(today).first()
      if (existing) await db.healthDaily.update(existing.id!, { weightKg: w })
      else await db.healthDaily.add({ date: today, weightKg: w })
      setWeightVal('')
      setShowWeightInput(false)
    } finally { setWeightSaving(false) }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const age = useMemo(() => profile ? getAgeDetail(profile.dob) : null, [profile, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const daily = todayDaily ?? latestDaily
  const weightToday = daily?.weightKg
  const sleepHrs    = daily?.sleepTotal
  const lumenMorning = todayLumen?.morningScore
  const lumenLogged  = [todayLumen?.morningScore, todayLumen?.afternoonScore, todayLumen?.nightScore].filter(Boolean).length

  // Medication checklist
  const dailyMeds = useMemo(() => (medications ?? []).filter(m => m.frequency === 'daily'), [medications])
  const takenIds  = useMemo(() => new Set((medLogs ?? []).filter(l => l.taken).map(l => l.medicationId)), [medLogs])

  // Upcoming subscriptions ≤ 7 days
  const upcomingSubs = useMemo(() =>
    (subscriptions ?? []).filter(s => {
      if (!s.active) return false
      const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / 86400000)
      return days >= 0 && days <= 7
    }).sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate)),
  [subscriptions])

  // Finance this month
  const { income, expense } = useMemo(() => ({
    income:  monthFinance?.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0,
    expense: monthFinance?.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0,
  }), [monthFinance])

  // Health alerts
  const healthAlerts = useMemo(() => {
    if (!latestRecord) return []
    const alerts: string[] = []
    for (const [k, v] of Object.entries(latestRecord)) {
      if (typeof v !== 'number') continue
      const def = (BIOMARKERS as any)[k]
      if (!def) continue
      if (def.evaluate(v) === 'high') alerts.push(def.label)
    }
    return alerts
  }, [latestRecord])

  // Investment snapshot
  const { totalCurrent, gainPct } = useMemo(() => {
    const cost = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
    const cur  = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
    return { totalCurrent: cur, gainPct: cost > 0 ? ((cur - cost) / cost) * 100 : 0 }
  }, [investments])

  // ── Lumen advice ─────────────────────────────────────────────────────────
  const lumenAdvice = useMemo(() => {
    if (!lumenMorning) return null
    if (lumenMorning <= 2) return { color: 'emerald', text: 'เผาไขมันได้ดี 🔥 กินไข่+โปรตีนเช้า หลีกเลี่ยง carb' }
    if (lumenMorning === 3) return { color: 'amber', text: 'ยังไม่ switch ดีพอ ⚠️ กินโปรตีนล้วน ลองออกกำลังกายเช้า' }
    return { color: 'red', text: 'ยังเผาคาร์บอยู่ ❌ ลด carb ทุกมื้อ เพิ่มโปรตีน+ผักวันนี้' }
  }, [lumenMorning])

  // ── Sleep advice ──────────────────────────────────────────────────────────
  const sleepAdvice = useMemo(() => {
    if (!sleepHrs) return null
    if (sleepHrs >= 7) return { color: 'blue', text: `นอน ${sleepHrs} ชม. เพียงพอ ✅` }
    return { color: 'amber', text: `นอน ${sleepHrs} ชม. น้อยไป ⚠️ พยายามนอนก่อน 4 ทุ่มคืนนี้` }
  }, [sleepHrs])

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-6xl">👋</div>
        <h2 className="text-2xl font-bold text-gray-900">ยินดีต้อนรับ</h2>
        <p className="text-gray-500">ตั้งค่าข้อมูลส่วนตัวก่อนเริ่มใช้งาน</p>
        <button onClick={() => navigate('/settings')}
          className="bg-indigo-600 text-white font-semibold px-8 py-3 rounded-2xl active:scale-95">
          เริ่มตั้งค่า
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] opacity-80">{greetingText(time.getHours())} 👋</div>
            <div className="text-[26px] font-bold leading-tight">{profile.nickname}</div>
            <div className="text-[12px] opacity-70 mt-0.5">{thaiDate(time)} · {time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <button onClick={() => navigate('/settings')} aria-label="ตั้งค่า"
            className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-xl">⚙️</button>
        </div>

        {/* Quick stats strip */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden mt-1">
          <StatChip icon="🎂" label={`${age?.years} ปี ${age?.months} เดือน`} onClick={() => navigate('/settings')} />
          <StatChip
            icon="⚖️"
            label={weightToday ? `${weightToday} กก.` : 'กรอกน้ำหนัก'}
            highlight={!weightToday}
            onClick={() => setShowWeightInput(v => !v)}
          />
          {sleepHrs && <StatChip icon="😴" label={`${sleepHrs} ชม.`} warn={sleepHrs < 7} onClick={() => navigate('/health')} />}
          {daily?.steps && <StatChip icon="👣" label={daily.steps.toLocaleString()} onClick={() => navigate('/health')} />}
          {daily?.hrv && <StatChip icon="🫀" label={`HRV ${daily.hrv}`} onClick={() => navigate('/health')} />}
        </div>

        {/* Weight input inline */}
        {showWeightInput && (
          <div className="mt-2 flex gap-2 items-center bg-white/15 rounded-xl px-3 py-2">
            <span>⚖️</span>
            <input ref={weightRef} type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveQuickWeight()}
              placeholder="น้ำหนัก (กก.)" step="0.1" min="20" max="300"
              className="flex-1 bg-transparent text-[14px] font-semibold text-white placeholder:text-white/50 outline-none" />
            <button onClick={saveQuickWeight} disabled={weightSaving || !weightVal}
              className="bg-white text-purple-700 text-[12px] font-bold px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-40">
              {weightSaving ? '...' : 'บันทึก'}
            </button>
            <button onClick={() => { setShowWeightInput(false); setWeightVal('') }} className="text-white/60 text-lg px-1">×</button>
          </div>
        )}
      </div>

      <div className="space-y-0 pb-8">

        {/* ── Quick Actions ── */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {[
              { icon: '🔥', label: 'Lumen', color: 'bg-orange-50 text-orange-600', path: '/lumen' },
              { icon: '💸', label: 'บันทึกจ่าย', color: 'bg-red-50 text-red-600', path: '/finance' },
              { icon: '📅', label: 'ปฏิทิน', color: 'bg-indigo-50 text-indigo-600', path: '/calendar' },
              { icon: '💬', label: 'AI Coach', color: 'bg-violet-50 text-violet-600', path: '/coach' },
              { icon: '📈', label: 'พอร์ต', color: 'bg-blue-50 text-blue-600', path: '/investment' },
              { icon: '🧾', label: 'ภาษี', color: 'bg-amber-50 text-amber-700', path: '/tax' },
            ].map(a => (
              <button key={a.label} onClick={() => navigate(a.path)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform ${a.color}`}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Metabolism & Sleep advice ── */}
        {(lumenAdvice || sleepAdvice || !todayLumen) && (
          <BriefSection title="🔥 Metabolism & การนอน" onMore={() => navigate('/lumen')}>
            {!todayLumen ? (
              <ActionCard
                icon="🔥" title="ยังไม่ได้วัด Lumen วันนี้"
                desc="วัดก่อนกินอะไรเพื่อรู้ว่าร่างกายเผาไขมันหรือคาร์บ"
                color="orange" action="วัดเลย" onAction={() => navigate('/lumen')}
              />
            ) : (
              <div className={`rounded-xl px-3 py-2.5 flex items-start gap-2.5 border
                ${lumenMorning! <= 2 ? 'bg-emerald-50 border-emerald-100' : lumenMorning === 3 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0
                  ${lumenMorning! <= 2 ? 'bg-emerald-500' : lumenMorning === 3 ? 'bg-amber-400' : 'bg-red-400'}`}>
                  {lumenMorning}
                </div>
                <div>
                  <div className="text-[12px] font-bold text-gray-700 mb-0.5">Lumen เช้า · {lumenLogged}/3 ค่าวันนี้</div>
                  <div className="text-[12px] text-gray-600">{lumenAdvice?.text}</div>
                </div>
              </div>
            )}
            {sleepAdvice && (
              <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2.5 border
                ${sleepHrs! >= 7 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                <span className="text-xl flex-shrink-0">😴</span>
                <div className="text-[12px] text-gray-600">{sleepAdvice.text}</div>
              </div>
            )}
          </BriefSection>
        )}

        {/* ── Calendar today ── */}
        <BriefSection title="📅 วันนี้" onMore={() => navigate('/calendar')}>
          {!googleTokens?.accessToken ? (
            <ActionCard icon="📅" title="ยังไม่ได้เชื่อมต่อ Google Calendar"
              desc="" color="indigo" action="เชื่อมต่อ" onAction={() => navigate('/settings')} />
          ) : calLoading ? (
            <div className="text-[13px] text-gray-400 py-2">กำลังโหลด...</div>
          ) : todayEvents.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-[13px] text-gray-400">
              ไม่มีกำหนดการวันนี้ 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.slice(0, 5).map((ev: any, i: number) => {
                const t = formatEventTime(ev)
                const isAllDay = !ev.start?.dateTime
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 flex items-start gap-3 px-3 py-2.5">
                    <div className={`flex-shrink-0 text-[11px] font-bold py-1 px-2 rounded-lg min-w-[44px] text-center
                      ${isAllDay ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-700'}`}>{t}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800 truncate">{ev.summary}</div>
                      {ev.location && <div className="text-[11px] text-gray-400 truncate">📍 {ev.location}</div>}
                    </div>
                  </div>
                )
              })}
              {todayEvents.length > 5 && (
                <button onClick={() => navigate('/calendar')} className="text-[12px] text-indigo-500 font-semibold pl-1">
                  +{todayEvents.length - 5} รายการ →
                </button>
              )}
            </div>
          )}
        </BriefSection>

        {/* ── Checklist: medication ── */}
        {dailyMeds.length > 0 && (
          <BriefSection title="✅ ยา/วิตามินวันนี้" onMore={() => navigate('/health')}>
            <div className="space-y-1.5">
              {dailyMeds.map(med => {
                const taken = takenIds.has(med.id!)
                return (
                  <button key={med.id}
                    onClick={async () => {
                      const existing = await db.medicationLogs.where('[medicationId+date]').equals([med.id!, today]).first()
                      if (existing) await db.medicationLogs.update(existing.id!, { taken: !existing.taken })
                      else await db.medicationLogs.add({ medicationId: med.id!, date: today, taken: true })
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors
                      ${taken ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${taken ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                      {taken && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-[13px] font-semibold ${taken ? 'text-green-700 line-through opacity-60' : 'text-gray-800'}`}>
                        {med.name}
                      </div>
                      <div className="text-[11px] text-gray-400">{med.dose} · {med.timeOfDay ?? 'ไม่ระบุเวลา'}</div>
                    </div>
                    {taken && <span className="text-[11px] text-green-600 font-semibold">กินแล้ว ✓</span>}
                  </button>
                )
              })}
            </div>
          </BriefSection>
        )}

        {/* ── Alerts ── */}
        <AlertsSection
          healthAlerts={healthAlerts}
          upcomingSubs={upcomingSubs}
          navigate={navigate}
        />

        {/* ── Portfolio snapshot ── */}
        <BriefSection title="📈 พอร์ตลงทุน" onMore={() => navigate('/investment')}>
          <button onClick={() => navigate('/investment')}
            className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between active:scale-[0.99]">
            <div>
              <div className="text-[11px] text-gray-400 mb-0.5">มูลค่ารวม</div>
              <div className="text-[18px] font-bold text-gray-900">{formatCurrency(totalCurrent)}</div>
            </div>
            <div className={`text-right`}>
              <div className={`text-[15px] font-bold ${gainPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
              </div>
              <div className="text-[11px] text-gray-400">กำไร/ขาดทุนรวม</div>
            </div>
          </button>
        </BriefSection>

        {/* ── Finance this month ── */}
        <BriefSection title="💰 การเงินเดือนนี้" onMore={() => navigate('/finance')}>
          <button onClick={() => navigate('/finance')}
            className="w-full bg-white rounded-xl border border-gray-100 overflow-hidden active:scale-[0.99]">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="px-3 py-2.5 text-center">
                <div className="text-[10px] text-gray-400 mb-0.5">รายรับ</div>
                <div className="text-[13px] font-bold text-emerald-600">{formatCurrency(income)}</div>
              </div>
              <div className="px-3 py-2.5 text-center">
                <div className="text-[10px] text-gray-400 mb-0.5">รายจ่าย</div>
                <div className="text-[13px] font-bold text-red-500">{formatCurrency(expense)}</div>
              </div>
              <div className="px-3 py-2.5 text-center">
                <div className="text-[10px] text-gray-400 mb-0.5">คงเหลือ</div>
                <div className={`text-[13px] font-bold ${income - expense >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                  {formatCurrency(income - expense)}
                </div>
              </div>
            </div>
            {income > 0 && (
              <div className="px-3 pb-2">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((expense / income) * 100, 100)}%` }} />
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">ใช้ไป {((expense / income) * 100).toFixed(0)}% ของรายรับ</div>
              </div>
            )}
          </button>
        </BriefSection>

      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function BriefSection({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-bold text-gray-600">{title}</div>
        {onMore && <button onClick={onMore} className="text-[12px] text-indigo-500 font-semibold active:opacity-70">ดูเพิ่ม →</button>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function StatChip({ icon, label, warn, highlight, onClick }: {
  icon: string; label: string; warn?: boolean; highlight?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border active:opacity-70
        ${warn ? 'bg-amber-400/30 border-amber-300/40 text-white' : highlight ? 'bg-white/10 border-white/20 text-purple-200' : 'bg-white/20 border-white/30 text-white'}`}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )
}

function ActionCard({ icon, title, desc, color, action, onAction }: {
  icon: string; title: string; desc: string; color: string; action: string; onAction: () => void
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 border-orange-100', indigo: 'bg-indigo-50 border-indigo-100',
    amber: 'bg-amber-50 border-amber-100', red: 'bg-red-50 border-red-100',
  }
  return (
    <div className={`rounded-xl px-3 py-2.5 border flex items-center gap-3 ${colors[color] ?? 'bg-gray-50 border-gray-100'}`}>
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-gray-700">{title}</div>
        {desc && <div className="text-[11px] text-gray-500">{desc}</div>}
      </div>
      <button onClick={onAction} className="text-[12px] text-indigo-600 font-bold flex-shrink-0 active:opacity-70">{action} →</button>
    </div>
  )
}

const AlertsSection = memo(function AlertsSection({ healthAlerts, upcomingSubs, navigate }: {
  healthAlerts: string[]
  upcomingSubs: any[]
  navigate: (p: string) => void
}) {
  const installments = useLiveQuery(() => db.installments.toArray())
  const taxRecords   = useLiveQuery(() => db.taxRecords.toArray())

  const alerts: { icon: string; text: string; color: string; path: string }[] = []

  // Health alerts
  if (healthAlerts.length > 0) {
    alerts.push({ icon: '🩺', text: `ผลตรวจผิดปกติ: ${healthAlerts.slice(0, 2).join(', ')}${healthAlerts.length > 2 ? ` +${healthAlerts.length - 2}` : ''}`, color: 'bg-red-50 border-red-100', path: '/health' })
  }

  // Installments
  const activeInst = (installments ?? []).filter(i => i.paidInstallments < i.totalInstallments)
  const totalInst = activeInst.reduce((s, i) => s + i.monthlyAmount, 0)
  if (totalInst > 0) {
    alerts.push({ icon: '💳', text: `ยอดผ่อนเดือนนี้ ${formatCurrency(totalInst)} (${activeInst.length} รายการ)`, color: 'bg-blue-50 border-blue-100', path: '/finance' })
  }

  // Subscriptions
  for (const s of upcomingSubs.slice(0, 2)) {
    const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / 86400000)
    alerts.push({
      icon: '🔔',
      text: `${s.name} ต่ออายุ${days === 0 ? 'วันนี้!' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`} (${formatCurrency(s.amount)})`,
      color: 'bg-amber-50 border-amber-100', path: '/finance',
    })
  }

  // Tax end of year
  if (taxRecords) {
    const month = new Date().getMonth() + 1
    const currentBE = new Date().getFullYear() + 543
    const taxRec = taxRecords.find(r => r.year === currentBE)
    if (taxRec && month >= 10) {
      const gross = (taxRec.totalIncome || 0) + (taxRec.bonus || 0) + (taxRec.otherIncome || 0)
      const unused = Math.max(Math.min(gross * 0.30, 500_000) - (taxRec.rmf || 0), 0) + Math.max(Math.min(gross * 0.30, 200_000) - (taxRec.ssf || 0), 0)
      if (unused > 50_000) alerts.push({ icon: '🧾', text: `ปลายปีแล้ว! RMF/SSF เหลือสิทธิ์ ${formatCurrency(unused)}`, color: 'bg-amber-50 border-amber-100', path: '/tax' })
    }
  }

  if (alerts.length === 0) return null

  return (
    <BriefSection title="⚠️ แจ้งเตือน">
      {alerts.slice(0, 4).map((a, i) => (
        <button key={i} onClick={() => navigate(a.path)}
          className={`w-full ${a.color} border rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left active:scale-[0.98]`}>
          <span className="text-base flex-shrink-0">{a.icon}</span>
          <span className="text-[13px] text-gray-700 font-medium">{a.text}</span>
        </button>
      ))}
    </BriefSection>
  )
})

// keep re-exporting BIOMARKERS used by DailyBriefing (legacy — now inlined above)
export { }
