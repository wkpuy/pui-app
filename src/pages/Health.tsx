import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { HealthRecord, HealthDaily } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, StatusTag } from '../components/Card'
import { getAgeDetail, calcBiologicalAge } from '../utils/calculations'

// ── Biomarker definitions ──────────────────────────────────────────────────
interface BiomarkerDef {
  label: string
  unit: string
  normal: string
  optimal: string
  evaluate: (v: number) => 'optimal' | 'good' | 'warning' | 'high'
  longevity?: boolean    // show in longevity panel
  femaleNote?: string
}

const BIOMARKERS: Record<string, BiomarkerDef> = {
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
  // Liver
  alt:             { label: 'ALT', unit: 'U/L', normal: '<40', optimal: '<25', evaluate: v => v < 25 ? 'optimal' : v < 40 ? 'good' : 'high' },
  ast:             { label: 'AST', unit: 'U/L', normal: '<40', optimal: '<25', evaluate: v => v < 25 ? 'optimal' : v < 40 ? 'good' : 'high' },
  ggt:             { label: 'GGT', unit: 'U/L', normal: '<45', optimal: '<25', evaluate: v => v < 25 ? 'optimal' : v < 45 ? 'good' : 'high' },
  // Kidney
  creatinine:      { label: 'ครีเอตินิน', unit: 'mg/dL', normal: '0.5-1.1', optimal: '0.6-1.0', evaluate: v => (v >= 0.6 && v <= 1.0) ? 'optimal' : (v >= 0.5 && v <= 1.1) ? 'good' : 'warning', femaleNote: 'ผู้หญิง 0.5-1.1' },
  egfr:            { label: 'eGFR', unit: 'mL/min', normal: '>60', optimal: '>90', evaluate: v => v >= 90 ? 'optimal' : v >= 60 ? 'good' : v >= 30 ? 'warning' : 'high' },
  uricAcid:        { label: 'กรดยูริก', unit: 'mg/dL', normal: '<6.5', optimal: '<5.5', evaluate: v => v < 5.5 ? 'optimal' : v < 6.5 ? 'good' : 'high', femaleNote: 'ผู้หญิง <6.0' },
  // Thyroid
  // Vitamins
  vitaminD:        { label: 'Vitamin D', unit: 'ng/mL', normal: '>30', optimal: '50-80', evaluate: v => (v >= 50 && v <= 80) ? 'optimal' : v >= 30 ? 'good' : v >= 20 ? 'warning' : 'high', longevity: true },
  vitaminB12:      { label: 'Vitamin B12', unit: 'pg/mL', normal: '200-900', optimal: '400-800', evaluate: v => (v >= 400 && v <= 800) ? 'optimal' : (v >= 200 && v <= 900) ? 'good' : 'warning' },
  vitaminB6:       { label: 'Vitamin B6', unit: 'ng/mL', normal: '>5', optimal: '20-100', evaluate: v => (v >= 20 && v <= 100) ? 'optimal' : v >= 5 ? 'good' : 'warning' },
  magnesium:       { label: 'Magnesium', unit: 'mg/dL', normal: '1.7-2.2', optimal: '2.0-2.2', evaluate: v => (v >= 2.0 && v <= 2.2) ? 'optimal' : (v >= 1.7 && v <= 2.2) ? 'good' : 'warning', longevity: true },
  // CBC
  hemoglobin:      { label: 'Hemoglobin', unit: 'g/dL', normal: '12-16', optimal: '13-15', evaluate: v => (v >= 13 && v <= 15) ? 'optimal' : (v >= 12 && v <= 16) ? 'good' : 'warning', femaleNote: 'ผู้หญิง 12-16' },
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

function getCheckups(age: number): string[] {
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

type MainTab = 'summary' | 'records' | 'daily' | 'longevity'

const LONGEVITY_KEYS = Object.entries(BIOMARKERS)
  .filter(([, def]) => def.longevity)
  .map(([key]) => key)

export default function Health() {
  const [tab, setTab] = useState<MainTab>('summary')
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showDailyForm, setShowDailyForm] = useState(false)
  const [editRecord, setEditRecord] = useState<HealthRecord | null>(null)
  const [editDaily, setEditDaily] = useState<HealthDaily | null>(null)

  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const latestRecord = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
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
        rightAction={{
          label: '＋ เพิ่ม',
          onClick: () => tab === 'daily' ? openAddDaily() : openAddRecord(),
        }}
      />

      <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {([['summary', 'ภาพรวม'], ['longevity', 'Longevity'], ['records', 'ผลตรวจ'], ['daily', 'กิจกรรม']] as [MainTab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'summary' && (
          <SummaryTab age={age} bioAge={bioAge} latestRecord={latestRecord} latestDaily={latestDaily} checkups={checkups} profile={profile} />
        )}
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
      </div>

      {showRecordForm && (
        <HealthRecordForm editItem={editRecord} onClose={() => { setShowRecordForm(false); setEditRecord(null) }} />
      )}
      {showDailyForm && (
        <HealthDailyForm editItem={editDaily} onClose={() => { setShowDailyForm(false); setEditDaily(null) }} />
      )}
    </div>
  )
}

function SummaryTab({ age, bioAge, latestRecord, latestDaily, checkups, profile }: any) {
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
                {checkups.map((c: string) => (
                  <div key={c} className="flex items-center gap-2 text-[13px] text-amber-800">
                    <span>📋</span><span>{c}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      <div className="h-4" />
    </>
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
              <button onClick={() => onEdit(r)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
              <button onClick={() => { if (confirm('ลบผลตรวจนี้?')) db.healthRecords.delete(r.id!) }}
                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
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
              <button onClick={() => onEdit(d)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
              <button onClick={() => { if (confirm('ลบ?')) db.healthDaily.delete(d.id!) }}
                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '⚖️', label: 'น้ำหนัก', val: d.weightKg ? `${d.weightKg} กก.` : null },
              { icon: '👣', label: 'ก้าว', val: d.steps?.toLocaleString() },
              { icon: '😴', label: 'นอนรวม', val: d.sleepTotal ? `${d.sleepTotal} ชม.` : null },
              { icon: '🌊', label: 'Deep', val: d.sleepDeep ? `${d.sleepDeep} ชม.` : null },
              { icon: '💫', label: 'REM', val: d.sleepRem ? `${d.sleepRem} ชม.` : null },
              { icon: '💧', label: 'น้ำ', val: d.waterMl ? `${(d.waterMl / 1000).toFixed(1)} L` : null },
              { icon: '🔥', label: 'เผาผลาญ', val: d.caloriesBurned?.toString() },
              { icon: '🫀', label: 'VO₂max', val: d.vo2max?.toFixed(1) },
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
        'alt','ast','ggt','creatinine','egfr','uricAcid','tsh',
        'vitaminD','vitaminB12','vitaminB6','magnesium','hemoglobin',
        'bodyFatPct','muscleMassKg','waistCm',
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
      hsCrp: num('hsCrp'), alt: num('alt'), ast: num('ast'), ggt: num('ggt'),
      creatinine: num('creatinine'), egfr: num('egfr'), uricAcid: num('uricAcid'), tsh: num('tsh'),
      vitaminD: num('vitaminD'), vitaminB12: num('vitaminB12'), vitaminB6: num('vitaminB6'), magnesium: num('magnesium'),
      hemoglobin: num('hemoglobin'),
      bodyFatPct: num('bodyFatPct'), muscleMassKg: num('muscleMassKg'), waistCm: num('waistCm'),
      weightKg: num('weightKg'),
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
            <F label="ApoB (mg/dL)" k="apoB" ph="80" />
            <F label="Lp(a) (mg/dL)" k="lpA" ph="15" />
            <F label="hs-CRP (mg/L)" k="hsCrp" ph="0.5" />
            <F label="Fasting Insulin" k="fastingInsulin" ph="5" />
            <F label="ALT (U/L)" k="alt" ph="25" />
            <F label="AST (U/L)" k="ast" ph="25" />
            <F label="GGT (U/L)" k="ggt" ph="20" />
            <F label="eGFR" k="egfr" ph="90" />
            <F label="กรดยูริก" k="uricAcid" ph="5" />
            <F label="TSH (mIU/L)" k="tsh" ph="1.5" />
            <F label="Vitamin D (ng/mL)" k="vitaminD" ph="60" />
            <F label="Vitamin B12 (pg/mL)" k="vitaminB12" ph="500" />
            <F label="Vitamin B6 (ng/mL)" k="vitaminB6" ph="30" />
            <F label="Magnesium (mg/dL)" k="magnesium" ph="2.1" />
            <F label="Hemoglobin (g/dL)" k="hemoglobin" ph="13.5" />
          </div>
        )}
        {section === 'body' && (
          <div className="grid grid-cols-2 gap-3">
            <F label="น้ำหนัก (กก.)" k="weightKg" ph="60" />
            <F label="ไขมันร่างกาย (%)" k="bodyFatPct" ph="22" />
            <F label="มวลกล้ามเนื้อ (กก.)" k="muscleMassKg" ph="40" />
            <F label="รอบเอว (ซม.)" k="waistCm" ph="70" />
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

        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          {editItem ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
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
    waterMl: editItem?.waterMl?.toString() ?? '',
    caloriesBurned: editItem?.caloriesBurned?.toString() ?? '',
    vo2max: editItem?.vo2max?.toString() ?? '',
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
      waterMl: form.waterMl ? parseInt(form.waterMl) : undefined,
      caloriesBurned: form.caloriesBurned ? parseInt(form.caloriesBurned) : undefined,
      vo2max: form.vo2max ? parseFloat(form.vo2max) : undefined,
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
            ['น้ำ (mL)', 'waterMl', '2000'],
            ['เผาผลาญ (cal)', 'caloriesBurned', '400'],
            ['VO₂max', 'vo2max', '42'],
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
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          {editItem ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
