import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, StatusTag, ProgressBar } from '../components/Card'
import { HEALTH_NORMS, STATUS_COLOR, getRecommendedCheckups } from '../utils/healthNorms'
import { getAgeDetail, calcBiologicalAge } from '../utils/calculations'

type Tab = 'summary' | 'records' | 'daily'

export default function Health() {
  const [tab, setTab] = useState<Tab>('summary')
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showDailyForm, setShowDailyForm] = useState(false)

  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const latestRecord = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const allRecords = useLiveQuery(() => db.healthRecords.orderBy('date').reverse().toArray())
  const allDaily = useLiveQuery(() => db.healthDaily.orderBy('date').reverse().toArray())

  const age = profile ? getAgeDetail(profile.dob).years : 35
  const checkups = getRecommendedCheckups(age)

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

  // Health score
  const healthScore = (() => {
    if (!latestRecord) return null
    let score = 100
    const metrics = [
      { key: 'systolic', val: latestRecord.systolic },
      { key: 'glucose', val: latestRecord.glucose },
      { key: 'ldl', val: latestRecord.ldl },
      { key: 'hdl', val: latestRecord.hdl },
    ]
    metrics.forEach(({ key, val }) => {
      if (val === undefined) return
      const norm = HEALTH_NORMS[key]
      const status = norm.evaluate(val)
      if (status === 'warning') score -= 10
      if (status === 'high') score -= 20
      if (status === 'optimal') score += 5
    })
    return Math.min(Math.max(score, 0), 100)
  })()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="สุขภาพ" rightAction={{ label: '＋ เพิ่ม', onClick: () => tab === 'daily' ? setShowDailyForm(true) : setShowRecordForm(true) }} />

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        {([['summary', 'ภาพรวม'], ['records', 'ผลตรวจ'], ['daily', 'กิจกรรม']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'summary' && (
          <SummaryTab age={age} bioAge={bioAge} healthScore={healthScore} latestRecord={latestRecord} latestDaily={latestDaily} checkups={checkups} profile={profile} />
        )}
        {tab === 'records' && (
          <RecordsTab records={allRecords ?? []} />
        )}
        {tab === 'daily' && (
          <DailyTab daily={allDaily ?? []} />
        )}
      </div>

      {showRecordForm && <HealthRecordForm onClose={() => setShowRecordForm(false)} />}
      {showDailyForm && <HealthDailyForm onClose={() => setShowDailyForm(false)} />}
    </div>
  )
}

function SummaryTab({ age, bioAge, healthScore, latestRecord, latestDaily, checkups, profile }: any) {
  const bmi = profile && latestDaily?.weightKg ? latestDaily.weightKg / Math.pow(profile.heightCm / 100, 2) : null

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

      {/* Health Score */}
      {healthScore !== null && (
        <div className="mx-4 mt-3">
          <Card>
            <CardTitle>คะแนนสุขภาพรวม</CardTitle>
            <div className="flex items-center gap-3 mt-1">
              <div className="text-4xl font-bold text-gray-900">{healthScore}</div>
              <div className="flex-1">
                <ProgressBar value={healthScore} max={100}
                  color={healthScore >= 80 ? 'bg-green-500' : healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500'} />
                <div className="text-xs text-gray-400 mt-1">
                  {healthScore >= 80 ? 'สุขภาพดีมาก' : healthScore >= 60 ? 'ปานกลาง ควรปรับปรุง' : 'ต้องดูแลเร่งด่วน'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Weight/BMI */}
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
          </Card>
        </div>
      )}

      {/* Latest metrics */}
      {latestRecord && (
        <>
          <SectionLabel>ผลตรวจล่าสุด — {latestRecord.date}</SectionLabel>
          <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm">
            {(Object.keys(HEALTH_NORMS) as string[]).map((key, idx, arr) => {
              const val = (latestRecord as any)[key]
              if (val === undefined || val === null) return null
              const norm = HEALTH_NORMS[key]
              const status = norm.evaluate(val)
              const col = STATUS_COLOR[status]
              return (
                <div key={key} className={`flex items-center justify-between px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900">{norm.label}</div>
                    <div className="text-[11px] text-gray-400">ปกติ {norm.normal} | Optimal {norm.optimal} {norm.unit}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[15px] font-bold ${col.text}`}>{val} <span className="text-xs font-normal text-gray-400">{norm.unit}</span></div>
                    <StatusTag status={status} label={col.label} />
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

function RecordsTab({ records }: { records: any[] }) {
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
          <div className="text-[13px] font-semibold text-indigo-600 mb-2">{r.date}</div>
          <div className="grid grid-cols-2 gap-y-1.5">
            {r.systolic && <div className="text-[13px]">ความดัน: <b>{r.systolic}/{r.diastolic}</b></div>}
            {r.glucose && <div className="text-[13px]">น้ำตาล: <b>{r.glucose}</b></div>}
            {r.ldl && <div className="text-[13px]">LDL: <b>{r.ldl}</b></div>}
            {r.hdl && <div className="text-[13px]">HDL: <b>{r.hdl}</b></div>}
            {r.heartRate && <div className="text-[13px]">หัวใจ: <b>{r.heartRate} bpm</b></div>}
            {r.hba1c && <div className="text-[13px]">HbA1c: <b>{r.hba1c}%</b></div>}
          </div>
        </Card>
      ))}
    </div>
  )
}

function DailyTab({ daily }: { daily: any[] }) {
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
            {d.source && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{d.source}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '⚖️', label: 'น้ำหนัก', val: d.weightKg ? `${d.weightKg} กก.` : null },
              { icon: '👣', label: 'ก้าว', val: d.steps?.toLocaleString() },
              { icon: '😴', label: 'นอน', val: d.sleepTotal ? `${d.sleepTotal} ชม.` : null },
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

function HealthRecordForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    systolic: '', diastolic: '', heartRate: '', glucose: '',
    ldl: '', hdl: '', triglycerides: '', hba1c: '', notes: '',
  })

  async function save() {
    await db.healthRecords.add({
      date: form.date,
      systolic: form.systolic ? parseFloat(form.systolic) : undefined,
      diastolic: form.diastolic ? parseFloat(form.diastolic) : undefined,
      heartRate: form.heartRate ? parseFloat(form.heartRate) : undefined,
      glucose: form.glucose ? parseFloat(form.glucose) : undefined,
      ldl: form.ldl ? parseFloat(form.ldl) : undefined,
      hdl: form.hdl ? parseFloat(form.hdl) : undefined,
      triglycerides: form.triglycerides ? parseFloat(form.triglycerides) : undefined,
      hba1c: form.hba1c ? parseFloat(form.hba1c) : undefined,
      notes: form.notes || undefined,
    })
    onClose()
  }

  const f = (label: string, key: keyof typeof form, placeholder = '') => (
    <div>
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
      <input type="number" placeholder={placeholder} value={form[key] as string}
        onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">บันทึกผลตรวจ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        <div className="grid grid-cols-2 gap-3">
          {f('ความดัน (บน)', 'systolic', '120')}
          {f('ความดัน (ล่าง)', 'diastolic', '80')}
          {f('หัวใจ (bpm)', 'heartRate', '72')}
          {f('น้ำตาล (mg/dL)', 'glucose', '95')}
          {f('LDL (mg/dL)', 'ldl', '100')}
          {f('HDL (mg/dL)', 'hdl', '55')}
          {f('Triglycerides', 'triglycerides', '120')}
          {f('HbA1c (%)', 'hba1c', '5.5')}
        </div>
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}

function HealthDailyForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weightKg: '', steps: '', sleepTotal: '', sleepDeep: '', sleepRem: '', sleepLight: '',
    waterMl: '', caloriesBurned: '', vo2max: '', source: 'manual',
  })

  async function save() {
    await db.healthDaily.add({
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
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">บันทึกกิจกรรม</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[
            ['น้ำหนัก (กก.)', 'weightKg', '68'],
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
          บันทึก
        </button>
      </div>
    </div>
  )
}
