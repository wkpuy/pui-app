import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { TaxRecord } from '../db'
import { Card } from '../components/Card'
import { formatCurrency } from '../utils/calculations'
import { calcThaiTax, suggestUnusedAllowances, simulateTaxSaving, emptyTaxRecord, TAX_BRACKETS } from '../utils/thaiTax'

const TH_YEAR_OFFSET = 543

export default function Tax() {
  const navigate = useNavigate()
  const currentBE = new Date().getFullYear() + TH_YEAR_OFFSET
  const [year, setYear] = useState(currentBE)
  const [tab, setTab] = useState<'summary' | 'income' | 'deductions' | 'simulator'>('summary')

  const records = useLiveQuery(() => db.taxRecords.orderBy('year').toArray())
  const salaryRecords = useLiveQuery(() => db.salaryRecords.orderBy('year').toArray())
  const current = records?.find(r => r.year === year)

  // Auto-create record for this year if missing, with salary auto-populated
  useEffect(() => {
    if (!records) return
    if (current) return
    // populate from salary record of same year (Christian year)
    const ceYear = year - TH_YEAR_OFFSET
    const salRec = salaryRecords?.find(s => s.year === ceYear)
    const empty = emptyTaxRecord(year)
    if (salRec) {
      empty.totalIncome = salRec.baseSalary * 12
      empty.bonus = salRec.bonus
      empty.pvdContribution = salRec.baseSalary * 12 * (salRec.pvdEmployeeRate / 100)
    }
    db.taxRecords.add(empty)
  }, [records, current, year, salaryRecords])

  if (!current) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">กำลังโหลด...</div>
    )
  }

  const breakdown = calcThaiTax(current)
  const suggestions = suggestUnusedAllowances(current)

  const yearOptions: number[] = []
  for (let y = currentBE - 3; y <= currentBE + 1; y++) yearOptions.push(y)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">‹</button>
        <div className="flex-1 text-[17px] font-bold text-gray-900">วางแผนภาษี</div>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))}
          className="text-[13px] font-semibold border border-gray-200 rounded-xl px-3 py-1.5 bg-white">
          {yearOptions.map(y => <option key={y} value={y}>ปีภาษี {y}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        {([['summary', 'สรุป'], ['income', 'รายได้'], ['deductions', 'ลดหย่อน'], ['simulator', 'จำลอง']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-3 text-[13px] font-semibold border-b-2 ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'summary' && <SummaryTab record={current} breakdown={breakdown} suggestions={suggestions} onSwitch={setTab} />}
        {tab === 'income' && <IncomeTab record={current} />}
        {tab === 'deductions' && <DeductionsTab record={current} />}
        {tab === 'simulator' && <SimulatorTab record={current} />}
      </div>
    </div>
  )
}

// ── Summary Tab ────────────────────────────────────────────────────────────
function SummaryTab({ record, breakdown, suggestions, onSwitch }: {
  record: TaxRecord; breakdown: ReturnType<typeof calcThaiTax>; suggestions: ReturnType<typeof suggestUnusedAllowances>; onSwitch: (t: 'summary' | 'income' | 'deductions' | 'simulator') => void
}) {
  return (
    <div className="px-4 py-4 space-y-3">
      {/* Hero */}
      <div className={`rounded-2xl p-5 text-white ${breakdown.netTaxPayable > 0 ? 'bg-gradient-to-br from-orange-500 to-red-600' : 'bg-gradient-to-br from-green-500 to-emerald-600'}`}>
        <div className="text-xs opacity-75 mb-1">{breakdown.netTaxPayable >= 0 ? 'ภาษีที่ต้องจ่ายเพิ่ม' : 'ภาษีที่ขอคืนได้'}</div>
        <div className="text-3xl font-bold">{formatCurrency(Math.abs(breakdown.netTaxPayable), 0)}</div>
        <div className="text-xs opacity-75 mt-1">
          ภาษีรวม {formatCurrency(breakdown.taxOwed, 0)} − หัก ณ ที่จ่าย {formatCurrency(breakdown.withholding, 0)}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/15 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-75">รายได้รวม</div>
            <div className="text-[13px] font-bold">{formatCurrency(breakdown.grossIncome, 0)}</div>
          </div>
          <div className="bg-white/15 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-75">เงินได้สุทธิ</div>
            <div className="text-[13px] font-bold">{formatCurrency(breakdown.netIncome, 0)}</div>
          </div>
          <div className="bg-white/15 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-75">Marginal Rate</div>
            <div className="text-[13px] font-bold">{(breakdown.marginal * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>💡 ลดหย่อนที่ยังไม่ใช้เต็ม</CardTitle>
            <button onClick={() => onSwitch('simulator')} className="text-[11px] text-indigo-600 font-semibold">จำลอง →</button>
          </div>
          {suggestions.slice(0, 5).map(s => {
            // ประมาณภาษีที่จะประหยัด ถ้าซื้อเต็มเพดาน
            const sim = simulateTaxSaving(record, s.field as keyof TaxRecord, s.unused)
            return (
              <div key={s.name} className="flex justify-between items-center py-1.5 text-[13px] border-b border-gray-50 last:border-0">
                <div>
                  <div className="font-semibold text-gray-700">{s.name}</div>
                  <div className="text-[11px] text-gray-400">เหลือใช้ {formatCurrency(s.unused, 0)} (เพดาน {formatCurrency(s.cap, 0)})</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-green-600">ประหยัด {formatCurrency(sim.saving, 0)}</div>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* Breakdown */}
      <Card>
        <CardTitle>วิธีคำนวณ</CardTitle>
        <div className="space-y-1.5 text-[13px] mt-2">
          <Row label="รายได้รวม" value={breakdown.grossIncome} />
          <Row label="หัก ค่าใช้จ่าย 50% (เพดาน 100k)" value={-breakdown.expenseAllowance} negative />
          <Row label="หัก ค่าลดหย่อน" value={-breakdown.totalDeductions} negative />
          <div className="border-t pt-1.5 mt-1.5">
            <Row label="เงินได้สุทธิ (ฐานภาษี)" value={breakdown.netIncome} bold />
          </div>
          <Row label="ภาษีตามขั้น" value={breakdown.taxOwed} bold />
          <Row label="หัก ณ ที่จ่ายแล้ว" value={-breakdown.withholding} negative />
          <div className="border-t pt-1.5 mt-1.5">
            <Row
              label={breakdown.netTaxPayable >= 0 ? 'จ่ายเพิ่ม' : 'ขอคืนภาษี'}
              value={Math.abs(breakdown.netTaxPayable)}
              bold
              color={breakdown.netTaxPayable >= 0 ? 'text-red-500' : 'text-green-600'}
            />
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            อัตราเฉลี่ย {(breakdown.effective * 100).toFixed(2)}% · Marginal {(breakdown.marginal * 100).toFixed(0)}%
          </div>
        </div>
      </Card>

      {/* Deduction details */}
      <Card>
        <CardTitle>รายการลดหย่อน</CardTitle>
        <div className="mt-2 space-y-1 text-[12px]">
          {Object.entries(breakdown.deductionDetails)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-600">{k}</span>
                <span className="font-semibold text-gray-900">{formatCurrency(v, 0)}</span>
              </div>
            ))}
          <div className="flex justify-between pt-2 mt-2 border-t font-bold">
            <span className="text-gray-700">รวม</span>
            <span className="text-indigo-600">{formatCurrency(breakdown.totalDeductions, 0)}</span>
          </div>
        </div>
      </Card>

      {/* Tax brackets reference */}
      <Card>
        <CardTitle>อัตราภาษีบุคคลธรรมดา (ไทย)</CardTitle>
        <div className="mt-2 text-[12px] space-y-0.5">
          {TAX_BRACKETS.map((b, i) => {
            const isCurrent = breakdown.netIncome > b.min && breakdown.netIncome <= b.max
            return (
              <div key={i} className={`flex justify-between py-1 ${isCurrent ? 'bg-indigo-50 -mx-2 px-2 rounded font-bold text-indigo-700' : ''}`}>
                <span>
                  {b.min === 0 ? '0' : formatCurrency(b.min, 0)}
                  {b.max === Infinity ? '+' : ` - ${formatCurrency(b.max, 0)}`}
                </span>
                <span>{(b.rate * 100).toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ── Income Tab ─────────────────────────────────────────────────────────────
function IncomeTab({ record }: { record: TaxRecord }) {
  return (
    <div className="px-4 py-4 space-y-3">
      <Card>
        <CardTitle>รายได้</CardTitle>
        <div className="text-[11px] text-gray-400 mt-1 mb-3">
          ดึงอัตโนมัติจากหน้าเงินเดือน · แก้ได้
        </div>
        <NumField record={record} field="totalIncome" label="เงินเดือนรวมทั้งปี" help="40(1) เงินได้จากการจ้างงาน" />
        <NumField record={record} field="bonus" label="โบนัส" help="โบนัสประจำปี / เงินพิเศษ" />
        <NumField record={record} field="otherIncome" label="รายได้อื่น" help="Freelance, ปันผล, ดอกเบี้ย" />
        <NumField record={record} field="withholdingTax" label="ภาษีหัก ณ ที่จ่าย" help="ที่ถูกหักไปแล้วจากเงินเดือน" />
      </Card>
    </div>
  )
}

// ── Deductions Tab ─────────────────────────────────────────────────────────
function DeductionsTab({ record }: { record: TaxRecord }) {
  return (
    <div className="px-4 py-4 space-y-3 pb-8">
      <Card>
        <CardTitle>👨‍👩‍👧 ครอบครัว</CardTitle>
        <div className="text-[11px] text-gray-400 mt-1 mb-2">ส่วนตัว 60,000 (auto)</div>
        <NumField record={record} field="spouseAllowance" label="คู่สมรส (60,000)" help="0 หรือ 60,000" />
        <NumField record={record} field="childrenCount" label="จำนวนบุตร" help="คนแรก 30k, คนที่ 2+ เกิดก่อน 2561 30k" intOnly />
        <NumField record={record} field="childrenAfter2561" label="บุตร (เกิดตั้งแต่ 2561, ตั้งแต่คนที่ 2)" help="60,000/คน" intOnly />
        <NumField record={record} field="parentsCount" label="อุปการะบิดามารดา (60+, รายได้<30k)" help="30,000/คน max 4" intOnly />
      </Card>

      <Card>
        <CardTitle>🛡️ ประกัน</CardTitle>
        <NumField record={record} field="lifeInsurance" label="ประกันชีวิต" help="≤ 100,000 (รวมประกันสุขภาพ)" />
        <NumField record={record} field="healthInsurance" label="ประกันสุขภาพตน" help="≤ 25,000 (รวมประกันชีวิต ≤ 100,000)" />
        <NumField record={record} field="parentsHealthInsurance" label="ประกันสุขภาพบิดามารดา" help="≤ 15,000" />
        <NumField record={record} field="pensionInsurance" label="ประกันชีวิตแบบบำนาญ" help="≤ 200,000 หรือ 15% รายได้" />
        <NumField record={record} field="socialSecurity" label="ประกันสังคม" help="≤ 9,000 (750 × 12)" />
      </Card>

      <Card>
        <CardTitle>📈 กองทุนเพื่อการลงทุน</CardTitle>
        <div className="text-[11px] text-amber-600 mt-1 mb-2">⚠️ PVD + บำนาญ + RMF + SSF รวมไม่เกิน 500,000</div>
        <NumField record={record} field="pvdContribution" label="PVD (พนักงานจ่าย)" help="≤ 500k หรือ 15% รายได้" />
        <NumField record={record} field="rmf" label="RMF" help="≤ 500k หรือ 30% รายได้" />
        <NumField record={record} field="ssf" label="SSF" help="≤ 200k หรือ 30% รายได้" />
        <NumField record={record} field="thaiEsg" label="Thai ESG Fund" help="≤ 300k หรือ 30% รายได้ (cap แยก)" />
      </Card>

      <Card>
        <CardTitle>💰 อื่นๆ</CardTitle>
        <NumField record={record} field="mortgageInterest" label="ดอกเบี้ยกู้ที่อยู่อาศัย" help="≤ 100,000" />
        <NumField record={record} field="easyEReceipt" label="Easy E-Receipt / ช้อปดีมีคืน" help="≤ 50,000 (ปี 2567)" />
        <NumField record={record} field="donation" label="เงินบริจาคทั่วไป" help="≤ 10% ของรายได้หลังลดหย่อน" />
        <NumField record={record} field="donationEducation" label="บริจาคการศึกษา/สาธารณสุข (×2)" help="คูณ 2, ≤ 10% หลังลดหย่อน" />
        <NumField record={record} field="donationPolitical" label="บริจาคพรรคการเมือง" help="≤ 10,000" />
      </Card>
    </div>
  )
}

// ── Simulator Tab ──────────────────────────────────────────────────────────
function SimulatorTab({ record }: { record: TaxRecord }) {
  const baseTax = calcThaiTax(record).taxOwed
  const [rmfAdd, setRmfAdd] = useState(0)
  const [ssfAdd, setSsfAdd] = useState(0)
  const [esgAdd, setEsgAdd] = useState(0)
  const [lifeAdd, setLifeAdd] = useState(0)

  const simulated: TaxRecord = {
    ...record,
    rmf: (record.rmf || 0) + rmfAdd,
    ssf: (record.ssf || 0) + ssfAdd,
    thaiEsg: (record.thaiEsg || 0) + esgAdd,
    lifeInsurance: (record.lifeInsurance || 0) + lifeAdd,
  }
  const newTax = calcThaiTax(simulated).taxOwed
  const saving = baseTax - newTax
  const totalInvest = rmfAdd + ssfAdd + esgAdd + lifeAdd
  const roi = totalInvest > 0 ? (saving / totalInvest) * 100 : 0

  return (
    <div className="px-4 py-4 space-y-3 pb-8">
      <Card className="!bg-gradient-to-br from-indigo-600 to-purple-700 !text-white">
        <div className="text-xs opacity-75 mb-1">ภาษีก่อนซื้อเพิ่ม</div>
        <div className="text-lg font-bold mb-3">{formatCurrency(baseTax, 0)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/15 rounded-xl p-2.5">
            <div className="text-[11px] opacity-75">ภาษีใหม่</div>
            <div className="text-[16px] font-bold">{formatCurrency(newTax, 0)}</div>
          </div>
          <div className="bg-white/15 rounded-xl p-2.5">
            <div className="text-[11px] opacity-75">ประหยัดได้</div>
            <div className="text-[16px] font-bold text-green-300">{formatCurrency(saving, 0)}</div>
          </div>
        </div>
        {totalInvest > 0 && (
          <div className="mt-3 text-[12px] opacity-90">
            ลงทุน {formatCurrency(totalInvest, 0)} → ประหยัดภาษี <b className="text-green-300">{roi.toFixed(1)}%</b> ของยอดที่ลง
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>ลองเพิ่ม</CardTitle>
        <SimSlider label="RMF" value={rmfAdd} onChange={setRmfAdd} max={500_000} />
        <SimSlider label="SSF" value={ssfAdd} onChange={setSsfAdd} max={200_000} />
        <SimSlider label="Thai ESG" value={esgAdd} onChange={setEsgAdd} max={300_000} />
        <SimSlider label="ประกันชีวิต" value={lifeAdd} onChange={setLifeAdd} max={100_000} />
      </Card>
    </div>
  )
}

function SimSlider({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-[13px] font-semibold text-gray-700">{label}</span>
        <span className="text-[13px] font-bold text-indigo-600">+ {formatCurrency(value, 0)}</span>
      </div>
      <input type="range" min={0} max={max} step={5000} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-indigo-600" />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0</span>
        <span>เพดาน {formatCurrency(max, 0)}</span>
      </div>
    </div>
  )
}

// ── Components ─────────────────────────────────────────────────────────────
function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-bold text-gray-900">{children}</div>
}

function Row({ label, value, negative, bold, color }: { label: string; value: number; negative?: boolean; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={color ?? (negative ? 'text-red-500' : 'text-gray-900')}>
        {negative ? '−' : ''}{formatCurrency(Math.abs(value), 0)}
      </span>
    </div>
  )
}

function NumField({ record, field, label, help, intOnly }: {
  record: TaxRecord; field: keyof TaxRecord; label: string; help?: string; intOnly?: boolean
}) {
  const [local, setLocal] = useState((record[field] as number | undefined)?.toString() ?? '')
  // Re-sync local state if record changes from outside
  useEffect(() => {
    setLocal((record[field] as number | undefined)?.toString() ?? '')
  }, [record, field])

  async function save() {
    const v = intOnly ? parseInt(local) : parseFloat(local)
    const val = isNaN(v) ? 0 : v
    if (record[field] === val) return
    await db.taxRecords.update(record.id!, { [field]: val, updatedAt: new Date().toISOString() })
  }
  return (
    <div className="mb-2.5">
      <div className="text-[12px] font-semibold text-gray-600 mb-0.5">{label}</div>
      {help && <div className="text-[10px] text-gray-400 mb-1">{help}</div>}
      <input type="number" value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={save}
        placeholder="0"
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
    </div>
  )
}
