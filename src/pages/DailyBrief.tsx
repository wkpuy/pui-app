import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatCurrency, getAgeDetail } from '../utils/calculations'
import { fetchCalendarEvents } from '../api/google'
import { BIOMARKERS } from './Health'

// ─── helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)
const monthKey = () => new Date().toISOString().slice(0, 7)

function useClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 60000); return () => clearInterval(id) }, [])
  return t
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function thaiTime(d: Date) {
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatEventTime(ev: any): string {
  if (ev.start?.dateTime) {
    const d = new Date(ev.start.dateTime)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }
  return 'ทั้งวัน'
}

function greeting(h: number) {
  if (h < 12) return 'อรุณสวัสดิ์'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function DailyBrief() {
  const navigate = useNavigate()
  const now = useClock()
  const today = todayStr()
  const mk = monthKey()

  // ─── DB queries ───────────────────────────────────────────────────────────
  const profile        = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const investments    = useLiveQuery(() => db.investments.toArray())
  const todayDaily     = useLiveQuery(() => db.healthDaily.where('date').equals(today).first(), [today])
  const latestDaily    = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const latestRecord   = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const todayLumen     = useLiveQuery(() => db.lumenEntries.where('date').equals(today).first(), [today])
  const installments   = useLiveQuery(() => db.installments.toArray())
  const subscriptions  = useLiveQuery(() => db.subscriptions.toArray())
  const financeRecords = useLiveQuery(
    () => db.financeRecords.where('date').between(mk + '-01', mk + '-31', true, true).toArray(),
    [mk]
  )
  const googleTokens   = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))

  // ─── Calendar ─────────────────────────────────────────────────────────────
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [calLoading, setCalLoading] = useState(false)

  useEffect(() => {
    if (!googleTokens?.accessToken) return
    setCalLoading(true)
    const start = new Date(today + 'T00:00:00')
    const end   = new Date(today + 'T23:59:59')
    fetchCalendarEvents(googleTokens.accessToken, start.toISOString(), end.toISOString())
      .then(evs => {
        const filtered = evs.filter((e: any) => e.summary && !e.summary.startsWith('[ลบ]'))
        setTodayEvents(filtered)
      })
      .catch(() => setTodayEvents([]))
      .finally(() => setCalLoading(false))
  }, [googleTokens?.accessToken, today])

  // ─── Computed ─────────────────────────────────────────────────────────────
  const age = profile?.dob ? getAgeDetail(profile.dob)?.years ?? 0 : 0

  const { totalCurrent, gainAmt, gainPct } = useMemo(() => {
    const totalCurrent  = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
    const totalInvested = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
    const gainAmt  = totalCurrent - totalInvested
    const gainPct  = totalInvested > 0 ? (gainAmt / totalInvested) * 100 : 0
    return { totalCurrent, gainAmt, gainPct }
  }, [investments])

  const { income, expense } = useMemo(() => ({
    income:  financeRecords?.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0,
    expense: financeRecords?.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0,
  }), [financeRecords])

  // Upcoming subscriptions (within 7 days)
  const upcomingSubs = useMemo(() =>
    (subscriptions ?? []).filter(s => {
      if (!s.active) return false
      const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / (1000 * 3600 * 24))
      return days >= 0 && days <= 7
    }).sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate)),
  [subscriptions])

  // Installments active
  const activeInstallments = useMemo(() =>
    (installments ?? []).filter(i => i.paidInstallments < i.totalInstallments),
  [installments])
  const totalInstallment = activeInstallments.reduce((s, i) => s + i.monthlyAmount, 0)

  // Health alerts
  const healthAlerts = useMemo(() => {
    if (!latestRecord) return []
    const alerts: string[] = []
    for (const [k, v] of Object.entries(latestRecord)) {
      if (typeof v !== 'number') continue
      const def = (BIOMARKERS as any)[k]
      if (!def) continue
      if (def.evaluate(v) === 'high') alerts.push(`${def.label} ${v} ${def.unit}`)
    }
    return alerts
  }, [latestRecord])

  // Sleep quality
  const daily = todayDaily ?? latestDaily
  const sleepHrs = daily?.sleepTotal
  const sleepOk  = sleepHrs ? sleepHrs >= 7 : null

  // Lumen status
  const lumenScore = todayLumen?.morningScore
  const lumenLogged = [todayLumen?.morningScore, todayLumen?.afternoonScore, todayLumen?.nightScore].filter(Boolean).length

  // Weight
  const weightToday = todayDaily?.weightKg ?? latestDaily?.weightKg

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* ── Hero header ── */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-1 text-purple-200 text-[13px] active:opacity-70">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            หน้าหลัก
          </button>
          <div className="text-purple-200 text-[13px] font-semibold">{thaiTime(now)}</div>
        </div>

        <div className="mb-1 text-purple-200 text-[13px]">{greeting(now.getHours())} {profile?.nickname ?? ''} 👋</div>
        <div className="text-[22px] font-bold leading-tight mb-0.5">{thaiDate(now)}</div>

        {/* Quick health strip */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
          <QuickChip
            icon="⚖️"
            label={weightToday ? `${weightToday} กก.` : 'ยังไม่วัด'}
            ok={!!weightToday}
            onClick={() => navigate('/health')}
          />
          <QuickChip
            icon="😴"
            label={sleepHrs ? `${sleepHrs} ชม.` : 'ไม่มีข้อมูล'}
            ok={sleepOk}
            onClick={() => navigate('/health')}
          />
          <QuickChip
            icon="🔥"
            label={lumenScore ? `Lumen ${lumenScore}` : 'ยังไม่วัด'}
            ok={lumenScore ? lumenScore <= 2 : null}
            onClick={() => navigate('/lumen')}
          />
          {daily?.steps && (
            <QuickChip icon="👣" label={`${daily.steps.toLocaleString()} ก้าว`} ok={daily.steps >= 8000} onClick={() => navigate('/health')} />
          )}
          {daily?.hrv && (
            <QuickChip icon="🫀" label={`HRV ${daily.hrv}`} ok={daily.hrv >= 50} onClick={() => navigate('/health')} />
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* ── Calendar ── */}
        <Section title="📅 กำหนดการวันนี้" onMore={() => navigate('/calendar')}>
          {!googleTokens?.accessToken ? (
            <EmptyCard text="ยังไม่ได้เชื่อมต่อ Google Calendar" action="เชื่อมใน ตั้งค่า" onAction={() => navigate('/settings')} />
          ) : calLoading ? (
            <div className="text-[13px] text-gray-400 px-1">กำลังโหลด...</div>
          ) : todayEvents.length === 0 ? (
            <EmptyCard text="ไม่มีกำหนดการวันนี้ 🎉" />
          ) : (
            <div className="space-y-2">
              {todayEvents.map((ev: any, i: number) => {
                const time = formatEventTime(ev)
                const isAllDay = !ev.start?.dateTime
                return (
                  <div key={i} className="flex items-start gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100">
                    <div className={`flex-shrink-0 text-[11px] font-bold mt-0.5 w-12 text-center py-1 rounded-lg
                      ${isAllDay ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-700'}`}>
                      {time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800 truncate">{ev.summary}</div>
                      {ev.location && (
                        <div className="text-[11px] text-gray-400 truncate">📍 {ev.location}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Health today ── */}
        <Section title="💪 สุขภาพวันนี้" onMore={() => navigate('/health')}>
          <div className="grid grid-cols-2 gap-2">
            {/* Lumen */}
            <button onClick={() => navigate('/lumen')}
              className={`rounded-xl p-3 text-left border ${lumenScore ? (lumenScore <= 2 ? 'bg-emerald-50 border-emerald-100' : lumenScore === 3 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100') : 'bg-gray-50 border-gray-100'}`}>
              <div className="text-[11px] text-gray-400 mb-1">🔥 Lumen วันนี้</div>
              {lumenScore ? (
                <>
                  <div className="text-xl font-bold text-gray-800">{lumenScore}</div>
                  <div className={`text-[11px] font-semibold ${lumenScore <= 2 ? 'text-emerald-600' : lumenScore === 3 ? 'text-amber-500' : 'text-red-500'}`}>
                    {lumenScore <= 2 ? 'เผาไขมัน 🔥' : lumenScore === 3 ? 'กลางๆ ⚖️' : 'เผาคาร์บ 🍚'}
                  </div>
                  <div className="text-[10px] text-gray-400">{lumenLogged}/3 ค่า</div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-semibold text-gray-400">ยังไม่ได้วัด</div>
                  <div className="text-[11px] text-indigo-500 font-semibold mt-1">วัดเลย →</div>
                </>
              )}
            </button>

            {/* Sleep */}
            <div className={`rounded-xl p-3 border ${sleepOk === true ? 'bg-blue-50 border-blue-100' : sleepOk === false ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className="text-[11px] text-gray-400 mb-1">😴 การนอน</div>
              {sleepHrs ? (
                <>
                  <div className="text-xl font-bold text-gray-800">{sleepHrs} <span className="text-sm font-normal text-gray-400">ชม.</span></div>
                  {daily?.sleepDeep && <div className="text-[11px] text-gray-500">Deep {daily.sleepDeep}h · REM {daily.sleepRem ?? '—'}h</div>}
                  <div className={`text-[11px] font-semibold ${sleepOk ? 'text-blue-600' : 'text-amber-600'}`}>
                    {sleepOk ? 'เพียงพอ ✅' : 'น้อยไป ⚠️'}
                  </div>
                </>
              ) : (
                <div className="text-[13px] font-semibold text-gray-400">ไม่มีข้อมูล</div>
              )}
            </div>

            {/* Steps */}
            <div className={`rounded-xl p-3 border ${daily?.steps && daily.steps >= 8000 ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className="text-[11px] text-gray-400 mb-1">👣 ก้าว</div>
              <div className="text-xl font-bold text-gray-800">{daily?.steps?.toLocaleString() ?? '—'}</div>
              {daily?.steps && (
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min((daily.steps / 10000) * 100, 100)}%` }} />
                </div>
              )}
              <div className="text-[10px] text-gray-400 mt-0.5">เป้า 10,000</div>
            </div>

            {/* Calories */}
            <div className="rounded-xl p-3 border bg-gray-50 border-gray-100">
              <div className="text-[11px] text-gray-400 mb-1">🔥 เผาผลาญ</div>
              <div className="text-xl font-bold text-gray-800">{daily?.caloriesBurned?.toLocaleString() ?? '—'}</div>
              {daily?.caloriesBurned && <div className="text-[11px] text-gray-500">kcal</div>}
            </div>
          </div>

          {/* Health alerts */}
          {healthAlerts.length > 0 && (
            <button onClick={() => navigate('/health')}
              className="mt-2 w-full bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 flex items-start gap-2 text-left">
              <span className="text-base flex-shrink-0">🩺</span>
              <div>
                <div className="text-[12px] font-bold text-red-700">ผลตรวจผิดปกติ</div>
                <div className="text-[11px] text-red-600">{healthAlerts.slice(0, 2).join(' · ')}{healthAlerts.length > 2 ? ` +${healthAlerts.length - 2}` : ''}</div>
              </div>
            </button>
          )}
        </Section>

        {/* ── Finance ── */}
        <Section title="💰 การเงินเดือนนี้" onMore={() => navigate('/finance')}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-3 text-center">
                <div className="text-[11px] text-gray-400 mb-0.5">รายรับ</div>
                <div className="text-[15px] font-bold text-emerald-600">{formatCurrency(income)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[11px] text-gray-400 mb-0.5">รายจ่าย</div>
                <div className="text-[15px] font-bold text-red-500">{formatCurrency(expense)}</div>
              </div>
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
              <div className="text-[12px] text-gray-500">คงเหลือ</div>
              <div className={`text-[14px] font-bold ${income - expense >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                {formatCurrency(income - expense)}
              </div>
            </div>
            {income > 0 && (
              <div className="px-3 pb-2.5">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${Math.min((expense / income) * 100, 100)}%` }} />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">ใช้ไป {income > 0 ? ((expense / income) * 100).toFixed(0) : 0}% ของรายรับ</div>
              </div>
            )}
          </div>

          {/* Installments */}
          {totalInstallment > 0 && (
            <button onClick={() => navigate('/finance')}
              className="mt-2 w-full bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">💳</span>
                <div className="text-left">
                  <div className="text-[12px] font-semibold text-blue-800">ยอดผ่อนเดือนนี้</div>
                  <div className="text-[11px] text-blue-600">{activeInstallments.length} รายการ</div>
                </div>
              </div>
              <div className="text-[14px] font-bold text-blue-700">{formatCurrency(totalInstallment)}</div>
            </button>
          )}

          {/* Upcoming subscriptions */}
          {upcomingSubs.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {upcomingSubs.slice(0, 3).map(s => {
                const days = Math.ceil((new Date(s.nextRenewalDate).getTime() - Date.now()) / (1000 * 3600 * 24))
                return (
                  <button key={s.id} onClick={() => navigate('/finance')}
                    className="w-full bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔔</span>
                      <div className="text-left">
                        <div className="text-[12px] font-semibold text-amber-800">{s.name}</div>
                        <div className="text-[11px] text-amber-600">
                          {days === 0 ? 'ต่ออายุวันนี้!' : days === 1 ? 'ต่ออายุพรุ่งนี้' : `อีก ${days} วัน`}
                        </div>
                      </div>
                    </div>
                    <div className="text-[13px] font-bold text-amber-700">{formatCurrency(s.amount)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Investment ── */}
        <Section title="📈 พอร์ตลงทุน" onMore={() => navigate('/investment')}>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[11px] text-gray-400 mb-0.5">มูลค่าปัจจุบัน</div>
                <div className="text-[22px] font-bold text-gray-900">{formatCurrency(totalCurrent)}</div>
              </div>
              <div className="text-right">
                <div className={`text-[15px] font-bold ${gainAmt >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {gainAmt >= 0 ? '+' : ''}{formatCurrency(gainAmt)}
                </div>
                <div className={`text-[12px] font-semibold ${gainPct >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                </div>
              </div>
            </div>
            {/* Investment breakdown */}
            {investments && investments.length > 0 && (
              <div className="space-y-1 mt-2">
                {Object.entries(
                  investments.reduce((acc, inv) => {
                    const t = inv.type
                    acc[t] = (acc[t] ?? 0) + inv.currentValue
                    return acc
                  }, {} as Record<string, number>)
                ).map(([type, val]) => {
                  const pct = totalCurrent > 0 ? (val / totalCurrent) * 100 : 0
                  const labels: Record<string, string> = {
                    thai_stock: '🇹🇭 หุ้นไทย', foreign_stock: '🌍 หุ้นต่างประเทศ',
                    fund: '📦 กองทุน', insurance: '🛡️ ประกัน',
                    savings: '🏦 ออมทรัพย์', other: '📁 อื่นๆ',
                  }
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <div className="text-[11px] text-gray-500 w-28 truncate">{labels[type] ?? type}</div>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[11px] text-gray-500 w-16 text-right">{formatCurrency(val)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Section>

        {/* ── Age & quick info ── */}
        {profile && (
          <Section title="👤 ข้อมูลส่วนตัว" onMore={() => navigate('/')}>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {profile.nickname?.[0] ?? 'P'}
              </div>
              <div>
                <div className="font-bold text-gray-800">{profile.nickname}</div>
                <div className="text-[12px] text-gray-500">อายุ {age} ปี</div>
                {weightToday && profile.heightCm && (
                  <div className="text-[12px] text-gray-500">
                    BMI {(weightToday / Math.pow(profile.heightCm / 100, 2)).toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[14px] font-bold text-gray-700">{title}</div>
        {onMore && (
          <button onClick={onMore} className="text-[12px] text-indigo-500 font-semibold active:opacity-70">ดูเพิ่ม →</button>
        )}
      </div>
      {children}
    </div>
  )
}

function QuickChip({ icon, label, ok, onClick }: { icon: string; label: string; ok: boolean | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border active:opacity-70
        ${ok === true ? 'bg-white/20 border-white/30 text-white' : ok === false ? 'bg-red-400/30 border-red-300/40 text-white' : 'bg-white/10 border-white/20 text-purple-200'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function EmptyCard({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
      <div className="text-[13px] text-gray-400">{text}</div>
      {action && onAction && (
        <button onClick={onAction} className="text-[12px] text-indigo-500 font-semibold">{action}</button>
      )}
    </div>
  )
}
