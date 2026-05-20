import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { HealthRecord, HealthDaily, Medication } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, StatusTag } from '../components/Card'
import Button, { IconButton, CloseButton } from '../components/Button'
import { getAgeDetail, calcBiologicalAge } from '../utils/calculations'
import { loadWhoopTokens } from '../api/whoop'
import { syncWhoopAndSave } from '../api/whoopSync'

// ── Biomarker definitions ──────────────────────────────────────────────────
export interface BiomarkerDef {
  label: string
  unit: string
  normal: string
  optimal: string
  evaluate: (v: number) => 'optimal' | 'good' | 'warning' | 'high'
  longevity?: boolean    // show in longevity panel
  femaleNote?: string
}

export const BIOMARKERS: Record<string, BiomarkerDef> = {
  // Vitals
  systolic:        { label: 'ความดัน (บน)', unit: 'mmHg', normal: '<130', optimal: '<120', evaluate: v => v < 110 ? 'warning' : v < 120 ? 'optimal' : v < 130 ? 'good' : 'high' },
  diastolic:       { label: 'ความดัน (ล่าง)', unit: 'mmHg', normal: '<80', optimal: '<80', evaluate: v => v < 75 ? 'optimal' : v < 80 ? 'good' : 'high' },
  heartRate:       { label: 'อัตราหัวใจ', unit: 'bpm', normal: '60-100', optimal: '50-70', evaluate: v => (v >= 50 && v <= 70) ? 'optimal' : (v >= 71 && v <= 80) ? 'good' : (v < 50 || v > 100) ? 'high' : 'warning' },
  // Blood sugar
  glucose:         { label: 'น้ำตาลตับแล้ง', unit: 'mg/dL', normal: '<100', optimal: '<90', evaluate: v => v < 90 ? 'optimal' : v < 100 ? 'good' : v < 125 ? 'warning' : 'high', longevity: true },
  hba1c:           { label: 'HbA1c', unit: '%', normal: '<5.7', optimal: '<5.4', evaluate: v => v < 5.4 ? 'optimal' : v < 5.7 ? 'good' : v < 6.5 ? 'warning' : 'high', longevity: true },
  fastingInsulin:  { label: 'Fasting Insulin', unit: 'μU/mL', normal: '<10', optimal: '<5', evaluate: v => v < 5 ? 'optimal' : v < 10 ? 'good' : v < 15 ? 'warning' : 'high', longevity: true },
  // Lipids
  ldl:             { label: 'LDL', unit: 'mg/dL', normal: '<130', optimal: '<70', evaluate: v => v < 70 ? 'optimal' : v < 100 ? 'good' : v < 130 ? 'warning' : 'high', longevity: true },
  hdl:             { label: 'HDL', unit: 'mg/dL', normal: '>50', optimal: '>65', evaluate: v => v >= 65 ? 'optimal' : v >= 50 ? 'good' : v >= 40 ? 'warning' : 'high', longevity: true, femaleNote: 'ผู้หญิง >55 คือดี' },
  triglycerides:   { label: 'ไตรกลีเซอไรด์', unit: 'mg/dL', normal: '<150', optimal: '<100', evaluate: v => v < 100 ? 'optimal' : v < 150 ? 'good' : v < 200 ? 'warning' : 'high', longevity: true },
  totalCholesterol:{ label: 'คอเลสเตอรอลรวม', unit: 'mg/dL', normal: '<200', optimal: '<180', evaluate: v => v < 180 ? 'optimal' : v < 200 ? 'good' : v < 240 ? 'warning' : 'high' },
  apoB:            { label: 'ApoB', unit: 'mg/dL', normal: '<100', optimal: '<80', evaluate: v => v < 80 ? 'optimal' : v < 100 ? 'good' : v < 130 ? 'warning' : 'high', longevity: true },
  lpA:             { label: 'Lp(a)', unit: 'mg/dL', normal: '<30', optimal: '<15', evaluate: v => v < 15 ? 'optimal' : v < 30 ? 'good' : v < 50 ? 'warning' : 'high', longevity: true },
  // Inflammation
  hsCrp:           { label: 'hs-CRP', unit: 'mg/L', normal: '<3', optimal: '<1', evaluate: v => v < 1 ? 'optimal' : v < 3 ? 'good' : v < 10 ? 'warning' : 'high', longevity: true },
  homocysteine:    { label: 'Homocysteine', unit: 'µmol/L', normal: '<11', optimal: '<9', evaluate: v => v < 9 ? 'optimal' : v < 11 ? 'good' : v < 15 ? 'warning' : 'high', longevity: true },
  omega3Index:     { label: 'Omega-3 Index', unit: '%', normal: '>4', optimal: '>8', evaluate: v => v >= 8 ? 'optimal' : v >= 5 ? 'good' : v >= 4 ? 'warning' : 'high', longevity: true },
  // Liver
  alt:             { label: 'ALT', unit: 'U/L', normal: '<40', optimal: '<20', evaluate: v => v < 20 ? 'optimal' : v < 40 ? 'good' : 'high', longevity: true },
  ast:             { label: 'AST', unit: 'U/L', normal: '<40', optimal: '<20', evaluate: v => v < 20 ? 'optimal' : v < 40 ? 'good' : 'high' },
  ggt:             { label: 'GGT', unit: 'U/L', normal: '<45', optimal: '<20', evaluate: v => v < 20 ? 'optimal' : v < 45 ? 'good' : 'high', longevity: true },
  // Kidney
  creatinine:      { label: 'ครีเอตินิน', unit: 'mg/dL', normal: '0.5-1.1', optimal: '0.6-1.0', evaluate: v => (v >= 0.6 && v <= 1.0) ? 'optimal' : (v >= 0.5 && v <= 1.1) ? 'good' : 'warning', femaleNote: 'ผู้หญิง 0.5-1.1' },
  egfr:            { label: 'eGFR', unit: 'mL/min', normal: '>60', optimal: '>90', evaluate: v => v >= 90 ? 'optimal' : v >= 60 ? 'good' : v >= 30 ? 'warning' : 'high', longevity: true },
  uricAcid:        { label: 'กรดยูริก', unit: 'mg/dL', normal: '<6.5', optimal: '<5.5', evaluate: v => v < 5.5 ? 'optimal' : v < 6.5 ? 'good' : 'high', femaleNote: 'ผู้หญิง <6.0' },
  // Heart
  cacScore:        { label: 'CAC Score', unit: '', normal: '0', optimal: '0', evaluate: v => v === 0 ? 'optimal' : v < 100 ? 'warning' : 'high', longevity: true },
  // Thyroid & Hormones
  tsh:             { label: 'TSH', unit: 'µIU/mL', normal: '0.5-4.5', optimal: '1.0-2.5', evaluate: v => (v >= 1.0 && v <= 2.5) ? 'optimal' : (v >= 0.5 && v <= 4.5) ? 'good' : 'warning', longevity: true },
  dheaS:           { label: 'DHEA-S', unit: 'µg/dL', normal: '60-380', optimal: '150-300', evaluate: v => (v >= 150 && v <= 300) ? 'optimal' : (v >= 60 && v <= 380) ? 'good' : 'warning', longevity: true, femaleNote: 'ผู้หญิง 37 ปี: 150-300' },
  igf1:            { label: 'IGF-1', unit: 'ng/mL', normal: '75-200', optimal: '100-200', evaluate: v => (v >= 100 && v <= 200) ? 'optimal' : (v >= 75 && v <= 200) ? 'good' : 'warning', longevity: true },
  cortisol:        { label: 'Cortisol (AM)', unit: 'µg/dL', normal: '6-23', optimal: '10-20', evaluate: v => (v >= 10 && v <= 20) ? 'optimal' : (v >= 6 && v <= 23) ? 'good' : 'warning' },
  // Vitamins
  vitaminD:        { label: 'Vitamin D', unit: 'ng/mL', normal: '>30', optimal: '50-80', evaluate: v => (v >= 50 && v <= 80) ? 'optimal' : v >= 30 ? 'good' : v >= 20 ? 'warning' : 'high', longevity: true },
  vitaminB12:      { label: 'Vitamin B12', unit: 'pg/mL', normal: '200-900', optimal: '500-900', evaluate: v => v >= 500 ? 'optimal' : (v >= 200 && v <= 900) ? 'good' : 'warning', longevity: true },
  vitaminB6:       { label: 'Vitamin B6', unit: 'ng/mL', normal: '>5', optimal: '20-100', evaluate: v => (v >= 20 && v <= 100) ? 'optimal' : v >= 5 ? 'good' : 'warning' },
  magnesium:       { label: 'Magnesium', unit: 'mg/dL', normal: '1.7-2.2', optimal: '2.0-2.2', evaluate: v => (v >= 2.0 && v <= 2.2) ? 'optimal' : (v >= 1.7 && v <= 2.2) ? 'good' : 'warning', longevity: true },
  ferritin:        { label: 'Ferritin', unit: 'ng/mL', normal: '12-150', optimal: '40-100', evaluate: v => (v >= 40 && v <= 100) ? 'optimal' : (v >= 12 && v <= 150) ? 'good' : 'warning', longevity: true, femaleNote: 'ผู้หญิง 40-100' },
  // CBC
  hemoglobin:      { label: 'Hemoglobin', unit: 'g/dL', normal: '12-16', optimal: '13-15', evaluate: v => (v >= 13 && v <= 15) ? 'optimal' : (v >= 12 && v <= 16) ? 'good' : 'warning', femaleNote: 'ผู้หญิง 12-16' },
  // Physical performance
  gripStrength:    { label: 'Grip Strength', unit: 'kg', normal: '>25', optimal: '>27', evaluate: v => v >= 27 ? 'optimal' : v >= 25 ? 'good' : v >= 20 ? 'warning' : 'high', longevity: true, femaleNote: 'ผู้หญิง >27 kg' },
  boneDensity:     { label: 'Bone Density (T-score)', unit: '', normal: '>-1', optimal: '>0', evaluate: v => v >= 0 ? 'optimal' : v >= -1 ? 'good' : v >= -2.5 ? 'warning' : 'high', longevity: true },
  mocaScore:       { label: 'MoCA Score', unit: '/30', normal: '>25', optimal: '>26', evaluate: v => v >= 27 ? 'optimal' : v >= 25 ? 'good' : 'warning', longevity: true },
  // Female hormones
  estradiol:       { label: 'Estradiol (E2)', unit: 'pg/mL', normal: 'แล้วแต่รอบ', optimal: 'แล้วแต่รอบ', evaluate: v => v > 0 ? 'good' : 'warning', femaleNote: 'Follicular 30-400, Luteal 70-250' },
}

// Age-based recommended checkups with longevity focus
const AGE_CHECKUPS: Record<string, string[]> = {
  '30+': ['ตรวจ CBC, Lipids, HbA1c', 'วัดความดัน', 'Pap smear ทุก 3 ปี', 'ตรวจ TSH', 'Vitamin D', 'HPV Vaccine ถ้ายังไม่ได้ทำ'],
  '35+': ['ตรวจ ApoB, Lp(a)', 'ตรวจ hs-CRP', 'Fasting Insulin + HOMA-IR', 'เพิ่ม Magnesium, B12', 'เริ่ม Baseline Carotid Ultrasound'],
  '40+': ['Mammogram ปีละ 1 ครั้ง', 'ตรวจ Cardiac CT (CAC score)', 'ตรวจ Echo หัวใจ', 'ตรวจ eGFR + Creatinine', 'ฮอร์โมน: Estradiol, FSH, LH, Testosterone'],
  '45+': ['ติดตาม Perimenopause markers', 'ตรวจ DEXA scan (มวลกระดูก)', 'ตรวจ Colonoscopy', 'Skin check มะเร็งผิวหนัง'],
  '50+': ['ตรวจ Colonoscopy ทุก 10 ปี', 'Mammogram ปีละ 1 ครั้ง', 'ฮอร์โมน Menopause panel', 'ตรวจ Bone density ซ้ำ'],
}

export function getCheckups(age: number): string[] {
  const result: string[] = []
  if (age >= 30) result.push(...(AGE_CHECKUPS['30+'] ?? []))
  if (age >= 35) result.push(...(AGE_CHECKUPS['35+'] ?? []))
  if (age >= 40) result.push(...(AGE_CHECKUPS['40+'] ?? []))
  if (age >= 45) result.push(...(AGE_CHECKUPS['45+'] ?? []))
  if (age >= 50) result.push(...(AGE_CHECKUPS['50+'] ?? []))
  return result
}

const STATUS_COLOR = {
  optimal: { text: 'text-green-600', bg: 'bg-green-50', label: 'Optimal ✨', badge: 'bg-green-100 text-green-700' },
  good:    { text: 'text-blue-600',  bg: 'bg-blue-50',  label: 'ปกติ ✓',    badge: 'bg-blue-100 text-blue-700' },
  warning: { text: 'text-amber-600', bg: 'bg-amber-50', label: 'เฝ้าระวัง ⚠️', badge: 'bg-amber-100 text-amber-700' },
  high:    { text: 'text-red-600',   bg: 'bg-red-50',   label: 'ผิดปกติ ❗', badge: 'bg-red-100 text-red-700' },
}

type MainTab = 'summary' | 'myplan' | 'longevity' | 'records' | 'daily' | 'meds'

const LONGEVITY_KEYS = Object.entries(BIOMARKERS)
  .filter(([, def]) => def.longevity)
  .map(([key]) => key)

export default function Health() {
  const [tab, setTab] = useState<MainTab>('summary')
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showDailyForm, setShowDailyForm] = useState(false)
  const [showMedForm, setShowMedForm] = useState(false)
  const [editRecord, setEditRecord] = useState<HealthRecord | null>(null)
  const [editDaily, setEditDaily] = useState<HealthDaily | null>(null)
  const [editMed, setEditMed] = useState<Medication | null>(null)
  const [whoopSyncing, setWhoopSyncing] = useState(false)
  const [whoopMsg, setWhoopMsg] = useState<string | null>(null)

  async function doWhoopSync() {
    if (!loadWhoopTokens()) return
    setWhoopSyncing(true)
    try {
      const result = await syncWhoopAndSave(90)
      setWhoopMsg(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`)
      setTimeout(() => setWhoopMsg(null), 4000)
    } finally {
      setWhoopSyncing(false)
    }
  }

  useEffect(() => {
    // Auto-sync WHOOP on first open per session
    if (!loadWhoopTokens()) return
    if (sessionStorage.getItem('whoop_health_synced')) return
    sessionStorage.setItem('whoop_health_synced', '1')
    doWhoopSync()
  }, [])

  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const latestRecord = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const latestWhoopDaily = useLiveQuery(() =>
    db.healthDaily.orderBy('date').reverse().filter(d => d.source === 'whoop').first()
  )
  const allRecords = useLiveQuery(() => db.healthRecords.orderBy('date').reverse().toArray())
  const allDaily = useLiveQuery(() => db.healthDaily.orderBy('date').reverse().toArray())

  const age = profile ? getAgeDetail(profile.dob).years : 35
  const checkups = getCheckups(age)

  const bioAge = latestRecord && latestDaily ? calcBiologicalAge(age, {
    systolic: latestRecord.systolic,
    glucose: latestRecord.glucose,
    ldl: latestRecord.ldl,
    hdl: latestRecord.hdl,
    vo2max: latestDaily.vo2max,
    sleepHours: latestDaily.sleepTotal,
    steps: latestDaily.steps,
    bmi: profile && latestDaily.weightKg ? latestDaily.weightKg / Math.pow(profile.heightCm / 100, 2) : undefined,
  }) : null

  function openAddRecord() { setEditRecord(null); setShowRecordForm(true) }
  function openAddDaily() { setEditDaily(null); setShowDailyForm(true) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title="สุขภาพ"
        gradient="from-rose-500 to-pink-600"
        rightAction={{
          label: '＋ เพิ่ม',
          onClick: () => tab === 'daily' ? openAddDaily() : tab === 'meds' ? (() => { setEditMed(null); setShowMedForm(true) })() : openAddRecord(),
        }}
      />

      <div className="relative bg-white border-b border-gray-100">
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {([['summary', 'ภาพรวม'], ['myplan', '🎯 แผนของฉัน'], ['longevity', 'Longevity'], ['records', 'ผลตรวจ'], ['daily', 'กิจกรรม'], ['meds', '💊 ยา/วิตามิน']] as [MainTab, string][]).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'summary' && (
          <SummaryTab age={age} bioAge={bioAge} latestRecord={latestRecord} latestDaily={latestDaily} latestWhoopDaily={latestWhoopDaily} checkups={checkups} profile={profile} allDaily={allDaily} allRecords={allRecords} onSyncWhoop={doWhoopSync} whoopSyncing={whoopSyncing} whoopMsg={whoopMsg} whoopConnected={!!loadWhoopTokens()} />
        )}
        {tab === 'myplan' && <MyPlanTab age={age} latestRecord={latestRecord} />}
        {tab === 'longevity' && (
          <LongevityTab latestRecord={latestRecord} age={age} />
        )}
        {tab === 'records' && (
          <RecordsTab records={allRecords ?? []}
            onEdit={(r) => { setEditRecord(r); setShowRecordForm(true) }} />
        )}
        {tab === 'daily' && (
          <DailyTab daily={allDaily ?? []}
            onEdit={(d) => { setEditDaily(d); setShowDailyForm(true) }} />
        )}
        {tab === 'meds' && (
          <MedsTab onEdit={(m) => { setEditMed(m); setShowMedForm(true) }} />
        )}
      </div>

      {showRecordForm && (
        <HealthRecordForm editItem={editRecord} onClose={() => { setShowRecordForm(false); setEditRecord(null) }} />
      )}
      {showDailyForm && (
        <HealthDailyForm editItem={editDaily} onClose={() => { setShowDailyForm(false); setEditDaily(null) }} />
      )}
      {showMedForm && (
        <MedicationForm editItem={editMed} onClose={() => { setShowMedForm(false); setEditMed(null) }} />
      )}
    </div>
  )
}

// ── Weight Tracker ─────────────────────────────────────────────────────────
function WeightTracker({ allDaily, profile }: { allDaily: HealthDaily[]; profile: any }) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const [quickInput, setQuickInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const withWeight = allDaily.filter(d => d.weightKg).sort((a, b) => a.date.localeCompare(b.date))
  const today = new Date()
  const cutoff = new Date(today.getTime() - period * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const period7 = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const period30 = new Date(today.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const inPeriod = withWeight.filter(d => d.date >= cutoff)
  const latest = withWeight[withWeight.length - 1]

  // Stats
  const weights = inPeriod.map(d => d.weightKg!)
  const minW = weights.length ? Math.min(...weights) : null
  const maxW = weights.length ? Math.max(...weights) : null
  const avgW = weights.length ? weights.reduce((s, w) => s + w, 0) / weights.length : null
  const w7d = withWeight.findLast(d => d.date <= period7)?.weightKg
  const w30d = withWeight.findLast(d => d.date <= period30)?.weightKg
  const change7 = latest?.weightKg && w7d ? latest.weightKg - w7d : null
  const change30 = latest?.weightKg && w30d ? latest.weightKg - w30d : null

  async function saveQuick() {
    const w = parseFloat(quickInput)
    if (!w || w < 20 || w > 300) {
      setToast('กรุณาใส่น้ำหนักที่ถูกต้อง (20–300 กก.)')
      setTimeout(() => setToast(null), 2000)
      return
    }
    setSaving(true)
    try {
      const todayDate = today.toISOString().slice(0, 10)
      const existing = await db.healthDaily.where('date').equals(todayDate).first()
      if (existing) {
        await db.healthDaily.update(existing.id!, { weightKg: w })
      } else {
        await db.healthDaily.add({ date: todayDate, weightKg: w })
      }
      setQuickInput('')
      setToast('บันทึกแล้ว')
      setTimeout(() => setToast(null), 1500)
    } catch (e: any) {
      setToast(e?.message ?? 'บันทึกไม่สำเร็จ')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setSaving(false)
    }
  }

  // Build chart path
  const chartW = 320, chartH = 110, padL = 30, padR = 10, padT = 8, padB = 18
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB
  let chartPoints: { x: number; y: number; d: HealthDaily }[] = []
  let yMin = 0, yMax = 0
  if (inPeriod.length > 0) {
    const ys = inPeriod.map(d => d.weightKg!)
    yMin = Math.min(...ys) - 1
    yMax = Math.max(...ys) + 1
    if (yMax - yMin < 2) { yMax = yMin + 2 }
    const xStart = new Date(cutoff).getTime()
    const xEnd = today.getTime()
    chartPoints = inPeriod.map(d => {
      const t = new Date(d.date).getTime()
      const x = padL + ((t - xStart) / (xEnd - xStart)) * innerW
      const y = padT + (1 - (d.weightKg! - yMin) / (yMax - yMin)) * innerH
      return { x, y, d }
    })
  }
  const pathD = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg z-50">{toast}</div>
      )}
      {/* Header + quick entry */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-50 flex items-center justify-between gap-2">
        <div className="text-[14px] font-bold text-gray-900">📊 น้ำหนัก</div>
        <div className="flex gap-1.5 items-center">
          <input
            type="number"
            step="0.1"
            placeholder={latest?.weightKg ? `${latest.weightKg}` : 'กก.'}
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-[13px] w-16 text-right"
          />
          <button
            onClick={saveQuick}
            disabled={saving || !quickInput}
            className="bg-indigo-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50"
          >
            {saving ? '⏳' : 'บันทึก'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 px-3 py-2 border-b border-gray-50 text-center">
        <div>
          <div className="text-[10px] text-gray-400">ล่าสุด</div>
          <div className="text-[13px] font-bold text-gray-900">{latest?.weightKg ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">เฉลี่ย {period}d</div>
          <div className="text-[13px] font-bold text-gray-900">{avgW ? avgW.toFixed(1) : '—'}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">7วัน</div>
          <div className={`text-[13px] font-bold ${change7 == null ? 'text-gray-400' : change7 < 0 ? 'text-green-600' : change7 > 0 ? 'text-red-500' : 'text-gray-700'}`}>
            {change7 == null ? '—' : `${change7 > 0 ? '+' : ''}${change7.toFixed(1)}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">30วัน</div>
          <div className={`text-[13px] font-bold ${change30 == null ? 'text-gray-400' : change30 < 0 ? 'text-green-600' : change30 > 0 ? 'text-red-500' : 'text-gray-700'}`}>
            {change30 == null ? '—' : `${change30 > 0 ? '+' : ''}${change30.toFixed(1)}`}
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex border-b border-gray-50">
        {([7, 30, 90] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 text-[12px] font-semibold ${period === p ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
          >{p} วัน</button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-2 py-2">
        {chartPoints.length === 0 ? (
          <div className="text-center py-6 text-[12px] text-gray-400">ยังไม่มีข้อมูลในช่วงนี้</div>
        ) : (
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto">
            {/* y-axis labels */}
            <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{yMax.toFixed(1)}</text>
            <text x={padL - 4} y={padT + innerH + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{yMin.toFixed(1)}</text>
            {profile?.heightCm && (() => {
              // healthy BMI band 18.5-25 → weight band
              const h = profile.heightCm / 100
              const wMin = 18.5 * h * h
              const wMax = 25 * h * h
              const yWMin = padT + (1 - (wMin - yMin) / (yMax - yMin)) * innerH
              const yWMax = padT + (1 - (wMax - yMin) / (yMax - yMin)) * innerH
              const top = Math.min(yWMin, yWMax)
              const bot = Math.max(yWMin, yWMax)
              const clipTop = Math.max(top, padT)
              const clipBot = Math.min(bot, padT + innerH)
              if (clipBot <= clipTop) return null
              return <rect x={padL} y={clipTop} width={innerW} height={clipBot - clipTop} fill="#86efac" opacity="0.15" />
            })()}
            {/* grid lines */}
            <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#e5e7eb" strokeWidth="0.5" />
            {/* line */}
            <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* points */}
            {chartPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="2" fill="#6366f1" />
            ))}
            {/* x-axis labels */}
            <text x={padL} y={chartH - 4} textAnchor="start" fontSize="9" fill="#9ca3af">{cutoff.slice(5)}</text>
            <text x={padL + innerW} y={chartH - 4} textAnchor="end" fontSize="9" fill="#9ca3af">{today.toISOString().slice(5, 10)}</text>
          </svg>
        )}
        {minW != null && maxW != null && (
          <div className="flex justify-around text-[10px] text-gray-400 pb-1">
            <span>ต่ำสุด <b className="text-green-600">{minW.toFixed(1)}</b></span>
            <span>สูงสุด <b className="text-red-500">{maxW.toFixed(1)}</b></span>
          </div>
        )}
      </div>
    </div>
  )
}

function Sparkline({ points, color = '#6366f1', height = 48 }: { points: number[]; color?: string; height?: number }) {
  if (points.length < 2) return null
  const w = 200, h = height, pad = 4
  const min = Math.min(...points), max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={color} />
    </svg>
  )
}

const CHECKUP_STORAGE_KEY = 'health_checkup_done_v1'
function loadDoneCheckups(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHECKUP_STORAGE_KEY) ?? '[]')) }
  catch { return new Set() }
}
function saveDoneCheckups(s: Set<string>) {
  localStorage.setItem(CHECKUP_STORAGE_KEY, JSON.stringify([...s]))
}

function SummaryTab({ age, bioAge, latestRecord, latestDaily, latestWhoopDaily, checkups, profile, allDaily, allRecords, onSyncWhoop, whoopSyncing, whoopMsg, whoopConnected }: any) {
  const [doneCheckups, setDoneCheckups] = useState<Set<string>>(loadDoneCheckups)
  const whoop = latestWhoopDaily ?? latestDaily
  const bmi = profile && latestDaily?.weightKg ? latestDaily.weightKg / Math.pow(profile.heightCm / 100, 2) : null

  const basicKeys = ['systolic', 'diastolic', 'heartRate', 'glucose', 'hba1c', 'ldl', 'hdl', 'triglycerides']

  return (
    <>
      {/* Bio Age */}
      {bioAge !== null && (
        <div className="mx-4 mt-3">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>อายุทางชีวภาพ</CardTitle>
                <div className="text-[10px] text-gray-400 mb-1">คำนวณจากค่าสุขภาพในแอพ (ไม่ใช่จาก WHOOP)</div>
                <div className="text-3xl font-bold text-gray-900">{bioAge} <span className="text-base font-normal text-gray-500">ปี</span></div>
                <div className={`text-sm font-semibold mt-1 ${bioAge < age ? 'text-green-600' : bioAge > age ? 'text-red-500' : 'text-gray-500'}`}>
                  {bioAge < age ? `ดีกว่าอายุจริง ${(age - bioAge).toFixed(1)} ปี 🎉` :
                    bioAge > age ? `สูงกว่าอายุจริง ${(bioAge - age).toFixed(1)} ปี ⚠️` : 'เท่ากับอายุจริง'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">อายุจริง</div>
                <div className="text-2xl font-bold text-indigo-600">{age}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* WHOOP Summary */}
      {whoopConnected && (
        <div className="mx-4 mt-3">
          <Card className="!bg-gray-950 !text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13px] font-bold text-white">WHOOP</div>
                {whoop?.date && <div className="text-[11px] text-gray-400">ล่าสุด: {whoop.date}</div>}
              </div>
              <button
                onClick={onSyncWhoop}
                disabled={whoopSyncing}
                className="text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {whoopSyncing ? '⏳ Sync...' : '🔄 Sync'}
              </button>
            </div>
            {whoopMsg && (
              <div className={`text-[11px] mb-2 ${whoopMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{whoopMsg}</div>
            )}
            {!whoop?.recoveryScore && !whoop?.hrv && !whoop?.strain && (
              <div className="text-[11px] text-gray-400 py-3 text-center">ยังไม่มีข้อมูล WHOOP — กด Sync เพื่อดึงข้อมูลล่าสุด</div>
            )}
            {whoop && (
            <div className="grid grid-cols-3 gap-2">
              {whoop.recoveryScore !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className={`text-[18px] font-bold ${whoop.recoveryScore >= 67 ? 'text-green-400' : whoop.recoveryScore >= 34 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {whoop.recoveryScore}%
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Recovery</div>
                </div>
              )}
              {whoop.hrv !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className="text-[18px] font-bold text-blue-400">{whoop.hrv}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">HRV (ms)</div>
                </div>
              )}
              {whoop.strain !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className="text-[18px] font-bold text-orange-400">{whoop.strain}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Strain</div>
                </div>
              )}
              {whoop.restingHeartRate !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className="text-[18px] font-bold text-pink-400">{whoop.restingHeartRate}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">RHR (bpm)</div>
                </div>
              )}
              {whoop.sleepPerformance !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className="text-[18px] font-bold text-indigo-400">{whoop.sleepPerformance}%</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Sleep</div>
                </div>
              )}
              {whoop.bloodOxygen !== undefined && (
                <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                  <div className="text-[18px] font-bold text-cyan-400">{Number(whoop.bloodOxygen).toFixed(2)}%</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">SpO₂</div>
                </div>
              )}
            </div>
            )}
          </Card>
        </div>
      )}

      {/* Body composition */}
      {latestDaily?.weightKg && (
        <div className="mx-4 mt-3">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>น้ำหนัก / BMI</CardTitle>
                <div className="text-2xl font-bold text-gray-900">{latestDaily.weightKg} <span className="text-sm text-gray-500">กก.</span></div>
                {bmi && <div className="text-sm text-gray-500 mt-0.5">BMI {bmi.toFixed(1)}</div>}
              </div>
              <StatusTag
                status={bmi ? (bmi < 18.5 ? 'warning' : bmi < 25 ? 'good' : bmi < 30 ? 'warning' : 'high') : 'good'}
                label={bmi ? (bmi < 18.5 ? 'น้ำหนักน้อย' : bmi < 25 ? 'ปกติ' : bmi < 30 ? 'น้ำหนักเกิน' : 'อ้วน') : 'ปกติ'}
              />
            </div>
            {latestRecord?.bodyFatPct !== undefined && (
              <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
                <div className="text-[13px]">ไขมัน: <b>{latestRecord.bodyFatPct}%</b></div>
                {latestRecord.muscleMassKg && <div className="text-[13px]">กล้ามเนื้อ: <b>{latestRecord.muscleMassKg} กก.</b></div>}
                {latestRecord.waistCm && <div className="text-[13px]">รอบเอว: <b>{latestRecord.waistCm} ซม.</b></div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Deep Sleep Focus */}
      {(() => {
        const recent = (allDaily ?? []).filter((d: any) => d.sleepTotal && d.sleepDeep).slice(0, 30)
        if (recent.length === 0) return null
        const avgDeep = recent.reduce((s: number, d: any) => s + d.sleepDeep, 0) / recent.length
        const avgTotal = recent.reduce((s: number, d: any) => s + d.sleepTotal, 0) / recent.length
        const deepPct = avgTotal > 0 ? Math.round((avgDeep / avgTotal) * 100) : 0
        const latest = recent[0]
        const latestPct = latest.sleepTotal > 0 ? Math.round((latest.sleepDeep / latest.sleepTotal) * 100) : 0
        const isOptimal = avgDeep >= 1.5 && deepPct >= 20
        const isGood = avgDeep >= 1.2 && deepPct >= 15
        const statusColor = isOptimal ? 'text-green-600' : isGood ? 'text-amber-500' : 'text-red-500'
        const statusBg = isOptimal ? 'bg-green-50' : isGood ? 'bg-amber-50' : 'bg-red-50'
        const statusLabel = isOptimal ? '✅ Optimal Longevity' : isGood ? '⚠️ พอใช้' : '❌ ต่ำกว่าเกณฑ์'
        return (
          <div className="mx-4 mt-3">
            <Card>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>🌊 Deep Sleep</CardTitle>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusBg} ${statusColor}`}>{statusLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-[20px] font-bold text-gray-900">{avgDeep.toFixed(1)}</div>
                  <div className="text-[10px] text-gray-400">ชม. เฉลี่ย/คืน</div>
                </div>
                <div className="text-center">
                  <div className={`text-[20px] font-bold ${statusColor}`}>{deepPct}%</div>
                  <div className="text-[10px] text-gray-400">% ของ sleep รวม</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-bold text-indigo-600">{latestPct}%</div>
                  <div className="text-[10px] text-gray-400">คืนล่าสุด</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{latest.date.slice(5)}</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5 text-[11px] text-gray-500">
                <div className="font-semibold text-gray-700 mb-1">เกณฑ์ Longevity</div>
                <div className="flex justify-between"><span>Optimal</span><span className="text-green-600 font-semibold">≥1.5 ชม. และ ≥20%</span></div>
                <div className="flex justify-between mt-0.5"><span>Good</span><span className="text-amber-500 font-semibold">≥1.2 ชม. และ ≥15%</span></div>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* REM Sleep Focus */}
      {(() => {
        const recent = (allDaily ?? []).filter((d: any) => (d.sleepRem ?? 0) > 0).slice(0, 30)
        if (recent.length === 0) return null
        const avgRem = recent.reduce((s: number, d: any) => s + d.sleepRem, 0) / recent.length
        const withTotal = recent.filter((d: any) => d.sleepTotal)
        const avgTotal = withTotal.length ? withTotal.reduce((s: number, d: any) => s + d.sleepTotal, 0) / withTotal.length : 0
        const remPct = avgTotal > 0 ? Math.round((avgRem / avgTotal) * 100) : 0
        const latest = recent[0]
        const latestPct = latest.sleepTotal > 0 ? Math.round((latest.sleepRem / latest.sleepTotal) * 100) : 0
        const isOptimal = avgRem >= 1.5 && remPct >= 20
        const isGood = avgRem >= 1.2 && remPct >= 15
        const statusColor = isOptimal ? 'text-green-600' : isGood ? 'text-amber-500' : 'text-red-500'
        const statusBg = isOptimal ? 'bg-green-50' : isGood ? 'bg-amber-50' : 'bg-red-50'
        const statusLabel = isOptimal ? '✅ Optimal Longevity' : isGood ? '⚠️ พอใช้' : '❌ ต่ำกว่าเกณฑ์'
        return (
          <div className="mx-4 mt-3">
            <Card>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>💫 REM Sleep</CardTitle>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusBg} ${statusColor}`}>{statusLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-[20px] font-bold text-gray-900">{avgRem.toFixed(1)}</div>
                  <div className="text-[10px] text-gray-400">ชม. เฉลี่ย/คืน</div>
                </div>
                <div className="text-center">
                  <div className={`text-[20px] font-bold ${statusColor}`}>{remPct}%</div>
                  <div className="text-[10px] text-gray-400">% ของ sleep รวม</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-bold text-purple-600">{latestPct}%</div>
                  <div className="text-[10px] text-gray-400">คืนล่าสุด</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{latest.date.slice(5)}</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5 text-[11px] text-gray-500">
                <div className="font-semibold text-gray-700 mb-1">เกณฑ์ Longevity</div>
                <div className="flex justify-between"><span>Optimal</span><span className="text-green-600 font-semibold">≥1.5 ชม. และ ≥20%</span></div>
                <div className="flex justify-between mt-0.5"><span>Good</span><span className="text-amber-500 font-semibold">≥1.2 ชม. และ ≥15%</span></div>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* Calories & Distance Focus */}
      {(() => {
        const recent = (allDaily ?? []).slice(0, 30)
        const withCal = recent.filter((d: any) => d.caloriesBurned)
        const withDist = recent.filter((d: any) => d.distanceKm)
        const avgCal = withCal.length ? Math.round(withCal.reduce((s: number, d: any) => s + d.caloriesBurned, 0) / withCal.length) : null
        const avgDist = withDist.length ? Math.round(withDist.reduce((s: number, d: any) => s + d.distanceKm, 0) / withDist.length * 10) / 10 : null
        const latestCalRec = withCal[0] ?? null
        const latestDistRec = withDist[0] ?? null
        if (avgCal === null && avgDist === null) return null
        return (
          <div className="mx-4 mt-3">
            <div className="grid grid-cols-2 gap-3">
              {avgCal !== null && (
                <Card>
                  <div className="text-[12px] font-bold text-gray-500 mb-1">🔥 Calories/วัน</div>
                  <div className="text-[22px] font-bold text-orange-500">{latestCalRec?.caloriesBurned ?? avgCal}</div>
                  <div className="text-[10px] text-gray-400">ล่าสุด (cal){latestCalRec ? ` · ${latestCalRec.date.slice(5)}` : ''}</div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[11px] text-gray-500">เฉลี่ย 30 วัน</div>
                    <div className="text-[14px] font-bold text-gray-700">{avgCal} cal</div>
                  </div>
                </Card>
              )}
              {avgDist !== null && (
                <Card>
                  <div className="text-[12px] font-bold text-gray-500 mb-1">📍 ระยะทาง/วัน</div>
                  <div className="text-[22px] font-bold text-sky-500">{latestDistRec?.distanceKm?.toFixed(1) ?? avgDist}</div>
                  <div className="text-[10px] text-gray-400">ล่าสุด (กม.){latestDistRec ? ` · ${latestDistRec.date.slice(5)}` : ''}</div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[11px] text-gray-500">เฉลี่ย 30 วัน</div>
                    <div className="text-[14px] font-bold text-gray-700">{avgDist} กม.</div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )
      })()}

      {/* VO2max Trend */}
      {(() => {
        const pts = (allDaily ?? []).filter((d: any) => d.vo2max).sort((a: any, b: any) => a.date.localeCompare(b.date))
        if (pts.length === 0) return null
        const latest = pts[pts.length - 1].vo2max
        const avg = Math.round(pts.reduce((s: number, d: any) => s + d.vo2max, 0) / pts.length * 10) / 10
        const trend = pts.length >= 2 ? pts[pts.length - 1].vo2max - pts[0].vo2max : 0
        const statusColor = latest >= 50 ? 'text-green-600' : latest >= 40 ? 'text-amber-500' : 'text-red-500'
        const statusLabel = latest >= 50 ? 'Excellent' : latest >= 42 ? 'Good' : latest >= 35 ? 'Average' : 'Low'
        return (
          <div className="mx-4 mt-3">
            <Card>
              <div className="flex items-center justify-between mb-1">
                <CardTitle>🫁 VO₂max</CardTitle>
                <span className={`text-[11px] font-bold ${statusColor}`}>{statusLabel}</span>
              </div>
              <div className="flex items-end gap-3 mb-2">
                <div>
                  <div className={`text-[28px] font-bold leading-none ${statusColor}`}>{latest.toFixed(1)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">ml/kg/min · {pts[pts.length - 1].date.slice(5)}</div>
                </div>
                <div className="mb-1 text-[13px] text-gray-400">
                  เฉลี่ย <b className="text-gray-700">{avg}</b>
                  {pts.length >= 2 && (
                    <span className={`ml-2 font-semibold ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'}{Math.abs(trend).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <Sparkline points={pts.map((d: any) => d.vo2max)} color={latest >= 42 ? '#16a34a' : '#f59e0b'} height={44} />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{pts[0].date.slice(5)}</span>
                <span>{pts[pts.length - 1].date.slice(5)}</span>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5 text-[11px] text-gray-500 mt-2">
                <div className="font-semibold text-gray-700 mb-1">เกณฑ์ Longevity (Peter Attia)</div>
                <div className="flex justify-between"><span>Excellent</span><span className="text-green-600 font-semibold">≥50</span></div>
                <div className="flex justify-between mt-0.5"><span>Good</span><span className="text-amber-500 font-semibold">42–49</span></div>
                <div className="flex justify-between mt-0.5"><span>Average</span><span className="text-gray-500">35–41</span></div>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* Biological Age Trend */}
      {(() => {
        const records = [...(allRecords ?? [])].sort((a: any, b: any) => a.date.localeCompare(b.date))
        const recordMap = new Map(records.map((r: any) => [r.date, r]))
        const latestRecord = records[records.length - 1]
        // ใช้ daily data เป็น timeline หลัก (ถ้ามี blood test ที่ตรงวันก็ใช้, ถ้าไม่มีก็ใช้ latest blood test)
        const dailyArr = [...(allDaily ?? [])].sort((a: any, b: any) => a.date.localeCompare(b.date))
        // Sample weekly (every 7th record) เพื่อให้ chart ไม่หนาแน่นไป
        const sampled = dailyArr.length > 14 ? dailyArr.filter((_, i) => i % 7 === 0 || i === dailyArr.length - 1) : dailyArr
        const bioPoints: { date: string; bio: number }[] = []
        for (const daily of sampled) {
          const r: any = recordMap.get(daily.date) ?? latestRecord
          const bmi = profile?.heightCm && daily?.weightKg ? (daily.weightKg as number) / Math.pow(profile.heightCm / 100, 2) : undefined
          const bio = calcBiologicalAge(age, {
            systolic: r?.systolic, glucose: r?.glucose, ldl: r?.ldl, hdl: r?.hdl,
            vo2max: daily?.vo2max as number | undefined, sleepHours: daily?.sleepTotal as number | undefined, steps: daily?.steps as number | undefined, bmi,
          })
          bioPoints.push({ date: daily.date, bio })
        }
        if (bioPoints.length < 2) return null
        const latest = bioPoints[bioPoints.length - 1]
        const trend = latest.bio - bioPoints[0].bio
        const diff = latest.bio - age
        const diffColor = diff < -1 ? 'text-green-600' : diff > 1 ? 'text-red-500' : 'text-gray-500'
        return (
          <div className="mx-4 mt-3">
            <Card>
              <div className="flex items-center justify-between mb-1">
                <CardTitle>🧬 อายุชีวภาพ (เทรนด์)</CardTitle>
                <span className={`text-[11px] font-bold ${diffColor}`}>
                  {diff < 0 ? `ดีกว่า ${Math.abs(diff).toFixed(1)} ปี` : diff > 0 ? `สูงกว่า ${diff.toFixed(1)} ปี` : 'เท่ากับอายุจริง'}
                </span>
              </div>
              <div className="flex items-end gap-3 mb-2">
                <div>
                  <div className={`text-[28px] font-bold leading-none ${diffColor}`}>{latest.bio.toFixed(1)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">ปี (อายุจริง {age})</div>
                </div>
                <div className="mb-1 text-[13px] text-gray-400">
                  {bioPoints.length >= 2 && (
                    <span className={`font-semibold ${trend < 0 ? 'text-green-600' : trend > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {trend < 0 ? '▼' : trend > 0 ? '▲' : '—'}{Math.abs(trend).toFixed(1)} ปี
                    </span>
                  )}
                  <span className="text-gray-400 ml-1">จาก {bioPoints[0].date.slice(0, 7)}</span>
                </div>
              </div>
              <Sparkline points={bioPoints.map(p => p.bio)} color={diff < 0 ? '#16a34a' : '#ef4444'} height={44} />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{bioPoints[0].date.slice(5)}</span>
                <span>{latest.date.slice(5)}</span>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* Weight tracker — chart, quick entry, stats */}
      <WeightTracker allDaily={allDaily ?? []} profile={profile} />

      {/* Weight / BMI history list */}
      {(() => {
        const withWeight = (allDaily ?? []).filter((d: any) => d.weightKg)
        if (withWeight.length < 2) return null
        return (
          <div className="mx-4 mt-2 mb-1">
            <div className="text-[12px] font-semibold text-gray-400 mb-1.5 px-1">ประวัติน้ำหนัก & BMI</div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {withWeight.slice(0, 12).map((d: any, idx: number) => {
                const bmiVal = profile?.heightCm ? d.weightKg / Math.pow(profile.heightCm / 100, 2) : null
                const bmiStatus = bmiVal ? (bmiVal < 18.5 ? 'น้ำหนักน้อย' : bmiVal < 25 ? 'ปกติ' : bmiVal < 30 ? 'เกิน' : 'อ้วน') : null
                const bmiColor = bmiVal ? (bmiVal < 18.5 ? 'text-amber-500' : bmiVal < 25 ? 'text-green-600' : bmiVal < 30 ? 'text-amber-500' : 'text-red-500') : ''
                return (
                  <div key={d.id} className={`flex items-center justify-between px-4 py-2.5 ${idx > 0 ? 'border-t border-gray-50' : ''} ${idx === 0 ? 'bg-indigo-50/40' : ''}`}>
                    <div className="flex items-center gap-2">
                      {idx === 0 && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full">ล่าสุด</span>}
                      <div className="text-[13px] text-gray-500">{d.date}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-[13px] font-bold text-gray-900">{d.weightKg} กก.</div>
                      {bmiVal && (
                        <div className={`text-[12px] font-semibold ${bmiColor}`}>BMI {bmiVal.toFixed(1)} <span className="text-[10px] font-normal">{bmiStatus}</span></div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Core metrics */}
      {latestRecord && (
        <>
          <SectionLabel>ผลตรวจล่าสุด — {latestRecord.date}</SectionLabel>
          <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm">
            {basicKeys.map((key, idx) => {
              const val = (latestRecord as any)[key]
              if (val === undefined || val === null) return null
              const def = BIOMARKERS[key]
              if (!def) return null
              const status = def.evaluate(val)
              const col = STATUS_COLOR[status]
              return (
                <div key={key} className={`flex items-center justify-between px-4 py-3 ${idx < basicKeys.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900">{def.label}</div>
                    <div className="text-[11px] text-gray-400">ปกติ {def.normal} | Optimal {def.optimal} {def.unit}</div>
                    {def.femaleNote && <div className="text-[10px] text-pink-500">♀ {def.femaleNote}</div>}
                  </div>
                  <div className="text-right">
                    <div className={`text-[15px] font-bold ${col.text}`}>{val} <span className="text-xs font-normal text-gray-400">{def.unit}</span></div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${col.badge}`}>{col.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Checkup reminders */}
      {checkups.length > 0 && (
        <>
          <SectionLabel>ควรตรวจ (อายุ {age} ปี)</SectionLabel>
          <div className="mx-4 mb-4">
            <Card className="!bg-amber-50">
              <div className="flex flex-col gap-1.5">
                {checkups.map((c: string) => {
                  const done = doneCheckups.has(c)
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        const next = new Set(doneCheckups)
                        done ? next.delete(c) : next.add(c)
                        setDoneCheckups(next)
                        saveDoneCheckups(next)
                      }}
                      className={`flex items-center gap-2.5 text-[13px] text-left active:scale-[0.98] transition-all rounded-xl px-1 py-0.5 ${done ? 'opacity-50' : ''}`}
                    >
                      <span className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${done ? 'bg-amber-500 border-amber-500' : 'border-amber-400 bg-white'}`}>
                        {done && <span className="text-white text-[11px] font-bold">✓</span>}
                      </span>
                      <span className={`${done ? 'line-through text-amber-600' : 'text-amber-800'}`}>{c}</span>
                    </button>
                  )
                })}
              </div>
              {doneCheckups.size > 0 && (
                <button
                  onClick={() => { setDoneCheckups(new Set()); saveDoneCheckups(new Set()) }}
                  className="mt-3 text-[11px] text-amber-500 font-semibold"
                >
                  รีเซ็ตทั้งหมด
                </button>
              )}
            </Card>
          </div>
        </>
      )}
      <div className="h-4" />
    </>
  )
}

// ── My Plan Tab ────────────────────────────────────────────────────────────

const URGENT_ITEMS = [
  { id: 'hepatitis_b', icon: '💉', label: 'ฉีดวัคซีน Hepatitis B', detail: 'Anti-HBs <2 = ไม่มีภูมิ! ทำลายตับถาวร', by: 'ภายใน 1 เดือน' },
  { id: 'mammogram', icon: '🎗', label: 'Mammogram + Breast Ultrasound', detail: 'แม่เป็นมะเร็งเต้านม → เริ่มตรวจตั้งแต่อายุ 35', by: 'ภายใน 1 เดือน' },
  { id: 'brca', icon: '🧬', label: 'BRCA1/BRCA2 Gene Test', detail: 'แม่มะเร็งเต้านม → โอกาส positive ~50% ราคา 8,000–15,000 บาท', by: 'ปีนี้' },
  { id: 'vitd_recheck', icon: '☀️', label: 'ตรวจ Vitamin D ซ้ำ', detail: 'ค่าล่าสุด 17.82 ng/mL (เป้า 50+ ng/mL) กิน D3 5,000 IU ไป 3 เดือนแล้ว', by: '3 เดือนจากที่เริ่มกิน' },
  { id: 'apob_panel', icon: '🫀', label: 'ตรวจ ApoB, Lp(a), Homocysteine, TSH, DHEA-S', detail: 'ยังไม่เคยตรวจ — สำคัญมากสำหรับ longevity baseline', by: 'ภายใน 3 เดือน' },
  { id: 'dexa_vo2', icon: '💪', label: 'DEXA Body Composition + VO2 Max test', detail: 'Baseline สำคัญ — รู้ muscle mass จริงเพื่อติดตาม longevity', by: 'ภายใน 6 เดือน' },
]

const CURRENT_ISSUES = [
  { key: 'hba1c',   label: 'HbA1c', current: '5.74%', optimal: '<5.3%', action: 'เร่งลด insulin resistance เป็นลำดับแรก', color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'insulin', label: 'Fasting Insulin', current: '17.3 µIU/mL', optimal: '<5', action: 'IF + ลดน้ำตาล + L-Carnitine + Berberine', color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'homaIr',  label: 'HOMA-IR', current: '~3.6', optimal: '<1.5', action: 'ต้องแก้ด่วน — เสี่ยงเบาหวาน Type 2', color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'hsCrp',  label: 'hs-CRP', current: '3.13 mg/L', optimal: '<1.0', action: 'ลดน้ำตาล + Omega-3 + Curcumin + ออกกำลังกาย', color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'bp',      label: 'ความดันโลหิต', current: '127/87', optimal: '<120/75', action: 'ลดเกลือ + Magnesium + ออกกำลังกาย + ลด stress', color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'ggt',     label: 'GGT', current: '57 U/L', optimal: '<20 U/L', action: 'ลด alcohol + ลดน้ำตาล + Curcumin', color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'vitd',    label: 'Vitamin D', current: '17.82 ng/mL', optimal: '50–80 ng/mL', action: 'กิน D3 5,000 IU/วัน ตรวจซ้ำ 3 เดือน', color: 'text-orange-600', bg: 'bg-orange-50' },
]

const AGE_MILESTONES = [
  {
    age: 40, year: 2029, label: 'อายุ 40', color: 'border-orange-400 bg-orange-50',
    items: [
      'DEXA Bone Density ครั้งแรก',
      'Breast MRI (ถ้า density สูง)',
      'Carotid IMT (ความหนาหลอดเลือด)',
      'ApoE Genotype (ความเสี่ยง Alzheimer\'s)',
      'TSH (ไทรอยด์) ทุกปี',
      'HOMA-IR ทุกปี',
    ],
  },
  {
    age: 45, year: 2034, label: 'อายุ 45', color: 'border-yellow-400 bg-yellow-50',
    items: [
      'Colonoscopy ครั้งแรก (family history)',
      'เพิ่มความถี่ Mammogram ถ้าจำเป็น',
      'ทบทวน hormone panel (perimenopause)',
      'Carotid IMT ซ้ำ',
      'AMH + FSH (Ovarian Reserve)',
    ],
  },
  {
    age: 50, year: 2039, label: 'อายุ 50+', color: 'border-green-400 bg-green-50',
    items: [
      'Colonoscopy ทุก 5–10 ปี',
      'DEXA Bone Density ทุก 2 ปี',
      'Mammogram + MRI เต้านม ทุกปี',
      'Cardiac CT / Echo ทุก 3–5 ปี',
      'ฮอร์โมนวัยทอง (Estrogen, FSH, LH)',
      'ตรวจตา (Glaucoma, ต้อกระจก) ทุกปี',
      'ตรวจการได้ยิน ทุก 2–3 ปี',
    ],
  },
]

const CANCER_SCREENING = [
  { label: 'Mammogram + Breast Ultrasound', freq: 'ทุกปี', since: 'เริ่มอายุ 35', icon: '🎗', urgent: true },
  { label: 'Breast MRI (High Risk)', freq: 'ทุก 1–2 ปี ถ้า density สูง', since: 'ปรึกษา breast surgeon', icon: '🔬', urgent: false },
  { label: 'BRCA1/BRCA2 Gene Test', freq: 'ครั้งเดียวในชีวิต', since: 'ทำให้เร็วที่สุด', icon: '🧬', urgent: true },
  { label: 'Pap Smear + HPV DNA', freq: 'ทุก 3–5 ปี', since: '', icon: '🩺', urgent: false },
  { label: 'Colonoscopy', freq: 'ครั้งแรกอายุ 45 (ปี 2034)', since: 'มี family history → เริ่มเร็ว', icon: '🔭', urgent: false },
  { label: 'Full Body Skin Check', freq: 'ทุกปี', since: 'เริ่มอายุ 35', icon: '🌿', urgent: false },
]

const GOOD_RESULTS = [
  'หัวใจ: EF 72%, CAC=0, Stress Test ผ่าน, ABI ปกติ',
  'ไทรอยด์: TSH/FT3/FT4 ปกติตลอด',
  'HbA1c: 5.74% (ยังปกติ)',
  'ฮอร์โมนเพศหญิง: ปกติทั้งหมด',
  'Allergy IgE: ไม่มีการแพ้ที่มีนัยสำคัญ',
  'Vitamin B1, B2, B6, B12, Ferritin: ปกติ',
  'Cholesterol/LDL: ดีขึ้นมากจากปี 2565',
  'Chest X-Ray: ปกติ, Carotid: ไม่มี plaque',
]

function MyPlanTab(_props: { age?: number; latestRecord?: HealthRecord | null }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('health_plan_done') ?? '{}') } catch { return {} }
  })

  function toggle(id: string) {
    setDone(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem('health_plan_done', JSON.stringify(next))
      return next
    })
  }

  const urgentRemaining = URGENT_ITEMS.filter(i => !done[i.id]).length

  return (
    <div className="pb-8">
      {/* High-risk banner */}
      <div className="bg-red-600 px-4 py-3 text-white">
        <div className="text-[13px] font-bold">⚠️ High-Risk Profile</div>
        <div className="text-[11px] opacity-90 mt-0.5">พ่อเป็นโรคหัวใจ · แม่เป็นเบาหวาน มะเร็งเต้านม ความดัน → ต้องตรวจเร็วและบ่อยกว่าคนทั่วไป</div>
      </div>

      {/* Urgent section */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[15px] font-bold text-gray-900">🔴 เร่งด่วน — ตรวจทันที</div>
          {urgentRemaining > 0
            ? <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">เหลือ {urgentRemaining} รายการ</span>
            : <span className="text-[11px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ ครบแล้ว</span>
          }
        </div>
        <div className="flex flex-col gap-2">
          {URGENT_ITEMS.map(item => (
            <button key={item.id} onClick={() => toggle(item.id)}
              className={`flex items-start gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm text-left active:scale-[0.98] transition-all ${done[item.id] ? 'opacity-50' : ''}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${done[item.id] ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                {done[item.id] && <span className="text-white text-[10px]">✓</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold ${done[item.id] ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {item.icon} {item.label}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.detail}</div>
                <div className="text-[10px] font-semibold text-red-500 mt-1">{item.by}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current issues */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[15px] font-bold text-gray-900 mb-2">⚠️ ค่าที่ต้องปรับปรุง</div>
        <div className="flex flex-col gap-2">
          {CURRENT_ISSUES.map(issue => (
            <div key={issue.key} className={`rounded-2xl px-4 py-3 ${issue.bg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-gray-900">{issue.label}</span>
                <div className="text-right">
                  <span className={`text-[14px] font-bold ${issue.color}`}>{issue.current}</span>
                  <div className="text-[10px] text-gray-500">เป้า {issue.optimal}</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-600 mt-1">→ {issue.action}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Good results */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[15px] font-bold text-gray-900 mb-2">✅ ผลดี — รักษาระดับนี้ไว้</div>
        <div className="bg-green-50 rounded-2xl px-4 py-3">
          <div className="flex flex-col gap-1.5">
            {GOOD_RESULTS.map(r => (
              <div key={r} className="flex items-start gap-2 text-[12px] text-green-800">
                <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Age milestones */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[15px] font-bold text-gray-900 mb-2">📅 แผนตามช่วงอายุ</div>
        <div className="flex flex-col gap-3">
          {AGE_MILESTONES.map(m => (
            <div key={m.age} className={`rounded-2xl border-l-4 px-4 py-3 ${m.color}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[14px] font-bold text-gray-900">{m.label}</span>
                <span className="text-[11px] font-semibold text-gray-500">ปี {m.year}</span>
              </div>
              <div className="flex flex-col gap-1">
                {m.items.map(it => (
                  <div key={it} className="flex items-start gap-2 text-[12px] text-gray-700">
                    <span className="text-gray-400 flex-shrink-0">•</span>
                    <span>{it}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancer screening */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[15px] font-bold text-gray-900 mb-2">🎗 Cancer Screening (High Risk)</div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {CANCER_SCREENING.map((s, idx) => (
            <div key={s.label} className={`px-4 py-3 ${idx < CANCER_SCREENING.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0">{s.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-gray-900">{s.label}</span>
                    {s.urgent && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded-full">เร่งด่วน</span>}
                  </div>
                  <div className="text-[11px] text-indigo-600 font-semibold mt-0.5">{s.freq}</div>
                  {s.since && <div className="text-[11px] text-gray-400">{s.since}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LongevityTab({ latestRecord, age }: { latestRecord: HealthRecord | undefined | null; age: number }) {
  const ageGroup = age >= 50 ? '50+' : age >= 40 ? '40+' : age >= 35 ? '35+' : '30+'

  const longevityItems = LONGEVITY_KEYS.map(key => {
    const def = BIOMARKERS[key]
    const val = latestRecord ? (latestRecord as any)[key] : undefined
    const status = val !== undefined ? def.evaluate(val) : null
    return { key, def, val, status }
  })

  const scored = longevityItems.filter(x => x.status)
  const optimalCount = scored.filter(x => x.status === 'optimal').length
  const goodCount = scored.filter(x => x.status === 'good').length
  const longevityScore = scored.length > 0
    ? Math.round(((optimalCount * 2 + goodCount) / (scored.length * 2)) * 100)
    : 0

  return (
    <>
      <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-5 py-5 text-white">
        <div className="text-xs opacity-75 mb-1">Longevity Score</div>
        <div className="text-4xl font-bold mb-1">{longevityScore}<span className="text-lg font-normal opacity-75">/100</span></div>
        <div className="text-sm opacity-80">
          {scored.length > 0
            ? `${optimalCount} Optimal · ${goodCount} ดี · ${scored.length - optimalCount - goodCount} ต้องปรับ`
            : 'ยังไม่มีข้อมูล กรุณาเพิ่มผลตรวจ'}
        </div>
      </div>

      {/* Age group guidance */}
      <div className="mx-4 mt-3">
        <Card className="!bg-violet-50">
          <div className="text-[13px] font-bold text-violet-700 mb-2">🔬 Longevity Focus — ช่วงอายุ {ageGroup}</div>
          <div className="flex flex-col gap-1.5 text-[12px] text-violet-800">
            {ageGroup === '30+' && <>
              <div>• เริ่มสร้าง baseline biomarkers ทั้งหมด</div>
              <div>• Vitamin D, Magnesium, Omega-3 สำคัญมาก</div>
              <div>• ออกกำลังกาย Zone 2 อย่างน้อย 150 นาที/สัปดาห์</div>
              <div>• นอน 7-9 ชม., ติดตาม sleep quality</div>
            </>}
            {ageGroup === '35+' && <>
              <div>• ตรวจ ApoB + Lp(a) เพื่อ cardiovascular risk</div>
              <div>• ฝึก strength training เพื่อ muscle mass</div>
              <div>• Fasting Insulin → ตรวจ insulin resistance</div>
              <div>• เพิ่ม Zone 5 training สัปดาห์ละ 1-2 ครั้ง</div>
            </>}
            {ageGroup === '40+' && <>
              <div>• Cardiac CT (CAC score) สำคัญมากช่วงนี้</div>
              <div>• ดู Perimenopause signs: ฮอร์โมน FSH, LH, E2</div>
              <div>• รักษา VO₂max ≥ 35 mL/kg/min</div>
              <div>• ตรวจ DEXA scan มวลกระดูก + body composition</div>
            </>}
            {ageGroup === '50+' && <>
              <div>• Menopause management: HRT ถ้าจำเป็น</div>
              <div>• ป้องกัน sarcopenia: protein ≥ 1.6 g/kg/วัน</div>
              <div>• Balance training เพื่อป้องกันหกล้ม</div>
              <div>• ตรวจ Colonoscopy + Mammogram ประจำปี</div>
            </>}
          </div>
        </Card>
      </div>

      {/* Longevity biomarker status */}
      <SectionLabel>Longevity Biomarkers</SectionLabel>
      <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
        {longevityItems.map((item, idx) => {
          const col = item.status ? STATUS_COLOR[item.status] : null
          return (
            <div key={item.key} className={`flex items-center justify-between px-4 py-3 ${idx < longevityItems.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <div className="text-[14px] font-semibold text-gray-900">{item.def.label}</div>
                <div className="text-[11px] text-gray-400">Optimal: {item.def.optimal} {item.def.unit}</div>
                {item.def.femaleNote && <div className="text-[10px] text-pink-500">♀ {item.def.femaleNote}</div>}
              </div>
              <div className="text-right">
                {item.val !== undefined ? (
                  <>
                    <div className={`text-[15px] font-bold ${col?.text}`}>{item.val}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${col?.badge}`}>{col?.label}</span>
                  </>
                ) : (
                  <span className="text-[12px] text-gray-300">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function RecordsTab({ records, onEdit }: { records: HealthRecord[]; onEdit: (r: HealthRecord) => void }) {
  if (records.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-3">🩺</div>
      <div>ยังไม่มีผลตรวจสุขภาพ</div>
    </div>
  )
  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {records.map(r => (
        <Card key={r.id}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold text-indigo-600">{r.date}</div>
            <div className="flex gap-1">
              <IconButton onClick={() => onEdit(r)}>✏️</IconButton>
              <IconButton tone="destructive" onClick={() => { if (confirm('ลบผลตรวจนี้?\nไม่สามารถกู้คืนได้')) db.healthRecords.delete(r.id!) }}>🗑️</IconButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-1.5">
            {r.systolic && <div className="text-[13px]">ความดัน: <b>{r.systolic}/{r.diastolic}</b></div>}
            {r.glucose && <div className="text-[13px]">น้ำตาล: <b>{r.glucose}</b></div>}
            {r.ldl && <div className="text-[13px]">LDL: <b>{r.ldl}</b></div>}
            {r.hdl && <div className="text-[13px]">HDL: <b>{r.hdl}</b></div>}
            {r.heartRate && <div className="text-[13px]">หัวใจ: <b>{r.heartRate} bpm</b></div>}
            {r.hba1c && <div className="text-[13px]">HbA1c: <b>{r.hba1c}%</b></div>}
            {r.apoB && <div className="text-[13px]">ApoB: <b>{r.apoB}</b></div>}
            {r.lpA && <div className="text-[13px]">Lp(a): <b>{r.lpA}</b></div>}
            {r.hsCrp && <div className="text-[13px]">hs-CRP: <b>{r.hsCrp}</b></div>}
            {r.vitaminD && <div className="text-[13px]">Vit D: <b>{r.vitaminD}</b></div>}
          </div>
        </Card>
      ))}
    </div>
  )
}

function DailyTab({ daily, onEdit }: { daily: HealthDaily[]; onEdit: (d: HealthDaily) => void }) {
  if (daily.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-3">🏃</div>
      <div>ยังไม่มีข้อมูลกิจกรรม</div>
    </div>
  )
  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {daily.map(d => (
        <Card key={d.id}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold text-indigo-600">{d.date}</div>
            <div className="flex items-center gap-2">
              {d.source && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{d.source}</span>}
              <IconButton onClick={() => onEdit(d)}>✏️</IconButton>
              <IconButton tone="destructive" onClick={() => { if (confirm('ลบข้อมูลรายวันนี้?\nไม่สามารถกู้คืนได้')) db.healthDaily.delete(d.id!) }}>🗑️</IconButton>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '⚖️', label: 'น้ำหนัก', val: d.weightKg ? `${d.weightKg} กก.` : null },
              { icon: '👣', label: 'ก้าว', val: d.steps?.toLocaleString() },
              { icon: '😴', label: 'นอนรวม', val: d.sleepTotal ? `${d.sleepTotal} ชม.` : null },
              { icon: '🌊', label: 'Deep', val: d.sleepDeep ? `${d.sleepDeep} ชม.` : null },
              { icon: '💫', label: 'REM', val: d.sleepRem ? `${d.sleepRem} ชม.` : null },
              { icon: '🔥', label: 'เผาผลาญ', val: d.caloriesBurned?.toString() },
              { icon: '🫀', label: 'VO₂max', val: d.vo2max?.toFixed(1) },
              { icon: '🟢', label: 'Recovery', val: d.recoveryScore !== undefined ? `${d.recoveryScore}%` : null },
              { icon: '📡', label: 'HRV', val: d.hrv !== undefined ? `${d.hrv} ms` : null },
              { icon: '❤️', label: 'RHR', val: d.restingHeartRate !== undefined ? `${d.restingHeartRate} bpm` : null },
              { icon: '⚡', label: 'Strain', val: d.strain !== undefined ? `${d.strain}` : null },
              { icon: '🫁', label: 'Sleep%', val: d.sleepPerformance !== undefined ? `${d.sleepPerformance}%` : null },
              { icon: '🩵', label: 'SpO₂', val: d.bloodOxygen !== undefined ? `${Number(d.bloodOxygen).toFixed(2)}%` : null },
            ].filter(x => x.val).map(x => (
              <div key={x.label} className="bg-gray-50 rounded-xl p-2 text-center">
                <div className="text-base">{x.icon}</div>
                <div className="text-[11px] font-bold text-gray-900 mt-0.5">{x.val}</div>
                <div className="text-[10px] text-gray-400">{x.label}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Health Record Form ─────────────────────────────────────────────────────
type HealthFormState = Partial<Record<string, string>> & { date: string }

function HealthRecordForm({ editItem, onClose }: { editItem: HealthRecord | null; onClose: () => void }) {
  const [section, setSection] = useState<'basic' | 'advanced' | 'body' | 'hormones'>('basic')
  const [form, setForm] = useState<HealthFormState>(() => {
    const base: HealthFormState = { date: editItem?.date ?? new Date().toISOString().slice(0, 10) }
    if (editItem) {
      const fields = ['systolic','diastolic','heartRate','glucose','hba1c','fastingInsulin',
        'ldl','hdl','triglycerides','totalCholesterol','apoB','lpA','hsCrp',
        'homocysteine','omega3Index','cacScore',
        'alt','ast','ggt','creatinine','egfr','uricAcid',
        'tsh','dheaS','igf1','cortisol',
        'vitaminD','vitaminB12','vitaminB6','magnesium','ferritin','hemoglobin',
        'bodyFatPct','muscleMassKg','waistCm','boneDensityTScore',
        'gripStrength','mocaScore',
        'estradiol','progesterone','fsh','lh','testosterone']
      fields.forEach(f => {
        const v = (editItem as any)[f]
        if (v !== undefined) base[f] = String(v)
      })
    }
    return base
  })

  function set(key: string, val: string) { setForm(v => ({ ...v, [key]: val })) }

  function num(key: string) {
    const v = form[key]
    return v ? parseFloat(v) : undefined
  }

  async function save() {
    const data: Omit<HealthRecord, 'id'> = {
      date: form.date!,
      systolic: num('systolic'), diastolic: num('diastolic'), heartRate: num('heartRate'),
      glucose: num('glucose'), hba1c: num('hba1c'), fastingInsulin: num('fastingInsulin'),
      homaIr: (num('glucose') && num('fastingInsulin')) ? parseFloat(((num('glucose')! * num('fastingInsulin')!) / 405).toFixed(2)) : undefined,
      ldl: num('ldl'), hdl: num('hdl'), triglycerides: num('triglycerides'), totalCholesterol: num('totalCholesterol'),
      apoB: num('apoB'), lpA: num('lpA'),
      hsCrp: num('hsCrp'), homocysteine: num('homocysteine'), omega3Index: num('omega3Index'), cacScore: num('cacScore'),
      alt: num('alt'), ast: num('ast'), ggt: num('ggt'),
      creatinine: num('creatinine'), egfr: num('egfr'), uricAcid: num('uricAcid'),
      tsh: num('tsh'), dheaS: num('dheaS'), igf1: num('igf1'), cortisol: num('cortisol'),
      vitaminD: num('vitaminD'), vitaminB12: num('vitaminB12'), vitaminB6: num('vitaminB6'),
      magnesium: num('magnesium'), ferritin: num('ferritin'),
      hemoglobin: num('hemoglobin'),
      bodyFatPct: num('bodyFatPct'), muscleMassKg: num('muscleMassKg'), waistCm: num('waistCm'),
      boneDensityTScore: num('boneDensityTScore'),
      weightKg: num('weightKg'),
      gripStrength: num('gripStrength'), mocaScore: num('mocaScore'),
      estradiol: num('estradiol'), progesterone: num('progesterone'), fsh: num('fsh'), lh: num('lh'), testosterone: num('testosterone'),
    }
    if (editItem?.id) await db.healthRecords.update(editItem.id, data)
    else await db.healthRecords.add(data)
    onClose()
  }

  const F = ({ label, k, ph }: { label: string; k: string; ph?: string }) => (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <input type="number" step="any" placeholder={ph} value={form[k] ?? ''}
        onChange={e => set(k, e.target.value)}
        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-full" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'บันทึก'}ผลตรวจ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />

        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([['basic', 'พื้นฐาน'], ['advanced', 'Longevity'], ['body', 'ร่างกาย'], ['hormones', 'ฮอร์โมน']] as const).map(([s, l]) => (
            <button key={s} onClick={() => setSection(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-semibold ${section === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {l}
            </button>
          ))}
        </div>

        {section === 'basic' && (
          <div className="grid grid-cols-2 gap-3">
            <F label="ความดัน (บน) mmHg" k="systolic" ph="120" />
            <F label="ความดัน (ล่าง) mmHg" k="diastolic" ph="80" />
            <F label="หัวใจ (bpm)" k="heartRate" ph="72" />
            <F label="น้ำตาล (mg/dL)" k="glucose" ph="95" />
            <F label="LDL (mg/dL)" k="ldl" ph="100" />
            <F label="HDL (mg/dL)" k="hdl" ph="65" />
            <F label="Triglycerides" k="triglycerides" ph="120" />
            <F label="Cholesterol รวม" k="totalCholesterol" ph="180" />
            <F label="HbA1c (%)" k="hba1c" ph="5.4" />
            <F label="Creatinine" k="creatinine" ph="0.8" />
          </div>
        )}
        {section === 'advanced' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">ไขมัน + เบาหวาน</div>
            <F label="ApoB (mg/dL)" k="apoB" ph="80" />
            <F label="Lp(a) (mg/dL)" k="lpA" ph="15" />
            <F label="Fasting Insulin" k="fastingInsulin" ph="5" />
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">การอักเสบ</div>
            <F label="hs-CRP (mg/L)" k="hsCrp" ph="0.5" />
            <F label="Homocysteine (µmol/L)" k="homocysteine" ph="8" />
            <F label="Omega-3 Index (%)" k="omega3Index" ph="8" />
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">ตับ + ไต</div>
            <F label="ALT (U/L)" k="alt" ph="20" />
            <F label="AST (U/L)" k="ast" ph="20" />
            <F label="GGT (U/L)" k="ggt" ph="20" />
            <F label="eGFR" k="egfr" ph="90" />
            <F label="กรดยูริก" k="uricAcid" ph="5" />
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">ไทรอยด์ + ฮอร์โมน Longevity</div>
            <F label="TSH (µIU/mL)" k="tsh" ph="1.5" />
            <F label="DHEA-S (µg/dL)" k="dheaS" ph="200" />
            <F label="IGF-1 (ng/mL)" k="igf1" ph="150" />
            <F label="Cortisol AM (µg/dL)" k="cortisol" ph="15" />
            <F label="CAC Score" k="cacScore" ph="0" />
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">วิตามิน + แร่ธาตุ</div>
            <F label="Vitamin D (ng/mL)" k="vitaminD" ph="60" />
            <F label="Vitamin B12 (pg/mL)" k="vitaminB12" ph="500" />
            <F label="Vitamin B6 (ng/mL)" k="vitaminB6" ph="30" />
            <F label="Magnesium (mg/dL)" k="magnesium" ph="2.1" />
            <F label="Ferritin (ng/mL)" k="ferritin" ph="60" />
            <F label="Hemoglobin (g/dL)" k="hemoglobin" ph="13.5" />
          </div>
        )}
        {section === 'body' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">Body Composition</div>
            <F label="น้ำหนัก (กก.)" k="weightKg" ph="60" />
            <F label="ไขมันร่างกาย (%)" k="bodyFatPct" ph="22" />
            <F label="มวลกล้ามเนื้อ (กก.)" k="muscleMassKg" ph="40" />
            <F label="รอบเอว (ซม.)" k="waistCm" ph="70" />
            <F label="Bone Density (T-score)" k="boneDensityTScore" ph="0.5" />
            <div className="col-span-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mt-1">สมรรถภาพร่างกาย</div>
            <F label="Grip Strength (กก.)" k="gripStrength" ph="28" />
            <F label="MoCA Score (/30)" k="mocaScore" ph="27" />
          </div>
        )}
        {section === 'hormones' && (
          <div className="grid grid-cols-2 gap-3">
            <F label="Estradiol (pg/mL)" k="estradiol" ph="150" />
            <F label="Progesterone (ng/mL)" k="progesterone" ph="10" />
            <F label="FSH (mIU/mL)" k="fsh" ph="8" />
            <F label="LH (mIU/mL)" k="lh" ph="8" />
            <F label="Testosterone (ng/dL)" k="testosterone" ph="30" />
          </div>
        )}

        {/* HOMA-IR auto-calc preview */}
        {form['glucose'] && form['fastingInsulin'] && (
          <div className="bg-indigo-50 rounded-xl px-4 py-2.5 text-[13px] text-indigo-700">
            HOMA-IR (คำนวณอัตโนมัติ) = <b>{((parseFloat(form['glucose']!) * parseFloat(form['fastingInsulin']!)) / 405).toFixed(2)}</b>
            <span className="text-[11px] text-indigo-500 ml-1">(ดี &lt;1.5, เสี่ยง &gt;2.5)</span>
          </div>
        )}

        <Button onClick={save}>
          {editItem ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}

function HealthDailyForm({ editItem, onClose }: { editItem: HealthDaily | null; onClose: () => void }) {
  const [form, setForm] = useState({
    date: editItem?.date ?? new Date().toISOString().slice(0, 10),
    weightKg: editItem?.weightKg?.toString() ?? '',
    steps: editItem?.steps?.toString() ?? '',
    sleepTotal: editItem?.sleepTotal?.toString() ?? '',
    sleepDeep: editItem?.sleepDeep?.toString() ?? '',
    sleepRem: editItem?.sleepRem?.toString() ?? '',
    sleepLight: editItem?.sleepLight?.toString() ?? '',
    caloriesBurned: editItem?.caloriesBurned?.toString() ?? '',
    vo2max: editItem?.vo2max?.toString() ?? '',
    distanceKm: editItem?.distanceKm?.toString() ?? '',
    source: editItem?.source ?? 'manual',
  })

  async function save() {
    const data = {
      date: form.date,
      weightKg: form.weightKg ? parseFloat(form.weightKg) : undefined,
      steps: form.steps ? parseInt(form.steps) : undefined,
      sleepTotal: form.sleepTotal ? parseFloat(form.sleepTotal) : undefined,
      sleepDeep: form.sleepDeep ? parseFloat(form.sleepDeep) : undefined,
      sleepRem: form.sleepRem ? parseFloat(form.sleepRem) : undefined,
      sleepLight: form.sleepLight ? parseFloat(form.sleepLight) : undefined,
      caloriesBurned: form.caloriesBurned ? parseInt(form.caloriesBurned) : undefined,
      vo2max: form.vo2max ? parseFloat(form.vo2max) : undefined,
      distanceKm: form.distanceKm ? parseFloat(form.distanceKm) : undefined,
      source: form.source,
    }
    if (editItem?.id) await db.healthDaily.update(editItem.id, data)
    else await db.healthDaily.add(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'บันทึก'}กิจกรรม</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[
            ['น้ำหนัก (กก.)', 'weightKg', '60'],
            ['ก้าว', 'steps', '8000'],
            ['นอนรวม (ชม.)', 'sleepTotal', '7.5'],
            ['Deep sleep (ชม.)', 'sleepDeep', '1.5'],
            ['REM (ชม.)', 'sleepRem', '1.5'],
            ['Light (ชม.)', 'sleepLight', '4.5'],
            ['เผาผลาญ (cal)', 'caloriesBurned', '400'],
            ['VO₂max', 'vo2max', '42'],
            ['ระยะทาง (กม.)', 'distanceKm', '5'],
          ].map(([label, key, ph]) => (
            <div key={key}>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
              <input type="number" placeholder={ph} value={(form as any)[key]}
                onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            </div>
          ))}
        </div>
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">แหล่งข้อมูล</div>
          <select value={form.source} onChange={e => setForm(v => ({ ...v, source: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full">
            <option value="manual">กรอกเอง</option>
            <option value="apple_health">Apple Health</option>
            <option value="whoop">WHOOP</option>
            <option value="fitbit">Fitbit</option>
          </select>
        </div>
        <Button onClick={save}>
          {editItem ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}

// ── Medication / Supplement Tab ────────────────────────────────────────────
function MedsTab({ onEdit }: { onEdit: (m: Medication) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const allMeds = useLiveQuery(() => db.medications.orderBy('name').toArray())
  const todayLogs = useLiveQuery(() => db.medicationLogs.where('date').equals(today).toArray())

  const TYPE_LABEL: Record<string, string> = { medication: '💊 ยา', supplement: '🧴 อาหารเสริม', vitamin: '🔬 วิตามิน' }
  const FREQ_LABEL: Record<string, string> = { daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์', monthly: 'ทุกเดือน', as_needed: 'เมื่อจำเป็น' }

  async function toggleLog(medId: number, taken: boolean) {
    const existing = (todayLogs ?? []).find(l => l.medicationId === medId)
    if (existing) {
      await db.medicationLogs.update(existing.id!, { taken })
    } else {
      await db.medicationLogs.add({ medicationId: medId, date: today, taken })
    }
  }

  async function deleteMed(id: number) {
    if (!confirm('ลบรายการยา/อาหารเสริมนี้?\nไม่สามารถกู้คืนได้')) return
    await db.medications.delete(id)
    await db.medicationLogs.where('medicationId').equals(id).delete()
  }

  const active = (allMeds ?? []).filter(m => m.active)
  const inactive = (allMeds ?? []).filter(m => !m.active)
  const dailyMeds = active.filter(m => m.frequency === 'daily')
  const todayChecked = dailyMeds.filter(m => todayLogs?.find(l => l.medicationId === m.id && l.taken)).length

  const byType = active.reduce((acc, m) => {
    acc[m.type] = [...(acc[m.type] ?? []), m]
    return acc
  }, {} as Record<string, Medication[]>)

  return (
    <div className="p-4 space-y-4">
      {/* Daily check-in */}
      {dailyMeds.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>✅ เช็คอินวันนี้</CardTitle>
            <span className="text-[12px] font-bold text-indigo-600">{todayChecked}/{dailyMeds.length} รายการ</span>
          </div>
          <div className="space-y-2">
            {dailyMeds.map(m => {
              const log = todayLogs?.find(l => l.medicationId === m.id)
              const taken = log?.taken ?? false
              return (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <button
                    onClick={() => toggleLog(m.id!, !taken)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${taken ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}
                  >
                    {taken && '✓'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[14px] font-semibold ${taken ? 'line-through text-gray-400' : 'text-gray-800'}`}>{m.name}</div>
                    <div className="text-[11px] text-gray-400">{m.dose}{m.timeOfDay ? ` · ${m.timeOfDay}` : ''}</div>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{TYPE_LABEL[m.type]}</span>
                </div>
              )
            })}
          </div>
          {todayChecked === dailyMeds.length && dailyMeds.length > 0 && (
            <div className="mt-3 text-center text-[13px] font-bold text-green-600">🎉 ครบทุกรายการวันนี้!</div>
          )}
        </Card>
      )}

      {/* Active meds by type */}
      {(['medication', 'supplement', 'vitamin'] as const).map(type => {
        const meds = byType[type]
        if (!meds?.length) return null
        return (
          <Card key={type}>
            <CardTitle>{TYPE_LABEL[type]} ({meds.length})</CardTitle>
            <div className="space-y-2 mt-2">
              {meds.map(m => (
                <div key={m.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-gray-800">{m.name}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{FREQ_LABEL[m.frequency]}</span>
                    </div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                      {m.dose}{m.timeOfDay ? ` · ${m.timeOfDay}` : ''}{m.purpose ? ` — ${m.purpose}` : ''}
                    </div>
                    {m.prescribedBy && <div className="text-[11px] text-gray-400">สั่งโดย: {m.prescribedBy}</div>}
                    {m.startDate && <div className="text-[11px] text-gray-400">เริ่ม {m.startDate}{m.endDate ? ` ถึง ${m.endDate}` : ''}</div>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 mt-0.5">
                    <button onClick={() => onEdit(m)} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg active:scale-95">แก้ไข</button>
                    <button onClick={() => deleteMed(m.id!)} className="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded-lg active:scale-95">ลบ</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })}

      {active.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">💊</div>
          <div className="font-medium">ยังไม่มีรายการยา/วิตามิน</div>
          <div className="text-[13px] mt-1">กด + เพิ่ม เพื่อเพิ่มรายการ</div>
        </div>
      )}

      {/* Inactive/stopped */}
      {inactive.length > 0 && (
        <Card>
          <CardTitle>🗄️ หยุดใช้แล้ว ({inactive.length})</CardTitle>
          <div className="space-y-1 mt-2">
            {inactive.map(m => (
              <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-[13px] text-gray-400 flex-1 line-through">{m.name} — {m.dose}</span>
                <button onClick={() => onEdit(m)} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">แก้ไข</button>
                <button onClick={() => deleteMed(m.id!)} className="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded-lg">ลบ</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Medication Form ────────────────────────────────────────────────────────
function MedicationForm({ editItem, onClose }: { editItem: Medication | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editItem?.name ?? '',
    type: (editItem?.type ?? 'supplement') as 'medication' | 'supplement' | 'vitamin',
    dose: editItem?.dose ?? '',
    frequency: (editItem?.frequency ?? 'daily') as 'daily' | 'weekly' | 'monthly' | 'as_needed',
    timeOfDay: editItem?.timeOfDay ?? '',
    prescribedBy: editItem?.prescribedBy ?? '',
    startDate: editItem?.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: editItem?.endDate ?? '',
    active: editItem?.active ?? true,
    purpose: editItem?.purpose ?? '',
    notes: editItem?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function saveMed() {
    if (!form.name.trim() || !form.dose.trim()) { alert('กรุณากรอกชื่อและขนาดยา'); return }
    setSaving(true)
    try {
      const record: Omit<Medication, 'id'> = {
        name: form.name.trim(),
        type: form.type,
        dose: form.dose.trim(),
        frequency: form.frequency,
        timeOfDay: form.timeOfDay || undefined,
        prescribedBy: form.prescribedBy || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        active: form.active,
        purpose: form.purpose || undefined,
        notes: form.notes || undefined,
      }
      if (editItem?.id) {
        await db.medications.update(editItem.id, record)
      } else {
        await db.medications.add(record)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto space-y-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-gray-900">{editItem ? 'แก้ไขรายการ' : 'เพิ่มยา/วิตามิน'}</h2>
          <CloseButton onClick={onClose} />
        </div>

        {/* Type */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ประเภท</div>
          <div className="flex gap-2">
            {([['medication', '💊 ยา'], ['supplement', '🧴 อาหารเสริม'], ['vitamin', '🔬 วิตามิน']] as const).map(([v, l]) => (
              <button key={v} onClick={() => set('type', v)}
                className={`flex-1 py-2 text-[13px] font-semibold rounded-xl border-2 transition-colors ${form.type === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ชื่อยา / วิตามิน *</div>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="เช่น Vitamin D3 5000 IU, Magnesium Glycinate 400mg"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        {/* Dose */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ขนาด/ปริมาณ *</div>
          <input value={form.dose} onChange={e => set('dose', e.target.value)}
            placeholder="เช่น 1 เม็ด, 2 capsules, 10 mg"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        {/* Frequency & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">ความถี่</div>
            <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-full">
              <option value="daily">ทุกวัน</option>
              <option value="weekly">ทุกสัปดาห์</option>
              <option value="monthly">ทุกเดือน</option>
              <option value="as_needed">เมื่อจำเป็น</option>
            </select>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">เวลา</div>
            <input value={form.timeOfDay} onChange={e => set('timeOfDay', e.target.value)}
              placeholder="เช้า / เย็น / ก่อนนอน"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-full" />
          </div>
        </div>

        {/* Purpose */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">วัตถุประสงค์</div>
          <input value={form.purpose} onChange={e => set('purpose', e.target.value)}
            placeholder="เช่น เสริมภูมิคุ้มกัน, ลด inflammation, นอนหลับดีขึ้น"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        {/* Prescribed by */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">สั่งโดย (แพทย์/ตัวเอง)</div>
          <input value={form.prescribedBy} onChange={e => set('prescribedBy', e.target.value)}
            placeholder="นพ.สมชาย / ตัวเอง"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">วันที่เริ่ม</div>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-full" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">วันที่หยุด (ถ้ามี)</div>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-full" />
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <button onClick={() => set('active', !form.active)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-[14px] font-medium text-gray-700">{form.active ? 'กำลังใช้งานอยู่' : 'หยุดใช้แล้ว'}</span>
        </div>

        {/* Notes */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">หมายเหตุ</div>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="ข้อมูลเพิ่มเติม..."
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full resize-none" />
        </div>

        <Button onClick={saveMed} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : editItem ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
        </Button>
      </div>
    </div>
  )
}
