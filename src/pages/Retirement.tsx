import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import { formatCurrency, calcRetirementTarget, calcMonthlySaving, getAgeDetail } from '../utils/calculations'

export default function Retirement() {
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const plan = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const salaryRecords = useLiveQuery(() => db.salaryRecords.orderBy('year').toArray())
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'projection' | 'assets'>('overview')

  const age = profile ? getAgeDetail(profile.dob).years : 35

  // Investment breakdown by type
  const invByType = investments?.reduce((acc, inv) => {
    acc[inv.type] = (acc[inv.type] ?? 0) + inv.currentValue
    return acc
  }, {} as Record<string, number>) ?? {}
  const totalInv = Object.values(invByType).reduce((s, v) => s + v, 0)

  // PVD from Salary records — sum of annual contributions across all entered years
  const pvdToDate = (salaryRecords ?? []).reduce((sum, r) => {
    const annual = r.baseSalary * 12
    return sum + annual * ((r.pvdEmployeeRate + r.pvdEmployerRate) / 100)
  }, 0)

  // Projected PVD at retirement (future contributions, 5% raise compounded)
  const latestSalary = (salaryRecords ?? []).slice(-1)[0]
  const yearsToRetirement = plan ? Math.max(plan.targetRetirementAge - age, 0) : 0
  const growthRate = 0.05
  const expectedReturn = (plan?.expectedReturnRate ?? 5) / 100
  let pvdProjected = 0
  if (latestSalary && yearsToRetirement > 0) {
    // Future PVD contributions with growth, compounded by expected return until retirement
    for (let i = 1; i <= yearsToRetirement; i++) {
      const yearFactor = Math.pow(1 + growthRate, i)
      const annualContrib = latestSalary.baseSalary * 12 * yearFactor * ((latestSalary.pvdEmployeeRate + latestSalary.pvdEmployerRate) / 100)
      // Compounded growth from this contribution year until retirement
      const yearsCompound = yearsToRetirement - i
      pvdProjected += annualContrib * Math.pow(1 + expectedReturn, yearsCompound)
    }
  }
  // Current PVD compounded to retirement
  const pvdToDateGrown = pvdToDate * Math.pow(1 + expectedReturn, yearsToRetirement)
  const pvdAtRetirement = pvdToDateGrown + pvdProjected

  // Effective assets = พอร์ตลงทุน + สินทรัพย์อื่นๆ + PVD ปัจจุบัน
  const effectiveAssets = (plan?.currentTotalAssets ?? 0) + totalInv + pvdToDate

  const target = plan ? calcRetirementTarget(plan.monthlyExpenseAtRetirement) : 0
  const progress = plan && target > 0 ? Math.min((effectiveAssets / target) * 100, 100) : 0
  const yearsLeft = plan ? Math.max(plan.targetRetirementAge - age, 0) : 0
  const monthlySaving = plan ? calcMonthlySaving(target, effectiveAssets, yearsLeft, plan.expectedReturnRate) : 0

  // Post-retirement projection
  const retirementYears = plan ? (plan.lifeExpectancy ?? 85) - plan.targetRetirementAge : 30
  const postReturnRate = plan?.postRetirementReturnRate ?? 4
  const projectedMonths = retirementYears * 12
  const postMonthlyRateCalc = postReturnRate / 100 / 12
  const sustainableMonthly = effectiveAssets && projectedMonths > 0
    ? (effectiveAssets * postMonthlyRateCalc) / (1 - Math.pow(1 + postMonthlyRateCalc, -projectedMonths))
    : 0

  const TYPE_LABELS: Record<string, string> = {
    thai_stock: 'หุ้นไทย', foreign_stock: 'หุ้นต่างประเทศ',
    fund: 'กองทุน', insurance: 'ประกัน', savings: 'ออมทรัพย์', other: 'อื่นๆ',
  }
  const TYPE_COLORS: Record<string, string> = {
    thai_stock: 'bg-blue-500', foreign_stock: 'bg-emerald-500',
    fund: 'bg-indigo-500', insurance: 'bg-amber-500', savings: 'bg-green-500', other: 'bg-gray-400',
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="แผนเกษียณ" gradient="from-orange-500 to-amber-500" rightAction={{ label: plan ? 'แก้ไข' : '+ ตั้งค่า', onClick: () => setShowForm(true) }} />
      <div className="flex-1 overflow-y-auto">
        {!plan ? (
          <div className="text-center py-16 text-gray-400 px-8">
            <div className="text-5xl mb-4">🎯</div>
            <div className="font-semibold text-gray-600 mb-2">ยังไม่ได้ตั้งแผนเกษียณ</div>
            <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-semibold active:scale-95">
              เริ่มวางแผน
            </button>
          </div>
        ) : (
          <>
            {/* Banner */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-5 py-5 text-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-xs opacity-75 mb-1">เป้าหมายเกษียณ อายุ {plan.targetRetirementAge} ปี</div>
                  <div className="text-3xl font-bold">{formatCurrency(target)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-75">ใช้/เดือน</div>
                  <div className="text-xl font-bold">{formatCurrency(plan.monthlyExpenseAtRetirement)}</div>
                </div>
              </div>
              <div className="text-sm opacity-80 flex gap-3">
                <span>เหลือ {yearsLeft.toFixed(0)} ปี</span>
                <span>·</span>
                <span>อายุขัย {plan.lifeExpectancy ?? 85} ปี</span>
                <span>·</span>
                <span>หลังเกษียณ {retirementYears} ปี</span>
              </div>
            </div>

            {/* Sub tabs */}
            <div className="flex bg-white border-b border-gray-100">
              {([['overview', 'ภาพรวม'], ['projection', 'คาดการณ์'], ['assets', 'สินทรัพย์']] as const).map(([t, l]) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-3 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
                  {l}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <>
                {/* Progress */}
                <div className="mx-4 mt-3">
                  <Card>
                    <div className="flex justify-between mb-2">
                      <div>
                        <CardTitle>ความคืบหน้า</CardTitle>
                        <div className="text-3xl font-bold text-gray-900">{progress.toFixed(0)}%</div>
                      </div>
                      <div className="text-right">
                        <CardTitle>มีอยู่แล้ว</CardTitle>
                        <div className="text-xl font-bold text-green-600">{formatCurrency(effectiveAssets)}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          พอร์ตลงทุน {formatCurrency(totalInv, 0)} + อื่นๆ {formatCurrency(plan.currentTotalAssets, 0)}
                        </div>
                      </div>
                    </div>
                    <ProgressBar value={progress} max={100} color={progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-indigo-500' : 'bg-amber-500'} />
                    <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                      <span>ยังขาด {formatCurrency(Math.max(target - effectiveAssets, 0))}</span>
                      <span>เป้า {formatCurrency(target)}</span>
                    </div>
                  </Card>
                </div>

                {/* Monthly saving needed */}
                <div className="mx-4 mt-3">
                  <Card className="!bg-indigo-50">
                    <CardTitle>ต้องออมต่อเดือน (อีก {yearsLeft.toFixed(0)} ปี)</CardTitle>
                    <div className="flex items-baseline gap-1 mt-1">
                      <div className="text-3xl font-bold text-indigo-700">{formatCurrency(monthlySaving)}</div>
                      <div className="text-sm text-indigo-400">/ เดือน</div>
                    </div>
                    <div className="text-xs text-indigo-500 mt-1.5">
                      ผลตอบแทนก่อนเกษียณ {plan.expectedReturnRate}% · เฟ้อ {plan.inflationRate}% (4% Rule)
                    </div>
                  </Card>
                </div>

                {/* What If Simulator */}
                <SectionLabel>🧮 What If Simulator</SectionLabel>
                <div className="mx-4 mb-4">
                  <WhatIfSimulator
                    target={target} current={plan.currentTotalAssets}
                    yearsLeft={yearsLeft} returnRate={plan.expectedReturnRate} monthly={monthlySaving}
                  />
                </div>
              </>
            )}

            {activeTab === 'projection' && (
              <PostRetirementProjection
                currentAssets={effectiveAssets}
                monthlyExpense={plan.monthlyExpenseAtRetirement}
                postReturnRate={postReturnRate}
                retirementYears={retirementYears}
                sustainableMonthly={sustainableMonthly}
                targetRetirementAge={plan.targetRetirementAge}
                lifeExpectancy={plan.lifeExpectancy ?? 85}
              />
            )}

            {activeTab === 'assets' && (
              <AssetsTab invByType={invByType} totalInv={totalInv} plan={plan} effectiveAssets={effectiveAssets} TYPE_LABELS={TYPE_LABELS} TYPE_COLORS={TYPE_COLORS} pvdToDate={pvdToDate} pvdAtRetirement={pvdAtRetirement} />
            )}
          </>
        )}
        <div className="h-4" />
      </div>

      {showForm && <RetirementForm plan={plan} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function PostRetirementProjection({ currentAssets, monthlyExpense, postReturnRate, retirementYears, sustainableMonthly, targetRetirementAge, lifeExpectancy }: {
  currentAssets: number; monthlyExpense: number; postReturnRate: number; retirementYears: number;
  sustainableMonthly: number; targetRetirementAge: number; lifeExpectancy: number;
}) {
  const [simExtra, setSimExtra] = useState(0)

  // Year-by-year projection
  const rows = (() => {
    const result = []
    let balance = currentAssets
    const spend = monthlyExpense + simExtra
    for (let yr = 0; yr <= retirementYears; yr++) {
      result.push({ year: targetRetirementAge + yr, balance: Math.max(balance, 0) })
      const annual = balance * (postReturnRate / 100)
      balance = balance + annual - spend * 12
      if (balance <= 0) { result.push({ year: targetRetirementAge + yr + 1, balance: 0 }); break }
    }
    return result
  })()

  const depletionAge = rows.find(r => r.balance <= 0)?.year
  const isSafe = !depletionAge || depletionAge > lifeExpectancy
  const maxBalance = Math.max(...rows.map(r => r.balance))

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="mx-0 mb-4">
        <Card className={`${isSafe ? '!bg-green-50' : '!bg-red-50'}`}>
          <div className={`text-[13px] font-semibold mb-1 ${isSafe ? 'text-green-700' : 'text-red-700'}`}>
            {isSafe ? '✅ เงินพอใช้ถึงอายุ ' + lifeExpectancy + ' ปี' : `⚠️ เงินหมดตอนอายุ ${depletionAge} ปี`}
          </div>
          <div className="text-[13px] text-gray-600">
            Sustainable withdraw: <b className={isSafe ? 'text-green-700' : 'text-red-600'}>{formatCurrency(sustainableMonthly)}/เดือน</b>
          </div>
          <div className="text-[12px] text-gray-500 mt-0.5">คาดหวังผลตอบแทน {postReturnRate}%/ปีหลังเกษียณ</div>
        </Card>
      </div>

      {/* Extra spend simulator */}
      <div className="mb-4">
        <Card>
          <div className="text-[13px] font-semibold text-gray-700 mb-2">ถ้าใช้เพิ่มต่อเดือน</div>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={50000} step={1000} value={simExtra}
              onChange={e => setSimExtra(parseInt(e.target.value))}
              className="flex-1 accent-indigo-600" />
            <div className="text-[14px] font-bold text-indigo-600 w-24 text-right">{formatCurrency(simExtra)}</div>
          </div>
        </Card>
      </div>

      {/* Balance bar chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="text-[13px] font-bold text-gray-600 mb-3">ยอดเงินแต่ละปีหลังเกษียณ</div>
        <div className="flex gap-0.5 items-end h-24">
          {rows.map((r, i) => {
            const barH = maxBalance > 0 ? Math.round((r.balance / maxBalance) * 88) : 2
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div style={{ height: barH || 2 }}
                  className={`w-full rounded-t-sm ${r.balance <= 0 ? 'bg-red-300' : r.balance < currentAssets * 0.3 ? 'bg-amber-400' : 'bg-indigo-400'}`} />
                {i % 5 === 0 && <div className="text-[9px] text-gray-400">{r.year}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Year-by-year table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <div className="text-[11px] font-bold text-gray-500">อายุ (ปี)</div>
          <div className="text-[11px] font-bold text-gray-500 text-right">ยอดเงินคงเหลือ</div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {rows.map((r, idx) => (
            <div key={idx} className={`grid grid-cols-2 px-4 py-2 ${idx < rows.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div className="text-[13px] text-gray-700">อายุ {r.year} ปี</div>
              <div className={`text-[13px] font-semibold text-right ${r.balance <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                {r.balance <= 0 ? 'หมดแล้ว' : formatCurrency(r.balance, 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AssetsTab({ invByType, totalInv, plan, effectiveAssets, TYPE_LABELS, TYPE_COLORS, pvdToDate, pvdAtRetirement }: any) {
  return (
    <div className="px-4 pt-3 pb-4">
      <div className="mb-3">
        <Card>
          <CardTitle>สินทรัพย์รวม</CardTitle>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(effectiveAssets)}</div>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <div className="text-gray-400">📈 พอร์ตลงทุน</div>
              <div className="font-semibold text-gray-700">{formatCurrency(totalInv, 0)}</div>
            </div>
            <div>
              <div className="text-gray-400">🏦 PVD ปัจจุบัน</div>
              <div className="font-semibold text-gray-700">{formatCurrency(pvdToDate, 0)}</div>
            </div>
            <div>
              <div className="text-gray-400">💰 อื่นๆ</div>
              <div className="font-semibold text-gray-700">{formatCurrency(plan.currentTotalAssets, 0)}</div>
            </div>
          </div>
          {pvdAtRetirement > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 bg-indigo-50 -mx-4 px-4 py-2 rounded-b-2xl">
              <div className="flex justify-between items-center">
                <div className="text-[11px] text-indigo-600 font-semibold">🎯 PVD คาดการณ์ ณ เกษียณ</div>
                <div className="text-[14px] font-bold text-indigo-700">{formatCurrency(pvdAtRetirement, 0)}</div>
              </div>
              <div className="text-[10px] text-indigo-400 mt-0.5">รวมการสมทบในอนาคต + ดอกเบี้ยทบต้น</div>
            </div>
          )}
        </Card>
      </div>

      {totalInv > 0 && (
        <>
          <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">สัดส่วนการลงทุน</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
            {Object.entries(invByType).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([type, val], idx, arr) => {
              const pct = totalInv > 0 ? ((val as number) / totalInv) * 100 : 0
              const color = TYPE_COLORS[type] ?? 'bg-gray-400'
              return (
                <div key={type} className={`px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-[14px] font-medium text-gray-700">{TYPE_LABELS[type] ?? type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[14px] font-bold text-gray-900">{formatCurrency(val as number, 0)}</span>
                      <span className="text-[11px] text-gray-400 ml-1">({pct.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <ProgressBar value={pct} max={100} color={color} />
                </div>
              )
            })}
          </div>

          {/* Allocation advice */}
          <Card className="!bg-indigo-50">
            <div className="text-[13px] font-bold text-indigo-700 mb-1.5">📊 แนะนำสัดส่วน (อิง Age Rule)</div>
            <div className="text-[12px] text-indigo-600 flex flex-col gap-1">
              <div>• หุ้น/กองทุน: <b>{Math.max(100 - (plan.targetRetirementAge ?? 55), 40)}%</b></div>
              <div>• พันธบัตร/ออมทรัพย์: <b>{Math.min(plan.targetRetirementAge ?? 55, 60)}%</b></div>
              <div className="text-[11px] text-indigo-400">Rule: (100 - อายุ) = % ในหุ้น</div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function WhatIfSimulator({ target, current, yearsLeft, returnRate, monthly }: {
  target: number; current: number; yearsLeft: number; returnRate: number; monthly: number
}) {
  const [extraMonthly, setExtraMonthly] = useState(5000)
  const [newReturn, setNewReturn] = useState(returnRate)

  const newMonthly = calcMonthlySaving(target, current, yearsLeft, newReturn)
  const yearsEarlyRough = extraMonthly > 0 ? Math.round(extraMonthly / (monthly / 12) * 10) / 10 : 0

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-2">ถ้าออมเพิ่มอีก</div>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={50000} step={1000} value={extraMonthly}
              onChange={e => setExtraMonthly(parseInt(e.target.value))}
              className="flex-1 accent-indigo-600" />
            <div className="text-[15px] font-bold text-indigo-600 w-24 text-right">{formatCurrency(extraMonthly)}/เดือน</div>
          </div>
          <div className="text-[13px] text-green-600 font-semibold mt-1.5">
            → เกษียณเร็วขึ้นประมาณ {yearsEarlyRough} เดือน 🎉
          </div>
        </div>
        <div className="h-px bg-gray-100" />
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-2">ถ้าผลตอบแทนเฉลี่ย</div>
          <div className="flex items-center gap-3">
            <input type="range" min={3} max={15} step={0.5} value={newReturn}
              onChange={e => setNewReturn(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600" />
            <div className="text-[15px] font-bold text-indigo-600 w-16 text-right">{newReturn}%</div>
          </div>
          <div className="text-[13px] text-indigo-600 font-semibold mt-1.5">
            → ต้องออม {formatCurrency(newMonthly)}/เดือน
            {newMonthly < monthly ? ` (ลดลง ${formatCurrency(monthly - newMonthly)}) ✅` : ` (เพิ่มขึ้น ${formatCurrency(newMonthly - monthly)}) ⚠️`}
          </div>
        </div>
      </div>
    </Card>
  )
}

function RetirementForm({ plan, onClose }: { plan: any; onClose: () => void }) {
  const [form, setForm] = useState({
    targetRetirementAge: plan?.targetRetirementAge?.toString() ?? '55',
    lifeExpectancy: plan?.lifeExpectancy?.toString() ?? '85',
    monthlyExpenseAtRetirement: plan?.monthlyExpenseAtRetirement?.toString() ?? '40000',
    currentTotalAssets: plan?.currentTotalAssets?.toString() ?? '0',
    expectedReturnRate: plan?.expectedReturnRate?.toString() ?? '7',
    postRetirementReturnRate: plan?.postRetirementReturnRate?.toString() ?? '4',
    inflationRate: plan?.inflationRate?.toString() ?? '3',
  })

  async function save() {
    const data = {
      targetRetirementAge: parseInt(form.targetRetirementAge),
      lifeExpectancy: parseInt(form.lifeExpectancy),
      monthlyExpenseAtRetirement: parseFloat(form.monthlyExpenseAtRetirement),
      currentTotalAssets: parseFloat(form.currentTotalAssets),
      expectedReturnRate: parseFloat(form.expectedReturnRate),
      postRetirementReturnRate: parseFloat(form.postRetirementReturnRate),
      inflationRate: parseFloat(form.inflationRate),
      updatedAt: new Date().toISOString(),
    }
    if (plan?.id) await db.retirementPlan.update(plan.id, data)
    else await db.retirementPlan.add(data)
    onClose()
  }

  const fields: [string, string, string][] = [
    ['อายุเกษียณ (ปี)', 'targetRetirementAge', '55'],
    ['อายุขัยคาดหวัง (ปี)', 'lifeExpectancy', '85'],
    ['ค่าใช้จ่าย/เดือนตอนเกษียณ', 'monthlyExpenseAtRetirement', '40000'],
    ['สินทรัพย์อื่นๆ (เงินสด, อสังหา — PVD ดึงจากเงินเดือนอัตโนมัติ)', 'currentTotalAssets', '0'],
    ['ผลตอบแทนก่อนเกษียณ (%/ปี)', 'expectedReturnRate', '7'],
    ['ผลตอบแทนหลังเกษียณ (%/ปี)', 'postRetirementReturnRate', '4'],
    ['เงินเฟ้อ (%/ปี)', 'inflationRate', '3'],
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">แผนเกษียณ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        {fields.map(([label, key, ph]) => (
          <div key={key}>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
            <input type="number" placeholder={ph} value={(form as any)[key]}
              onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        ))}
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}
