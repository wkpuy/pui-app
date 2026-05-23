import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { LumenEntry, HealthDaily } from '../db'

// ─── helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10)
const nowTime = () => new Date().toTimeString().slice(0, 5) // HH:MM
const fmt = (d: string) => {
  const [y, m, day] = d.split('-')
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${parseInt(y) + 543}`
}
const nDaysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

// Flex Score components
function calcDailyFlex(entry: LumenEntry, last7MorningScores: number[]): number {
  // 1) Fasting score (40%)
  const fastingMap: Record<number, number> = { 1: 10, 2: 7, 3: 4, 4: 2, 5: 0 }
  const fastingPts = fastingMap[entry.morningScore ?? 3] ?? 4

  // 2) Delta score (40%) — range of all scores in the day
  const scores = [
    entry.morningScore,
    entry.preWorkoutScore,
    entry.postWorkoutScore,
    entry.afternoonScore,
    entry.nightScore,
  ].filter(Boolean) as number[]
  const delta = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : 0
  const deltaMap: Record<number, number> = { 0: 0, 1: 2, 2: 5, 3: 7, 4: 10 }
  const deltaPts = deltaMap[Math.min(delta, 4)] ?? 0

  // 3) Consistency (20%) — % of last 7 days morning score ≤ 2
  const goodDays = last7MorningScores.filter(s => s <= 2).length
  const consistencyPts = last7MorningScores.length > 0
    ? (goodDays / last7MorningScores.length) * 10
    : 5

  const daily = (fastingPts * 0.4 + deltaPts * 0.4 + consistencyPts * 0.2) * 10
  return Math.round(daily)
}

function calcFlexScore(entries: LumenEntry[]): number {
  if (entries.length === 0) return 0
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const last7 = sorted.slice(-7)
  const morningScores = sorted.map(e => e.morningScore).filter(Boolean) as number[]

  const scores = last7.map((e, i) => {
    const prev7 = morningScores.slice(Math.max(0, morningScores.length - 7 + i - 7), morningScores.length - 7 + i)
    return calcDailyFlex(e, prev7)
  })
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function flexLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100' }
  if (score >= 60) return { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-100' }
  if (score >= 40) return { label: 'Fair', color: 'text-amber-700', bg: 'bg-amber-100' }
  return { label: 'Poor', color: 'text-red-700', bg: 'bg-red-100' }
}

function scoreColor(s: number) {
  if (s <= 2) return 'bg-emerald-500'
  if (s === 3) return 'bg-amber-400'
  return 'bg-red-400'
}

function scoreLabel(s?: number) {
  if (!s) return '—'
  const labels = ['', 'เผาไขมัน', 'เผาไขมัน', 'กลางๆ', 'เผาคาร์บ', 'เผาคาร์บ']
  return labels[s]
}

function ScoreButton({ v, selected, onChange }: { v: number; selected?: number; onChange: (n: number) => void }) {
  const active = v === selected
  return (
    <button
      type="button"
      onClick={() => onChange(active ? 0 : v)}
      className={`w-10 h-10 rounded-xl font-bold text-[15px] transition-all border-2
        ${active ? `${scoreColor(v)} text-white border-transparent shadow-md scale-110` : 'bg-gray-100 text-gray-500 border-gray-200'}`}
    >
      {v}
    </button>
  )
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'log' | 'history' | 'analysis'

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Lumen() {
  const [tab, setTab] = useState<Tab>('dashboard')

  const entries = useLiveQuery(() => db.lumenEntries.orderBy('date').reverse().toArray(), [])
  const allDaily = useLiveQuery(() => db.healthDaily.orderBy('date').reverse().toArray(), [])

  const todayEntry = useMemo(() =>
    entries?.find(e => e.date === today()), [entries])

  const todayWeight = useMemo(() => {
    const d = allDaily?.find(h => h.date === today())
    return d?.weightKg
  }, [allDaily])

  const flexScore = useMemo(() => {
    if (!entries) return 0
    const last14 = entries.slice(0, 14).reverse()
    return calcFlexScore(last14)
  }, [entries])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'แดชบอร์ด', icon: '📊' },
    { id: 'log', label: 'บันทึก', icon: '📝' },
    { id: 'history', label: 'ประวัติ', icon: '📋' },
    { id: 'analysis', label: 'วิเคราะห์', icon: '🔍' },
  ]

  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-4 pt-12 pb-4 text-white">
        <button
          onClick={() => navigate('/health')}
          className="flex items-center gap-1 text-orange-100 text-[13px] mb-3 active:opacity-70"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          สุขภาพ
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🔥</span>
          <h1 className="text-xl font-bold">Lumen Metabolism</h1>
        </div>
        <p className="text-orange-100 text-[13px]">ติดตาม Metabolic Score และเป้าหมายลดน้ำหนัก</p>
      </div>

      {/* Tab bar */}
      <div className="flex bg-white border-b border-gray-100 px-2 sticky top-0 z-10">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[11px] font-semibold transition-colors
              ${tab === t.id ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400'}`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && (
          <DashboardTab
            entries={entries ?? []}
            allDaily={allDaily ?? []}
            flexScore={flexScore}
            todayEntry={todayEntry}
            todayWeight={todayWeight}
            onLog={() => setTab('log')}
          />
        )}
        {tab === 'log' && (
          <LogTab
            allDaily={allDaily ?? []}
            onSaved={() => setTab('dashboard')}
          />
        )}
        {tab === 'history' && (
          <HistoryTab entries={entries ?? []} allDaily={allDaily ?? []} />
        )}
        {tab === 'analysis' && (
          <AnalysisTab entries={entries ?? []} allDaily={allDaily ?? []} />
        )}
      </div>
    </div>
  )
}

// ─── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashboardTab({
  entries, allDaily, flexScore, todayEntry, todayWeight, onLog
}: {
  entries: LumenEntry[]
  allDaily: HealthDaily[]
  flexScore: number
  todayEntry?: LumenEntry
  todayWeight?: number
  onLog: () => void
}) {
  const fl = flexLabel(flexScore)
  const last7 = useMemo(() => {
    const days: string[] = []
    for (let i = 6; i >= 0; i--) days.push(nDaysAgo(i))
    return days.map(d => ({
      date: d,
      entry: entries.find(e => e.date === d),
      weight: allDaily.find(h => h.date === d)?.weightKg,
    }))
  }, [entries, allDaily])

  const loggedToday = [
    todayEntry?.morningScore,
    todayEntry?.afternoonScore,
    todayEntry?.nightScore,
  ].filter(Boolean).length

  // Weight trend
  const weightEntries = allDaily.filter(d => d.weightKg).sort((a, b) => a.date.localeCompare(b.date))
  const latestWeight = weightEntries[weightEntries.length - 1]
  const prevWeight = weightEntries[weightEntries.length - 2]
  const weightChange = latestWeight?.weightKg && prevWeight?.weightKg
    ? latestWeight.weightKg - prevWeight.weightKg : null

  const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Flex Score card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="text-[13px] font-semibold text-gray-500 mb-3">Flex Score (7 วันล่าสุด)</div>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={flexScore >= 80 ? '#10b981' : flexScore >= 60 ? '#3b82f6' : flexScore >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${flexScore} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-xl font-bold text-gray-800">{flexScore}</span>
            </div>
          </div>
          <div>
            <div className={`inline-block px-3 py-1 rounded-full text-[13px] font-bold ${fl.bg} ${fl.color} mb-1`}>
              {fl.label}
            </div>
            <div className="text-[12px] text-gray-500">
              {flexScore >= 70
                ? 'metabolism ยืดหยุ่นดีมาก!'
                : flexScore >= 50
                ? 'กำลังพัฒนา ทำต่อไปนะ'
                : 'ยังต้องปรับอาหาร+การนอน'}
            </div>
          </div>
        </div>
      </div>

      {/* Today summary */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-gray-500">วันนี้</div>
          {todayWeight ? (
            <div className="flex items-center gap-1 text-[13px]">
              <span className="text-gray-400">⚖️</span>
              <span className="font-bold text-gray-700">{todayWeight} กก.</span>
              {weightChange !== null && (
                <span className={`text-[11px] font-semibold ${weightChange <= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}
                </span>
              )}
              <span className="text-[10px] text-gray-400">(จาก Health)</span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400">ไม่มีข้อมูลน้ำหนักวันนี้</div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: '🌅 เช้า', score: todayEntry?.morningScore, remark: todayEntry?.morningRemark, time: todayEntry?.morningTime },
            { label: '🍽️ บ่าย', score: todayEntry?.afternoonScore, remark: todayEntry?.afternoonRemark, time: todayEntry?.afternoonTime },
            { label: '🌙 คืน', score: todayEntry?.nightScore, remark: todayEntry?.nightRemark, time: todayEntry?.nightTime },
          ].map(({ label, score, remark, time }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
              <div className="text-[11px] text-gray-400 mb-1">{label}</div>
              {score ? (
                <>
                  <div className={`w-8 h-8 rounded-full ${scoreColor(score)} text-white font-bold text-sm flex items-center justify-center mx-auto mb-1`}>
                    {score}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight">{scoreLabel(score)}</div>
                  {time && <div className="text-[10px] text-gray-400 mt-0.5">🕐 {time}</div>}
                  {remark && <div className="text-[10px] text-gray-400 truncate mt-0.5">{remark}</div>}
                </>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-1">
                  <span className="text-gray-400 text-sm">—</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Workout if exists */}
        {todayEntry?.didWorkout && (
          <div className="bg-orange-50 rounded-xl p-2.5 mb-3">
            <div className="text-[11px] font-semibold text-orange-700 mb-1">
              💪 ออกกำลังกายวันนี้ — {todayEntry.workoutType} {todayEntry.workoutMinutes && `${todayEntry.workoutMinutes} นาที`}
            </div>
            <div className="flex gap-3 text-[12px]">
              {todayEntry.preWorkoutScore && (
                <span>ก่อน: <strong>{todayEntry.preWorkoutScore}</strong></span>
              )}
              {todayEntry.postWorkoutScore && (
                <span>หลัง: <strong>{todayEntry.postWorkoutScore}</strong></span>
              )}
              {todayEntry.preWorkoutScore && todayEntry.postWorkoutScore && (
                <span className={todayEntry.postWorkoutScore < todayEntry.preWorkoutScore ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                  {todayEntry.postWorkoutScore < todayEntry.preWorkoutScore ? '▼ ดี!' : '▲'}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="text-[11px] text-gray-400 mb-3">บันทึกแล้ว {loggedToday}/3 ค่าหลัก</div>
        <button
          onClick={onLog}
          className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl text-[14px] active:scale-95 transition-transform"
        >
          {todayEntry ? '✏️ แก้ไขข้อมูลวันนี้' : '+ บันทึกค่าวันนี้'}
        </button>
      </div>

      {/* 7-day chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="text-[13px] font-semibold text-gray-500 mb-3">เทรนด์ Score เช้า 7 วัน</div>
        <div className="flex gap-1.5 items-end h-16">
          {last7.map(({ date, entry }) => {
            const score = entry?.morningScore
            const heightPct = score ? ((6 - score) / 4) * 100 : 0
            const dayName = dayNames[new Date(date + 'T00:00:00').getDay()]
            const isToday = date === today()
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex items-end">
                  {score ? (
                    <div
                      className={`w-full rounded-t-md ${scoreColor(score)} transition-all`}
                      style={{ height: `${Math.max(heightPct, 15)}%` }}
                    >
                      <div className="text-white text-[10px] font-bold text-center pt-0.5">{score}</div>
                    </div>
                  ) : (
                    <div className="w-full rounded-t-md bg-gray-100" style={{ height: '15%' }} />
                  )}
                </div>
                <div className={`text-[10px] font-semibold ${isToday ? 'text-orange-500' : 'text-gray-400'}`}>{dayName}</div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 mt-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />1-2 เผาไขมัน</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />3 กลาง</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />4-5 เผาคาร์บ</span>
        </div>
      </div>

      {/* Quick tip */}
      {todayEntry?.morningScore && (
        <div className={`rounded-2xl p-4 border ${todayEntry.morningScore <= 2 ? 'bg-emerald-50 border-emerald-100' : todayEntry.morningScore === 3 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
          <div className="text-[12px] font-bold text-gray-700 mb-1">💡 คำแนะนำวันนี้</div>
          <div className="text-[12px] text-gray-600 leading-relaxed">
            {todayEntry.morningScore <= 2
              ? 'ดีมาก! ร่างกายเผาไขมันข้ามคืน ✅\nมื้อเช้า: ไข่ + โปรตีน + ไขมันดี หลีกเลี่ยงข้าว/ขนมปัง'
              : todayEntry.morningScore === 3
              ? 'กลางๆ ยังไม่ switch ดีพอ ⚠️\nมื้อเช้า: โปรตีนล้วน หลีกเลี่ยง carb\nลองออกกำลังกายเช้าช่วยได้'
              : 'ร่างกายยังเผาคาร์บอยู่ ❌\nตรวจสอบ: กินดึกไหม? นอนพอไหม?\nวันนี้ลด carb ทุกมื้อ เพิ่มโปรตีน+ผัก'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Log Tab ────────────────────────────────────────────────────────────────────
function LogTab({
  allDaily, onSaved
}: {
  allDaily: HealthDaily[]
  onSaved: () => void
}) {
  const [selectedDate, setSelectedDate] = useState(today())

  const dateEntry = useLiveQuery(
    () => db.lumenEntries.where('date').equals(selectedDate).first(),
    [selectedDate]
  )

  const dateWeight = useMemo(
    () => allDaily.find(h => h.date === selectedDate)?.weightKg,
    [allDaily, selectedDate]
  )

  const emptyForm = (): Partial<LumenEntry> => ({
    date: selectedDate,
    morningTime: nowTime(),
    afternoonTime: nowTime(),
    nightTime: nowTime(),
    didWorkout: false,
    workoutType: 'cardio',
  })

  const [form, setForm] = useState<Partial<LumenEntry>>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset form when date changes
  useEffect(() => {
    setForm(emptyForm())
  }, [selectedDate])

  // Populate form when entry loads for selected date
  useEffect(() => {
    if (dateEntry) {
      setForm({
        date: selectedDate,
        morningScore: dateEntry.morningScore,
        morningTime: dateEntry.morningTime ?? nowTime(),
        morningRemark: dateEntry.morningRemark ?? '',
        didWorkout: dateEntry.didWorkout ?? false,
        workoutType: dateEntry.workoutType ?? 'cardio',
        workoutMinutes: dateEntry.workoutMinutes,
        preWorkoutScore: dateEntry.preWorkoutScore,
        preWorkoutRemark: dateEntry.preWorkoutRemark ?? '',
        postWorkoutScore: dateEntry.postWorkoutScore,
        postWorkoutRemark: dateEntry.postWorkoutRemark ?? '',
        afternoonScore: dateEntry.afternoonScore,
        afternoonTime: dateEntry.afternoonTime ?? nowTime(),
        afternoonRemark: dateEntry.afternoonRemark ?? '',
        nightScore: dateEntry.nightScore,
        nightTime: dateEntry.nightTime ?? nowTime(),
        nightRemark: dateEntry.nightRemark ?? '',
      })
    }
  }, [dateEntry?.id, selectedDate])

  const set = (k: keyof LumenEntry, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    const data: LumenEntry = {
      date: selectedDate,
      morningScore: form.morningScore,
      morningTime: form.morningTime || undefined,
      morningRemark: form.morningRemark || undefined,
      didWorkout: form.didWorkout,
      workoutType: form.didWorkout ? form.workoutType : undefined,
      workoutMinutes: form.didWorkout ? form.workoutMinutes : undefined,
      preWorkoutScore: form.didWorkout ? form.preWorkoutScore : undefined,
      preWorkoutRemark: form.didWorkout ? (form.preWorkoutRemark || undefined) : undefined,
      postWorkoutScore: form.didWorkout ? form.postWorkoutScore : undefined,
      postWorkoutRemark: form.didWorkout ? (form.postWorkoutRemark || undefined) : undefined,
      afternoonScore: form.afternoonScore,
      afternoonTime: form.afternoonTime || undefined,
      afternoonRemark: form.afternoonRemark || undefined,
      nightScore: form.nightScore,
      nightTime: form.nightTime || undefined,
      nightRemark: form.nightRemark || undefined,
    }
    if (dateEntry?.id) {
      await db.lumenEntries.update(dateEntry.id, data)
    } else {
      await db.lumenEntries.add(data)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); onSaved() }, 800)
  }

  const workoutTypes = [
    { value: 'cardio', label: 'Cardio' },
    { value: 'weight', label: 'Weight' },
    { value: 'hiit', label: 'HIIT' },
    { value: 'yoga', label: 'Yoga' },
    { value: 'other', label: 'อื่นๆ' },
  ]

  return (
    <div className="p-4 space-y-4 pb-8">

      {/* Date picker */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-gray-700 mb-1">วันที่บันทึก</div>
            <input
              type="date"
              value={selectedDate}
              max={today()}
              onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          {dateEntry && (
            <span className="text-[11px] bg-orange-100 text-orange-600 px-2 py-1 rounded-full font-semibold whitespace-nowrap">✏️ แก้ไข</span>
          )}
        </div>
        {selectedDate !== today() && (
          <button
            type="button"
            onClick={() => setSelectedDate(today())}
            className="mt-2 text-[12px] text-orange-500 font-semibold underline"
          >
            กลับไปวันนี้
          </button>
        )}
      </div>

      {/* Weight (synced) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <div>
              <div className="text-[13px] font-semibold text-gray-700">น้ำหนัก{selectedDate === today() ? 'วันนี้' : fmt(selectedDate)}</div>
              <div className="text-[11px] text-gray-400">sync จาก Health Tab อัตโนมัติ</div>
            </div>
          </div>
          {dateWeight ? (
            <div className="text-lg font-bold text-gray-800">{dateWeight} <span className="text-sm text-gray-400">กก.</span></div>
          ) : (
            <div className="text-[12px] text-amber-500 font-semibold">ยังไม่มีข้อมูล<br/>กรอกใน Health Tab</div>
          )}
        </div>
      </div>

      {/* Morning */}
      <Section icon="🌅" title="ตื่นนอน" subtitle="วัดก่อนกินอะไร — สำคัญที่สุด">
        <ScoreRow
          score={form.morningScore}
          onChange={v => set('morningScore', v || undefined)}
        />
        {form.morningScore && (
          <div className={`text-[12px] font-semibold mt-2 ${form.morningScore <= 2 ? 'text-emerald-600' : form.morningScore === 3 ? 'text-amber-600' : 'text-red-500'}`}>
            {form.morningScore <= 2 ? '🔥 กำลังเผาไขมัน ดีมาก!' : form.morningScore === 3 ? '⚖️ กลางๆ ยังไม่ switch' : '🍚 ยังเผาคาร์บอยู่'}
          </div>
        )}
        <RemarkField
          label="กินอะไรก่อนนอนคืนที่แล้ว?"
          value={form.morningRemark ?? ''}
          onChange={v => set('morningRemark', v)}
        />
        <TimeField value={form.morningTime ?? ''} onChange={v => set('morningTime', v)} />
      </Section>

      {/* Workout */}
      <Section icon="💪" title="ออกกำลังกายวันนี้?">
        <div className="flex gap-3">
          {[
            { v: true, label: 'ใช่' },
            { v: false, label: 'ไม่' },
          ].map(({ v, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => set('didWorkout', v)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-[14px] transition-all border-2
                ${form.didWorkout === v
                  ? v ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-300 text-gray-700 border-gray-300'
                  : 'bg-gray-50 text-gray-400 border-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {form.didWorkout && (
          <div className="mt-3 space-y-3">
            {/* Workout type */}
            <div>
              <div className="text-[12px] text-gray-500 mb-1.5 font-medium">ประเภท</div>
              <div className="flex gap-1.5 flex-wrap">
                {workoutTypes.map(wt => (
                  <button
                    key={wt.value}
                    type="button"
                    onClick={() => set('workoutType', wt.value)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold border-2 transition-all
                      ${form.workoutType === wt.value ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                  >
                    {wt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="text-[12px] text-gray-500 mb-1 font-medium">ระยะเวลา (นาที)</div>
              <input
                type="number"
                value={form.workoutMinutes ?? ''}
                onChange={e => set('workoutMinutes', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="เช่น 45"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[14px]"
              />
            </div>

            {/* Pre workout */}
            <div className="bg-orange-50 rounded-xl p-3">
              <div className="text-[12px] font-semibold text-orange-700 mb-2">ก่อนออกกำลังกาย</div>
              <ScoreRow score={form.preWorkoutScore} onChange={v => set('preWorkoutScore', v || undefined)} />
              <RemarkField
                label="กินอะไรก่อนออก?"
                value={form.preWorkoutRemark ?? ''}
                onChange={v => set('preWorkoutRemark', v)}
              />
            </div>

            {/* Post workout */}
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-[12px] font-semibold text-blue-700 mb-2">หลังออกกำลังกาย</div>
              <ScoreRow score={form.postWorkoutScore} onChange={v => set('postWorkoutScore', v || undefined)} />
              {form.preWorkoutScore && form.postWorkoutScore && (
                <div className={`text-[11px] font-semibold mt-1 ${form.postWorkoutScore < form.preWorkoutScore ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {form.postWorkoutScore < form.preWorkoutScore
                    ? `▼ ลดลง ${form.preWorkoutScore - form.postWorkoutScore} ระดับ — ออกกำลังกายช่วยเผาไขมัน!`
                    : form.postWorkoutScore > form.preWorkoutScore
                    ? `▲ ขึ้น ${form.postWorkoutScore - form.preWorkoutScore} — Carb Window เปิดแล้ว กินโปรตีนได้`
                    : '→ ทรง'}
                </div>
              )}
              <RemarkField
                label="สังเกตร่างกายหลังออก?"
                value={form.postWorkoutRemark ?? ''}
                onChange={v => set('postWorkoutRemark', v)}
              />
            </div>
          </div>
        )}
      </Section>

      {/* Afternoon */}
      <Section icon="🍽️" title="หลังอาหารกลางวัน ~2 ชม." subtitle="วัดหลังกินข้าวเที่ยง 2 ชั่วโมง">
        <ScoreRow score={form.afternoonScore} onChange={v => set('afternoonScore', v || undefined)} />
        {form.morningScore && form.afternoonScore && (
          <div className="text-[11px] text-gray-500 mt-1">
            Delta จากเช้า: {form.afternoonScore > form.morningScore
              ? `▲ +${form.afternoonScore - form.morningScore} (ตอบสนองคาร์บ${form.afternoonScore - form.morningScore >= 2 ? ' ดี ✅' : ''})`
              : form.afternoonScore < form.morningScore
              ? `▼ -${form.morningScore - form.afternoonScore}`
              : '→ ทรง'}
          </div>
        )}
        <RemarkField
          label="กินอะไรมื้อกลางวัน?"
          value={form.afternoonRemark ?? ''}
          onChange={v => set('afternoonRemark', v)}
        />
        <TimeField value={form.afternoonTime ?? ''} onChange={v => set('afternoonTime', v)} />
      </Section>

      {/* Night */}
      <Section icon="🌙" title="ก่อนนอน" subtitle="วัดก่อนนอน 30-60 นาที">
        <ScoreRow score={form.nightScore} onChange={v => set('nightScore', v || undefined)} />
        {form.nightScore && (
          <div className={`text-[12px] mt-1 ${form.nightScore <= 2 ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
            {form.nightScore <= 2
              ? '✅ จะเข้า fat burning mode คืนนี้ — พรุ่งนี้เช้าน่าจะได้ Score ต่ำ'
              : form.nightScore === 3
              ? '⚠️ กลางๆ อาจมีผลต่อ Score เช้าพรุ่งนี้'
              : '❌ ยังย่อยคาร์บอยู่ พรุ่งนี้เช้าอาจ Score สูง'}
          </div>
        )}
        <RemarkField
          label="กินอะไรมื้อเย็น?"
          value={form.nightRemark ?? ''}
          onChange={v => set('nightRemark', v)}
        />
        <TimeField value={form.nightTime ?? ''} onChange={v => set('nightTime', v)} />
      </Section>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className={`w-full py-3.5 rounded-2xl font-bold text-[15px] text-white transition-all active:scale-95
          ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'}`}
      >
        {saved ? '✅ บันทึกแล้ว!' : saving ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูล'}
      </button>
    </div>
  )
}

// ─── History Tab ────────────────────────────────────────────────────────────────
function HistoryTab({ entries, allDaily }: { entries: LumenEntry[]; allDaily: HealthDaily[] }) {
  const [selected, setSelected] = useState<LumenEntry | null>(null)

  if (selected) {
    return <HistoryDetail entry={selected} allDaily={allDaily} onBack={() => setSelected(null)} />
  }

  return (
    <div className="p-4 space-y-2 pb-8">
      {entries.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-semibold">ยังไม่มีประวัติ</div>
          <div className="text-[12px] mt-1">เริ่มบันทึกได้เลยในแท็บ "บันทึก"</div>
        </div>
      )}
      {entries.map(e => {
        const weight = allDaily.find(h => h.date === e.date)?.weightKg
        const last7mornings = entries
          .filter(x => x.date < e.date && x.morningScore)
          .slice(0, 7)
          .map(x => x.morningScore!)
        const flex = calcDailyFlex(e, last7mornings)

        return (
          <button
            key={e.id}
            onClick={() => setSelected(e)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-700 text-[14px]">{fmt(e.date)}</div>
              <div className="flex items-center gap-2">
                {e.didWorkout && <span className="text-[11px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">💪 ออก</span>}
                <div className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${flexLabel(flex).bg} ${flexLabel(flex).color}`}>
                  {flex}
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {[
                { label: '🌅', score: e.morningScore, time: e.morningTime },
                { label: '🍽️', score: e.afternoonScore, time: e.afternoonTime },
                { label: '🌙', score: e.nightScore, time: e.nightTime },
              ].map(({ label, score, time }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[12px]">{label}</span>
                  {score ? (
                    <span className={`w-5 h-5 rounded-full ${scoreColor(score)} text-white text-[10px] font-bold flex items-center justify-center`}>
                      {score}
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-300 text-[10px] flex items-center justify-center">—</span>
                  )}
                  {score && time && <span className="text-[10px] text-gray-400">{time}</span>}
                </div>
              ))}
              {weight && <span className="ml-auto text-[12px] text-gray-400">⚖️ {weight} กก.</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function HistoryDetail({ entry, allDaily, onBack }: { entry: LumenEntry; allDaily: HealthDaily[]; onBack: () => void }) {
  const weight = allDaily.find(h => h.date === entry.date)?.weightKg
  const handleDelete = async () => {
    if (!confirm(`ลบข้อมูลวันที่ ${fmt(entry.date)}?\nไม่สามารถกู้คืนได้`)) return
    await db.lumenEntries.delete(entry.id!)
    onBack()
  }

  const allScores = [
    entry.morningScore, entry.preWorkoutScore,
    entry.postWorkoutScore, entry.afternoonScore, entry.nightScore,
  ].filter(Boolean) as number[]
  const delta = allScores.length >= 2 ? Math.max(...allScores) - Math.min(...allScores) : null

  return (
    <div className="pb-8">
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-4 pt-4 pb-5 text-white">
        <button onClick={onBack} className="flex items-center gap-1 text-orange-100 text-[13px] mb-3">
          ← ย้อนกลับ
        </button>
        <div className="font-bold text-xl">{fmt(entry.date)}</div>
        {weight && <div className="text-orange-100 text-[13px] mt-0.5">⚖️ {weight} กก. (จาก Health Tab)</div>}
        {delta !== null && <div className="text-orange-100 text-[12px]">Delta วันนี้: {delta} ระดับ</div>}
      </div>

      <div className="p-4 space-y-3">
        {/* Morning */}
        {entry.morningScore && (
          <DetailCard icon="🌅" title={`ตื่นนอน${entry.morningTime ? ` · ${entry.morningTime}` : ''}`} score={entry.morningScore} remark={entry.morningRemark}
            insight={entry.morningScore <= 2 ? 'ดีมาก! เผาไขมันข้ามคืนได้' : entry.morningScore === 3 ? 'กลางๆ ยังไม่ switch ดีพอ' : 'ยังเผาคาร์บอยู่ ตรวจสอบมื้อเย็นก่อนหน้า'}
          />
        )}

        {/* Workout */}
        {entry.didWorkout && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💪</span>
              <div>
                <div className="font-semibold text-[14px] text-gray-700">ออกกำลังกาย</div>
                <div className="text-[12px] text-gray-400">
                  {entry.workoutType} {entry.workoutMinutes ? `· ${entry.workoutMinutes} นาที` : ''}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {entry.preWorkoutScore && (
                <div className="bg-orange-50 rounded-xl p-2.5">
                  <div className="text-[11px] text-gray-500">ก่อนออก</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-7 h-7 rounded-full ${scoreColor(entry.preWorkoutScore)} text-white font-bold text-sm flex items-center justify-center`}>
                      {entry.preWorkoutScore}
                    </div>
                    {entry.preWorkoutRemark && <div className="text-[11px] text-gray-500">{entry.preWorkoutRemark}</div>}
                  </div>
                </div>
              )}
              {entry.postWorkoutScore && (
                <div className="bg-blue-50 rounded-xl p-2.5">
                  <div className="text-[11px] text-gray-500">หลังออก</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-7 h-7 rounded-full ${scoreColor(entry.postWorkoutScore)} text-white font-bold text-sm flex items-center justify-center`}>
                      {entry.postWorkoutScore}
                    </div>
                    {entry.postWorkoutRemark && <div className="text-[11px] text-gray-500">{entry.postWorkoutRemark}</div>}
                  </div>
                  {entry.preWorkoutScore && (
                    <div className={`text-[10px] font-semibold mt-1 ${entry.postWorkoutScore < entry.preWorkoutScore ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {entry.postWorkoutScore < entry.preWorkoutScore ? '▼ เผาไขมันระหว่างออก!' : '▲ Carb Window เปิด'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Afternoon */}
        {entry.afternoonScore && (
          <DetailCard icon="🍽️" title={`หลังข้าวเที่ยง${entry.afternoonTime ? ` · ${entry.afternoonTime}` : ''}`} score={entry.afternoonScore} remark={entry.afternoonRemark}
            insight={entry.morningScore && entry.afternoonScore
              ? `Delta จากเช้า: ${entry.afternoonScore > entry.morningScore ? `▲ +${entry.afternoonScore - entry.morningScore}` : `▼ -${entry.morningScore - entry.afternoonScore}`}`
              : undefined}
          />
        )}

        {/* Night */}
        {entry.nightScore && (
          <DetailCard icon="🌙" title={`ก่อนนอน${entry.nightTime ? ` · ${entry.nightTime}` : ''}`} score={entry.nightScore} remark={entry.nightRemark}
            insight={entry.nightScore <= 2 ? 'พรุ่งนี้เช้าน่าจะได้ Score ต่ำ ✅' : 'ยังย่อยคาร์บอยู่ ระวัง Score เช้าพรุ่งนี้'}
          />
        )}

        <button onClick={handleDelete} className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 font-semibold text-[13px]">
          🗑️ ลบข้อมูลวันนี้
        </button>
      </div>
    </div>
  )
}

function DetailCard({ icon, title, score, remark, insight }: {
  icon: string; title: string; score: number; remark?: string; insight?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${scoreColor(score)} text-white font-bold text-lg flex items-center justify-center flex-shrink-0`}>
          {score}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-[13px] text-gray-700">{icon} {title}</div>
          <div className="text-[12px] text-gray-400">{scoreLabel(score)}</div>
        </div>
      </div>
      {remark && (
        <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2 text-[12px] text-gray-600">
          🍽️ {remark}
        </div>
      )}
      {insight && (
        <div className="mt-2 text-[11px] text-gray-500 font-medium">💡 {insight}</div>
      )}
    </div>
  )
}

// ─── Analysis Tab ───────────────────────────────────────────────────────────────
function AnalysisTab({ entries, allDaily }: { entries: LumenEntry[]; allDaily: HealthDaily[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries])

  // Food keyword → avg morning score next day
  const foodPatterns = useMemo(() => {
    const keywords: Record<string, number[]> = {}
    sorted.forEach((e, i) => {
      const nextDay = sorted[i + 1]
      if (!nextDay?.morningScore) return
      const remarks = [e.afternoonRemark, e.nightRemark].filter(Boolean).join(' ')
      remarks.split(/\s+|,|และ|กับ/).forEach(word => {
        if (word.length < 2) return
        if (!keywords[word]) keywords[word] = []
        keywords[word].push(nextDay.morningScore!)
      })
    })
    return Object.entries(keywords)
      .filter(([, arr]) => arr.length >= 2)
      .map(([food, scores]) => ({
        food,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 10)
  }, [sorted])

  // Exercise impact
  const workoutImpact = useMemo(() => {
    const withWorkout: number[] = []
    const noWorkout: number[] = []
    sorted.forEach((e, i) => {
      const nextDay = sorted[i + 1]
      if (!nextDay?.morningScore) return
      if (e.didWorkout) withWorkout.push(nextDay.morningScore)
      else noWorkout.push(nextDay.morningScore)
    })
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    return { withWorkout: avg(withWorkout), noWorkout: avg(noWorkout), wCount: withWorkout.length, nCount: noWorkout.length }
  }, [sorted])

  // Sleep impact (from healthDaily)
  const sleepImpact = useMemo(() => {
    const good: number[] = [] // ≥ 7 hrs
    const poor: number[] = [] // < 6 hrs
    sorted.forEach(e => {
      const daily = allDaily.find(h => h.date === e.date)
      if (!daily?.sleepTotal || !e.morningScore) return
      if (daily.sleepTotal >= 7) good.push(e.morningScore)
      else if (daily.sleepTotal < 6) poor.push(e.morningScore)
    })
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    return { good: avg(good), poor: avg(poor), gCount: good.length, pCount: poor.length }
  }, [sorted, allDaily])

  // Weight correlation
  const weightTrend = useMemo(() => {
    const pairs: { score: number; weightChange: number }[] = []
    sorted.forEach((e, i) => {
      if (!e.morningScore) return
      const todayW = allDaily.find(h => h.date === e.date)?.weightKg
      const prevE = sorted[i - 1]
      const prevW = prevE ? allDaily.find(h => h.date === prevE.date)?.weightKg : null
      if (todayW && prevW) {
        pairs.push({ score: e.morningScore, weightChange: todayW - prevW })
      }
    })
    const byScore: Record<number, number[]> = {}
    pairs.forEach(({ score, weightChange }) => {
      if (!byScore[score]) byScore[score] = []
      byScore[score].push(weightChange)
    })
    return Object.entries(byScore).map(([s, changes]) => ({
      score: Number(s),
      avgChange: changes.reduce((a, b) => a + b, 0) / changes.length,
      count: changes.length,
    })).sort((a, b) => a.score - b.score)
  }, [sorted, allDaily])

  if (entries.length < 3) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-gray-400 px-8 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <div className="font-semibold">ข้อมูลยังน้อยเกินไป</div>
        <div className="text-[12px] mt-1">บันทึกอย่างน้อย 7 วันเพื่อดูการวิเคราะห์ที่แม่นยำ</div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Food patterns */}
      {foodPatterns.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-[13px] font-bold text-gray-700 mb-3">🍽️ อาหารที่ส่งผลต่อ Score เช้า</div>
          <div className="space-y-2">
            {foodPatterns.slice(0, 5).map(({ food, avgScore, count }) => (
              <div key={food} className="flex items-center gap-2">
                <div className="text-[12px] text-gray-600 w-24 truncate">{food}</div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${avgScore <= 2 ? 'bg-emerald-400' : avgScore <= 3 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${(avgScore / 5) * 100}%` }}
                  />
                </div>
                <div className={`text-[12px] font-bold w-8 text-right ${avgScore <= 2 ? 'text-emerald-600' : avgScore <= 3 ? 'text-amber-600' : 'text-red-500'}`}>
                  {avgScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">({count})</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 mt-2">* Score เช้าวันถัดจากที่กินอาหารนั้น</div>
        </div>
      )}

      {/* Exercise impact */}
      {(workoutImpact.wCount > 0 || workoutImpact.nCount > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-[13px] font-bold text-gray-700 mb-3">💪 ผลของการออกกำลังกาย</div>
          <div className="text-[11px] text-gray-400 mb-2">Score เช้าวันถัดไป (ยิ่งต่ำยิ่งดี)</div>
          <div className="grid grid-cols-2 gap-3">
            {workoutImpact.withWorkout !== null && (
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <div className="text-[11px] text-gray-500 mb-1">วันที่ออก</div>
                <div className={`text-2xl font-bold ${workoutImpact.withWorkout <= 2 ? 'text-emerald-600' : workoutImpact.withWorkout <= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                  {workoutImpact.withWorkout.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">{workoutImpact.wCount} วัน</div>
              </div>
            )}
            {workoutImpact.noWorkout !== null && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[11px] text-gray-500 mb-1">วันที่ไม่ออก</div>
                <div className={`text-2xl font-bold ${workoutImpact.noWorkout <= 2 ? 'text-emerald-600' : workoutImpact.noWorkout <= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                  {workoutImpact.noWorkout.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">{workoutImpact.nCount} วัน</div>
              </div>
            )}
          </div>
          {workoutImpact.withWorkout !== null && workoutImpact.noWorkout !== null && (
            <div className={`mt-2 text-[12px] font-semibold ${workoutImpact.withWorkout < workoutImpact.noWorkout ? 'text-emerald-600' : 'text-gray-500'}`}>
              {workoutImpact.withWorkout < workoutImpact.noWorkout
                ? `✅ ออกกำลังกายช่วยลด Score ${(workoutImpact.noWorkout - workoutImpact.withWorkout).toFixed(1)} ระดับ`
                : '→ ผลยังไม่ชัดเจน เพิ่มข้อมูลอีก'}
            </div>
          )}
        </div>
      )}

      {/* Sleep impact */}
      {(sleepImpact.gCount > 0 || sleepImpact.pCount > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-[13px] font-bold text-gray-700 mb-3">😴 ผลของการนอน</div>
          <div className="grid grid-cols-2 gap-3">
            {sleepImpact.good !== null && (
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-[11px] text-gray-500 mb-1">นอน ≥7 ชม.</div>
                <div className={`text-2xl font-bold ${sleepImpact.good <= 2 ? 'text-emerald-600' : sleepImpact.good <= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                  {sleepImpact.good.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">{sleepImpact.gCount} วัน</div>
              </div>
            )}
            {sleepImpact.poor !== null && (
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-[11px] text-gray-500 mb-1">นอน &lt;6 ชม.</div>
                <div className={`text-2xl font-bold ${sleepImpact.poor <= 2 ? 'text-emerald-600' : sleepImpact.poor <= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                  {sleepImpact.poor.toFixed(1)}
                </div>
                <div className="text-[10px] text-gray-400">{sleepImpact.pCount} วัน</div>
              </div>
            )}
          </div>
          {sleepImpact.good !== null && sleepImpact.poor !== null && sleepImpact.good < sleepImpact.poor && (
            <div className="mt-2 text-[12px] font-semibold text-blue-600">
              😴 นอนเพียงพอช่วยลด Score {(sleepImpact.poor - sleepImpact.good).toFixed(1)} ระดับ
            </div>
          )}
        </div>
      )}

      {/* Weight correlation */}
      {weightTrend.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-[13px] font-bold text-gray-700 mb-3">⚖️ Score เช้า vs การเปลี่ยนแปลงน้ำหนัก</div>
          <div className="space-y-2">
            {weightTrend.map(({ score, avgChange, count }) => (
              <div key={score} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full ${scoreColor(score)} text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0`}>
                  {score}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] text-gray-600">
                    เฉลี่ย{' '}
                    <span className={`font-bold ${avgChange <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {avgChange > 0 ? '+' : ''}{avgChange.toFixed(2)} กก.
                    </span>
                    {' '}ต่อวัน
                  </div>
                </div>
                <div className="text-[10px] text-gray-400">({count} วัน)</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 mt-2">* เปรียบเทียบน้ำหนักกับวันก่อนหน้า</div>
        </div>
      )}
    </div>
  )
}

// ─── Reusable Components ─────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }: {
  icon: string; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="font-semibold text-[14px] text-gray-800">{title}</div>
          {subtitle && <div className="text-[11px] text-gray-400">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function ScoreRow({ score, onChange }: { score?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-2 items-center">
      {[1, 2, 3, 4, 5].map(v => (
        <ScoreButton key={v} v={v} selected={score} onChange={onChange} />
      ))}
      {score && (
        <div className={`ml-1 text-[12px] font-semibold ${score <= 2 ? 'text-emerald-600' : score === 3 ? 'text-amber-500' : 'text-red-500'}`}>
          {scoreLabel(score)}
        </div>
      )}
    </div>
  )
}

function RemarkField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2.5">
      <div className="text-[11px] text-gray-400 mb-1">{label}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="เช่น ข้าวกล้อง ไก่ย่าง ผัก..."
        rows={2}
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
      />
    </div>
  )
}

function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[11px] text-gray-400">🕐 เวลา</span>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[13px] focus:outline-none"
      />
    </div>
  )
}
