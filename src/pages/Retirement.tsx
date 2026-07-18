import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import { formatCurrency, calcRetirementTarget, calcMonthlySaving, getAgeDetail } from '../utils/calculations'
import Button from '../components/Button'
import DateInput from '../components/DateInput'
import { genId } from '../utils/id'

export default function Retirement() {
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const plan = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const salaryRecords = useLiveQuery(() => db.salaryRecords.orderBy('year').toArray())
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'projection' | 'assets' | 'savings' | 'pvd' | 'sso'>('overview')

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

  // PVD จาก tab PVD (ถ้ากรอกไว้) มิฉะนั้น fallback เป็นค่าจากเงินเดือน
  const pvdCalc = loadPvd()
  const savingsCalc = loadSavings()
  const pvdForAssets = pvdCalc.rows.length > 0 ? computePvdBalance(pvdCalc) : pvdToDate
  const savingsForAssets = savingsCurrentValue(savingsCalc)

  // Effective assets = พอร์ตลงทุน + สินทรัพย์อื่นๆ + PVD ปัจจุบัน + เงินออม
  const effectiveAssets = (plan?.currentTotalAssets ?? 0) + totalInv + pvdForAssets + savingsForAssets

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
        {/* Sub tabs — grid 3 คอลัมน์ (2 แถว) เห็นครบไม่ต้องเลื่อน */}
        <div className="grid grid-cols-3 bg-white border-b border-gray-100">
          {([['overview', 'ภาพรวม'], ['projection', 'คาดการณ์'], ['assets', 'สินทรัพย์'], ['savings', 'ออมเงิน'], ['pvd', 'PVD'], ['sso', 'ประกันสังคม']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-2 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>

        {activeTab === 'pvd' ? (
          <PvdTab />
        ) : activeTab === 'sso' ? (
          <SsoPensionTab dob={profile?.dob} />
        ) : activeTab === 'savings' ? (
          <SavingsTab />
        ) : !plan ? (
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
                          ลงทุน {formatCurrency(totalInv, 0)} · PVD {formatCurrency(pvdForAssets, 0)} · ออม {formatCurrency(savingsForAssets, 0)} · อื่นๆ {formatCurrency(plan.currentTotalAssets, 0)}
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
              <AssetsTab invByType={invByType} totalInv={totalInv} plan={plan} effectiveAssets={effectiveAssets} TYPE_LABELS={TYPE_LABELS} TYPE_COLORS={TYPE_COLORS} pvd={pvdForAssets} savings={savingsForAssets} pvdAtRetirement={pvdAtRetirement} />
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

interface AssetsTabProps {
  invByType: Record<string, number>
  totalInv: number
  plan: { targetRetirementAge?: number; currentTotalAssets: number }
  effectiveAssets: number
  TYPE_LABELS: Record<string, string>
  TYPE_COLORS: Record<string, string>
  pvd: number
  savings: number
  pvdAtRetirement: number
}
function AssetsTab({ invByType, totalInv, plan, effectiveAssets, TYPE_LABELS, TYPE_COLORS, pvd, savings, pvdAtRetirement }: AssetsTabProps) {
  return (
    <div className="px-4 pt-3 pb-4">
      <div className="mb-3">
        <Card>
          <CardTitle>สินทรัพย์รวม</CardTitle>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(effectiveAssets)}</div>
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
            <div>
              <div className="text-gray-400">📈 พอร์ตลงทุน</div>
              <div className="font-semibold text-gray-700">{formatCurrency(totalInv, 0)}</div>
            </div>
            <div>
              <div className="text-gray-400">🏦 PVD ปัจจุบัน</div>
              <div className="font-semibold text-gray-700">{formatCurrency(pvd, 0)}</div>
            </div>
            <div>
              <div className="text-gray-400">🐷 เงินออม</div>
              <div className="font-semibold text-gray-700">{formatCurrency(savings, 0)}</div>
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
        <Button onClick={save}>
          บันทึก
        </Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PVD Calculator — คำนวณเงินกองทุนสำรองเลี้ยงชีพสะสม (ถ้าลาออกตอนนี้ได้เท่าไร)
// ═══════════════════════════════════════════════════════════════════════════════
interface PvdRow { id: string; year: number; monthlySalary: number; employeeRate: number }
interface PvdConfig {
  startDate: string        // วันเริ่มงาน
  carriedOver: number      // PVD สะสมยกมา
  fundReturnRate: number   // % ผลตอบแทนกองทุน/ปี
  tier1: number            // อายุงาน < 5 ปี
  tier2: number            // 5–10 ปี
  tier3: number            // > 10–20 ปี
  tier4: number            // > 20 ปี
  rows: PvdRow[]
}
const PVD_DEFAULT: PvdConfig = {
  startDate: '', carriedOver: 0, fundReturnRate: 0,
  tier1: 5, tier2: 7, tier3: 8.5, tier4: 10, rows: [],
}
function loadPvd(): PvdConfig {
  try { return { ...PVD_DEFAULT, ...JSON.parse(localStorage.getItem('pvd_calc_v1') ?? '{}') } }
  catch { return PVD_DEFAULT }
}
function savePvd(c: PvdConfig) { localStorage.setItem('pvd_calc_v1', JSON.stringify(c)) }

function serviceYearsAt(startDate: string, year: number): number {
  if (!startDate) return 0
  const sy = parseInt(startDate.slice(0, 4))
  if (isNaN(sy)) return 0
  return Math.max(year - sy, 0)
}
function employerRateFor(cfg: PvdConfig, serviceYears: number): number {
  if (serviceYears < 5) return cfg.tier1
  if (serviceYears <= 10) return cfg.tier2
  if (serviceYears <= 20) return cfg.tier3
  return cfg.tier4
}
// คำนวณ PVD ทั้งหมด (แหล่งความจริงเดียว) — ใช้ทั้งในตาราง PvdTab และรวมในสินทรัพย์
interface PvdComputedRow extends PvdRow { sv: number; coRate: number; empContrib: number; coContrib: number; contrib: number; balance: number }
function computePvd(cfg: PvdConfig): { rows: PvdComputedRow[]; finalBalance: number; totalEmp: number; totalCo: number; growth: number } {
  const r = cfg.fundReturnRate / 100
  let balance = cfg.carriedOver
  let totalEmp = 0, totalCo = 0
  const rows = cfg.rows.slice().sort((a, b) => a.year - b.year).map(row => {
    const sv = serviceYearsAt(cfg.startDate, row.year)
    const coRate = employerRateFor(cfg, sv)
    const annual = (row.monthlySalary || 0) * 12
    const empContrib = annual * (row.employeeRate || 0) / 100
    const coContrib = annual * coRate / 100
    totalEmp += empContrib
    totalCo += coContrib
    balance = (balance + empContrib + coContrib) * (1 + r)
    return { ...row, sv, coRate, empContrib, coContrib, contrib: empContrib + coContrib, balance }
  })
  return { rows, finalBalance: balance, totalEmp, totalCo, growth: balance - cfg.carriedOver - totalEmp - totalCo }
}
// ยอด PVD สะสมปัจจุบัน (ถ้าลาออกตอนนี้) — ใช้รวมในสินทรัพย์
function computePvdBalance(cfg: PvdConfig): number { return computePvd(cfg).finalBalance }

function PvdTab() {
  const [cfg, setCfg] = useState<PvdConfig>(loadPvd)
  const [edit, setEdit] = useState(false)
  const [showTiers, setShowTiers] = useState(false)
  const [gen, setGen] = useState({ firstSalary: '', raise: '5', employeeRate: '' })
  const [genError, setGenError] = useState('')

  function update(next: PvdConfig) { setCfg(next); savePvd(next) }
  function setField<K extends keyof PvdConfig>(k: K, v: PvdConfig[K]) { update({ ...cfg, [k]: v }) }
  function setRows(rows: PvdRow[]) { update({ ...cfg, rows }) }
  function editRow(id: string, patch: Partial<PvdRow>) {
    setRows(cfg.rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: string) { setRows(cfg.rows.filter(r => r.id !== id)) }
  function addRow() {
    const lastYear = cfg.rows.length ? Math.max(...cfg.rows.map(r => r.year)) : (cfg.startDate ? parseInt(cfg.startDate.slice(0, 4)) : new Date().getFullYear())
    const last = cfg.rows.slice().sort((a, b) => b.year - a.year)[0]
    setRows([...cfg.rows, { id: genId(), year: lastYear + (cfg.rows.length ? 1 : 0), monthlySalary: last?.monthlySalary ?? 0, employeeRate: last?.employeeRate ?? 0 }])
  }

  function generate() {
    const startYear = cfg.startDate ? parseInt(cfg.startDate.slice(0, 4)) : NaN
    const currentYear = new Date().getFullYear()
    if (isNaN(startYear)) { setGenError('กรุณากรอกวันเริ่มงานก่อน'); return }
    const first = parseFloat(gen.firstSalary) || 0
    const raise = (parseFloat(gen.raise) || 0) / 100
    const empRate = parseFloat(gen.employeeRate) || 0
    if (first <= 0) { setGenError('กรุณากรอกเงินเดือนปีแรก'); return }
    setGenError('')
    const rows: PvdRow[] = []
    for (let y = startYear, i = 0; y <= currentYear; y++, i++) {
      rows.push({ id: genId(), year: y, monthlySalary: Math.round(first * Math.pow(1 + raise, i)), employeeRate: empRate })
    }
    update({ ...cfg, rows })
    setEdit(true)
  }

  // ── คำนวณ (ใช้ computePvd แหล่งเดียวกับหน้าสินทรัพย์) ──
  const { rows: computed, finalBalance, totalEmp, totalCo, growth } = computePvd(cfg)

  return (
    <div className="px-4 py-4 pb-8 space-y-3">
      {/* Result hero */}
      <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-indigo-600 to-violet-700">
        <div className="text-[11px] opacity-75 mb-0.5">ถ้าลาออกตอนนี้ ได้ PVD ประมาณ</div>
        <div className="text-3xl font-bold">{formatCurrency(finalBalance, 0)}</div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-80">เราสมทบ</div>
            <div className="text-[13px] font-bold">{formatCurrency(totalEmp, 0)}</div>
          </div>
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-80">บริษัทสมทบ</div>
            <div className="text-[13px] font-bold">{formatCurrency(totalCo, 0)}</div>
          </div>
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <div className="text-[10px] opacity-80">ผลตอบแทน</div>
            <div className="text-[13px] font-bold">{formatCurrency(growth, 0)}</div>
          </div>
        </div>
        {cfg.carriedOver > 0 && (
          <div className="text-[10px] opacity-75 mt-2">รวมยอดยกมา {formatCurrency(cfg.carriedOver, 0)} แล้ว</div>
        )}
      </div>

      {/* Config */}
      <Card>
        <CardTitle>ตั้งค่า</CardTitle>
        <div className="mt-2 space-y-2.5">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">📅 วันเริ่มงาน</div>
            <DateInput value={cfg.startDate} onChange={e => setField('startDate', e.target.value)} />
            {cfg.startDate && (
              <div className="text-[11px] text-gray-400 mt-1">
                อายุงานถึงปีนี้ ~{serviceYearsAt(cfg.startDate, new Date().getFullYear())} ปี · บริษัทสมทบ {employerRateFor(cfg, serviceYearsAt(cfg.startDate, new Date().getFullYear()))}%
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">💰 PVD สะสมยกมา</div>
              <input type="number" placeholder="0" value={cfg.carriedOver || ''}
                onChange={e => setField('carriedOver', parseFloat(e.target.value) || 0)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">📈 ผลตอบแทนกองทุน/ปี %</div>
              <input type="number" placeholder="0" value={cfg.fundReturnRate || ''}
                onChange={e => setField('fundReturnRate', parseFloat(e.target.value) || 0)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            </div>
          </div>

          <button onClick={() => setShowTiers(v => !v)} className="text-[12px] text-indigo-600 font-semibold">
            {showTiers ? '▾' : '▸'} เงื่อนไขบริษัทสมทบตามอายุงาน
          </button>
          {showTiers && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-gray-500 mb-1">{'< 5 ปี %'}</div>
                <input type="number" value={cfg.tier1 || ''} onChange={e => setField('tier1', parseFloat(e.target.value) || 0)}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500 mb-1">5–10 ปี %</div>
                <input type="number" value={cfg.tier2 || ''} onChange={e => setField('tier2', parseFloat(e.target.value) || 0)}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500 mb-1">{'> 10–20 ปี %'}</div>
                <input type="number" value={cfg.tier3 || ''} onChange={e => setField('tier3', parseFloat(e.target.value) || 0)}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500 mb-1">{'> 20 ปี %'}</div>
                <input type="number" value={cfg.tier4 || ''} onChange={e => setField('tier4', parseFloat(e.target.value) || 0)}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Quick generate */}
      <Card className="!bg-indigo-50">
        <CardTitle>⚡ สร้างตารางอัตโนมัติ</CardTitle>
        <div className="text-[11px] text-indigo-500 mt-0.5 mb-2">ใส่เงินเดือนปีแรก + % ขึ้น/ปี → สร้างทุกปีจากวันเริ่มงานถึงปีนี้ แล้วค่อยแก้ทีละปี</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">เงินเดือนปีแรก</div>
            <input type="number" placeholder="30000" value={gen.firstSalary}
              onChange={e => setGen(v => ({ ...v, firstSalary: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full bg-white" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ขึ้น %/ปี</div>
            <input type="number" placeholder="5" value={gen.raise}
              onChange={e => setGen(v => ({ ...v, raise: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full bg-white" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">เราสมทบ %</div>
            <input type="number" placeholder="5" value={gen.employeeRate}
              onChange={e => setGen(v => ({ ...v, employeeRate: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full bg-white" />
          </div>
        </div>
        {genError && <div className="text-[11px] text-red-500 mt-2">⚠️ {genError}</div>}
        <button onClick={generate}
          className="mt-2 w-full bg-indigo-600 text-white text-[13px] font-semibold py-2.5 rounded-xl active:scale-95">
          สร้างตาราง {cfg.rows.length > 0 ? '(เขียนทับของเดิม)' : ''}
        </button>
      </Card>

      {/* Year table */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <CardTitle>ตารางรายปี</CardTitle>
          <button onClick={() => setEdit(v => !v)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg ${edit ? 'bg-emerald-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
            {edit ? '✓ เสร็จ' : '✏️ แก้ไข'}
          </button>
        </div>

        {computed.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-[13px]">
            ยังไม่มีข้อมูล — กด “สร้างตารางอัตโนมัติ” หรือ “＋ เพิ่มปี”
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] min-w-[440px]">
              <thead>
                <tr className="text-gray-400 text-[10px] border-b border-gray-100">
                  <th className="py-1.5 px-1 text-left font-semibold">ปี</th>
                  <th className="py-1.5 px-1 text-right font-semibold">เงินเดือน</th>
                  <th className="py-1.5 px-1 text-center font-semibold">บ.%</th>
                  <th className="py-1.5 px-1 text-right font-semibold">เรา%</th>
                  <th className="py-1.5 px-1 text-right font-semibold">สมทบ/ปี</th>
                  <th className="py-1.5 px-1 text-right font-semibold">สะสม</th>
                  {edit && <th className="py-1.5 px-1"></th>}
                </tr>
              </thead>
              <tbody>
                {computed.map(row => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-1.5 px-1 text-gray-700">
                      {edit ? (
                        <input type="number" value={row.year}
                          onChange={e => editRow(row.id, { year: parseInt(e.target.value) || row.year })}
                          className="border border-gray-200 rounded-md px-1.5 py-1 w-14 text-[12px]" />
                      ) : (
                        <span>{row.year}<span className="text-gray-300 text-[10px]"> ({row.sv}ปี)</span></span>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-right">
                      {edit ? (
                        <input type="number" value={row.monthlySalary || ''}
                          onChange={e => editRow(row.id, { monthlySalary: parseFloat(e.target.value) || 0 })}
                          className="border border-gray-200 rounded-md px-1.5 py-1 w-20 text-[12px] text-right" />
                      ) : formatCurrency(row.monthlySalary, 0)}
                    </td>
                    <td className="py-1.5 px-1 text-center text-gray-500">{row.coRate}%</td>
                    <td className="py-1.5 px-1 text-right">
                      {edit ? (
                        <input type="number" value={row.employeeRate || ''}
                          onChange={e => editRow(row.id, { employeeRate: parseFloat(e.target.value) || 0 })}
                          className="border border-gray-200 rounded-md px-1.5 py-1 w-12 text-[12px] text-right" />
                      ) : `${row.employeeRate}%`}
                    </td>
                    <td className="py-1.5 px-1 text-right text-gray-600">{formatCurrency(row.contrib, 0)}</td>
                    <td className="py-1.5 px-1 text-right font-semibold text-indigo-700">{formatCurrency(row.balance, 0)}</td>
                    {edit && (
                      <td className="py-1.5 px-1 text-right">
                        <button onClick={() => removeRow(row.id)} className="text-red-400 text-[14px]">🗑️</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {edit && (
          <button onClick={addRow}
            className="w-full mt-2 text-[12px] font-semibold text-indigo-600 bg-indigo-50 rounded-lg py-2 active:scale-[0.98]">
            ＋ เพิ่มปี
          </button>
        )}
      </Card>

      <div className="text-[11px] text-gray-400 px-1 leading-relaxed">
        * บริษัทสมทบคำนวณอัตโนมัติจากอายุงานแต่ละปี ({cfg.tier1}% เมื่อ &lt;5ปี, {cfg.tier2}% เมื่อ 5–10ปี, {cfg.tier3}% เมื่อ &gt;10–20ปี, {cfg.tier4}% เมื่อ &gt;20ปี)
        · ยอด “สะสม” รวมผลตอบแทนกองทุน {cfg.fundReturnRate}%/ปี แล้ว
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// บำนาญประกันสังคม — สูตร CARE (Career-Average Revalued Earnings) เริ่มปี 2569
// อัตราบำนาญ = 20% สำหรับ 180 เดือนแรก + 0.125%/เดือน ที่เกิน 180 เดือน
// บำนาญ/เดือน = อัตรา% × ค่าจ้างเฉลี่ยตลอดการทำงาน (ปรับค่าปัจจุบัน, ไม่เกินเพดาน)
// ═══════════════════════════════════════════════════════════════════════════════
interface SsoConfig {
  startDate: string       // วันที่เริ่มส่งประกันสังคม
  claimDate: string       // วันที่จะรับบำนาญ (เกษียณ)
  avgWage: number         // ค่าจ้างเฉลี่ยต่อเดือน (จะถูก cap ตามเพดานแต่ละปี)
  lifeExpectancy: number  // อายุขัย (คำนวณยอดรวมตลอดชีพ)
}
const SSO_DEFAULT: SsoConfig = {
  startDate: '', claimDate: '', avgWage: 15000, lifeExpectancy: 85,
}
function loadSso(): SsoConfig {
  try { return { ...SSO_DEFAULT, ...JSON.parse(localStorage.getItem('sso_pension_v1') ?? '{}') } }
  catch { return SSO_DEFAULT }
}
function saveSso(c: SsoConfig) { localStorage.setItem('sso_pension_v1', JSON.stringify(c)) }

// เพดานค่าจ้างประกันสังคมตามปี (ค.ศ.) — แผนปรับขึ้น: 17,500 (69), 20,000 (72), 23,000 (75)
function ssoCeilingForYear(year: number): number {
  if (year >= 2032) return 23000
  if (year >= 2029) return 20000
  if (year >= 2026) return 17500
  return 15000
}

function SsoPensionTab({ dob }: { dob?: string }) {
  const [cfg, setCfg] = useState<SsoConfig>(() => {
    const loaded = loadSso()
    // ตั้งค่าเริ่มต้นอัจฉริยะจากวันเกิด (อายุ 23 เริ่มส่ง, 55 รับบำนาญ)
    if (dob && (!loaded.startDate || !loaded.claimDate)) {
      const by = parseInt(dob.slice(0, 4))
      const md = dob.slice(4) // '-MM-DD'
      if (!loaded.startDate) loaded.startDate = `${by + 23}${md}`
      if (!loaded.claimDate) loaded.claimDate = `${by + 55}${md}`
    }
    return loaded
  })
  function setField<K extends keyof SsoConfig>(k: K, v: SsoConfig[K]) {
    const next = { ...cfg, [k]: v }; setCfg(next); saveSso(next)
  }

  // ── เดินทีละเดือนจากวันเริ่มส่ง → วันรับบำนาญ, cap ค่าจ้างตามเพดานของปีนั้น ──
  const start = cfg.startDate ? new Date(cfg.startDate + 'T00:00:00') : null
  const end = cfg.claimDate ? new Date(cfg.claimDate + 'T00:00:00') : null
  const datesValid = !!(start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start)
  let months = 0, sumCapped = 0
  const ceilingsUsed = new Set<number>()
  if (datesValid && start && end) {
    let y = start.getFullYear(), m = start.getMonth()
    const ey = end.getFullYear(), em = end.getMonth()
    while ((y < ey || (y === ey && m < em)) && months < 720) {
      const c = ssoCeilingForYear(y)
      ceilingsUsed.add(c)
      sumCapped += Math.min(cfg.avgWage || 0, c)
      months++
      m++; if (m > 11) { m = 0; y++ }
    }
  }
  const effectiveWage = months > 0 ? sumCapped / months : 0
  const claimAge = dob && cfg.claimDate ? new Date(cfg.claimDate).getFullYear() - parseInt(dob.slice(0, 4)) : null
  const years = months / 12
  const fullYears = Math.floor(months / 12)
  const eligible = months >= 180

  // สูตร CARE: 20% + 0.125%/เดือน ที่เกิน 180 เดือน
  const careRate = eligible ? 20 + (months - 180) * 0.125 : 0
  const carePension = eligible ? (careRate / 100) * effectiveWage : 0
  // สูตรเดิม: 20% + 1.5%/ปีเต็ม ที่เกิน 15 ปี (ปัดเศษปีทิ้ง)
  const oldRate = fullYears >= 15 ? 20 + (fullYears - 15) * 1.5 : 0
  const oldPension = fullYears >= 15 ? (oldRate / 100) * effectiveWage : 0
  // สปส. จ่ายสูตรที่สูงกว่า
  const payPension = Math.max(carePension, oldPension)
  const payRate = carePension >= oldPension ? careRate : oldRate
  const usingCare = carePension >= oldPension

  // บำเหน็จ (เงินก้อน) ถ้าส่งไม่ถึง 180 เดือน — ประมาณจากเงินสะสมชราภาพ 6% (เรา 3% + นายจ้าง 3%)
  const lumpSum = !eligible && months >= 12 ? effectiveWage * 0.06 * months : 0
  const refundOnly = months > 0 && months < 12

  const payoutYears = claimAge != null ? Math.max(cfg.lifeExpectancy - claimAge, 0) : 0
  const lifetimeTotal = payPension * 12 * payoutYears

  return (
    <div className="px-4 py-4 pb-8 space-y-3">
      {/* Hero */}
      <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-teal-600 to-emerald-700">
        <div className="text-[11px] opacity-75 mb-0.5">บำนาญประกันสังคม (ตลอดชีพ)</div>
        <div className="text-3xl font-bold">
          {eligible ? `${formatCurrency(payPension, 0)}` : lumpSum > 0 ? `${formatCurrency(lumpSum, 0)}` : '฿0'}
          <span className="text-[14px] font-medium opacity-80">{eligible ? ' / เดือน' : lumpSum > 0 ? ' (บำเหน็จ)' : ''}</span>
        </div>
        {eligible ? (
          <div className="text-[11px] opacity-80 mt-1">
            อัตราบำนาญ {payRate.toFixed(3).replace(/\.?0+$/, '')}% · ส่งสมทบ {years.toFixed(1)} ปี · ใช้สูตร {usingCare ? 'CARE' : 'เดิม'}
          </div>
        ) : refundOnly ? (
          <div className="text-[11px] opacity-90 mt-1">ส่งไม่ถึง 12 เดือน — ได้คืนเฉพาะเงินสมทบส่วนของเรา</div>
        ) : (
          <div className="text-[11px] opacity-90 mt-1">ส่งไม่ถึง 180 เดือน (15 ปี) — ได้บำเหน็จเงินก้อนแทนบำนาญ</div>
        )}
        {eligible && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-white/20 rounded-xl p-2.5 text-center">
              <div className="text-[10px] opacity-80">ต่อปี</div>
              <div className="text-[14px] font-bold">{formatCurrency(payPension * 12, 0)}</div>
            </div>
            <div className="bg-white/20 rounded-xl p-2.5 text-center">
              <div className="text-[10px] opacity-80">รวมถึงอายุ {cfg.lifeExpectancy}</div>
              <div className="text-[14px] font-bold">{claimAge != null ? formatCurrency(lifetimeTotal, 0) : '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Config */}
      <Card>
        <CardTitle>ข้อมูลของเรา</CardTitle>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">📅 วันที่เริ่มส่ง ปกส.</div>
            <DateInput value={cfg.startDate} onChange={e => setField('startDate', e.target.value)} />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">📅 วันที่จะรับบำนาญ</div>
            <DateInput value={cfg.claimDate} onChange={e => setField('claimDate', e.target.value)} />
            {claimAge != null && cfg.claimDate && (
              <div className="text-[10px] text-gray-400 mt-1">อายุตอนรับ ~{claimAge} ปี{claimAge < 55 && <span className="text-amber-600"> · ต้อง ≥55</span>}</div>
            )}
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">ค่าจ้างเฉลี่ย/เดือน</div>
            <input type="number" value={cfg.avgWage || ''} onChange={e => setField('avgWage', parseFloat(e.target.value) || 0)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">อายุขัย (คาดการณ์)</div>
            <input type="number" value={cfg.lifeExpectancy || ''} onChange={e => setField('lifeExpectancy', parseFloat(e.target.value) || 0)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
        </div>
        <div className="text-[11px] text-gray-400 mt-2 leading-relaxed">
          💡 เพดานค่าจ้างคิดอัตโนมัติตามปีที่ส่งแต่ละงวด: 15,000 (ก่อนปี 69) → 17,500 (69) → 20,000 (72) → 23,000 (75)
          {cfg.avgWage > 15000 && ' · เงินเดือนเกินเพดานจะถูก cap ให้'}
        </div>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardTitle>รายละเอียดการคำนวณ</CardTitle>
        {!datesValid ? (
          <div className="text-center text-gray-400 py-6 text-[13px]">เลือกวันที่เริ่มส่ง และวันที่จะรับบำนาญ ให้ครบก่อน</div>
        ) : (
        <div className="mt-2 space-y-1.5 text-[13px]">
          <div className="flex justify-between"><span className="text-gray-500">ระยะเวลาส่งสมทบ</span><span className="font-semibold text-gray-800">{months} เดือน ({years.toFixed(1)} ปี)</span></div>
          <div className="flex justify-between"><span className="text-gray-500">ค่าจ้างเฉลี่ยที่ใช้ (หลัง cap เพดาน)</span><span className="font-semibold text-gray-800">{formatCurrency(effectiveWage, 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">เพดานที่ใช้ในช่วงที่ส่ง</span><span className="font-semibold text-gray-600">{[...ceilingsUsed].sort((a, b) => a - b).map(c => c.toLocaleString()).join(' → ')}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">เกณฑ์บำนาญ (180 เดือน)</span><span className={`font-semibold ${eligible ? 'text-emerald-600' : 'text-amber-600'}`}>{eligible ? '✓ ครบ' : `ขาดอีก ${180 - months} เดือน`}</span></div>
        </div>
        )}

        {eligible && (
          <div className="mt-3 border-t pt-3 space-y-2">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">เทียบสูตร (สปส. จ่ายอันที่สูงกว่า)</div>
            <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${usingCare ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <div>
                <div className="text-[13px] font-semibold text-gray-800">✨ สูตรใหม่ CARE {usingCare && <span className="text-[10px] text-emerald-600">(ได้อันนี้)</span>}</div>
                <div className="text-[10px] text-gray-400">อัตรา {careRate.toFixed(3).replace(/\.?0+$/, '')}% · +0.125%/เดือน หลัง 180 เดือน</div>
              </div>
              <div className="text-[15px] font-bold text-emerald-700">{formatCurrency(carePension, 0)}</div>
            </div>
            <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${!usingCare ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <div>
                <div className="text-[13px] font-semibold text-gray-800">สูตรเดิม {!usingCare && <span className="text-[10px] text-emerald-600">(ได้อันนี้)</span>}</div>
                <div className="text-[10px] text-gray-400">อัตรา {oldRate.toFixed(1)}% · +1.5%/ปีเต็ม หลัง 15 ปี</div>
              </div>
              <div className="text-[15px] font-bold text-gray-700">{formatCurrency(oldPension, 0)}</div>
            </div>
          </div>
        )}

        {!eligible && lumpSum > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="flex justify-between text-[13px]">
              <span className="text-gray-500">บำเหน็จโดยประมาณ</span>
              <span className="font-bold text-teal-700">{formatCurrency(lumpSum, 0)}</span>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">ประมาณจากเงินสะสมชราภาพ 6% (เรา 3% + นายจ้าง 3%) × {months} เดือน — ยังไม่รวมผลตอบแทน</div>
          </div>
        )}
      </Card>

      <div className="text-[11px] text-gray-400 px-1 leading-relaxed">
        * สูตร CARE (Career-Average Revalued Earnings) เริ่มใช้ปี 2569 สำหรับ ม.33/39 · เป็นการประมาณการ
        โดยใช้ค่าจ้างเฉลี่ยที่กรอก (สูตรจริงปรับค่าจ้างอดีตเป็นค่าเงินปัจจุบันก่อนเฉลี่ย) · ตรวจสอบตัวเลขจริงที่ sso.thaith.ai/care
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ออมเงิน — วางแผนออมรายเดือน แบ่งลงทุน (หุ้นไทย/อเมริกา) ทบต้นทบดอกถึงปีเป้าหมาย
// ═══════════════════════════════════════════════════════════════════════════════
interface SavingsAlloc { id: string; name: string; pct: number; returnRate: number }
interface SavingsRecord { id: string; month: string; amount: number } // บันทึกออมจริง
interface SavingsConfig {
  startingBalance: number   // เงินเก็บที่มีอยู่แล้ว
  monthlyTarget: number     // เป้าออม/เดือน
  targetYear: number        // ออมถึงปี (ค.ศ.)
  allocs: SavingsAlloc[]
  log: SavingsRecord[]
}
function savingsDefault(): SavingsConfig {
  return {
    startingBalance: 0, monthlyTarget: 20000, targetYear: new Date().getFullYear() + 10,
    allocs: [
      { id: genId(), name: 'หุ้นไทย', pct: 50, returnRate: 8 },
      { id: genId(), name: 'หุ้นอเมริกา', pct: 50, returnRate: 10 },
    ],
    log: [],
  }
}
function loadSavings(): SavingsConfig {
  try {
    const c = JSON.parse(localStorage.getItem('savings_plan_v1') ?? 'null')
    return c ? { ...savingsDefault(), ...c } : savingsDefault()
  } catch { return savingsDefault() }
}
function saveSavings(c: SavingsConfig) { localStorage.setItem('savings_plan_v1', JSON.stringify(c)) }
// เงินออมปัจจุบัน = เงินตั้งต้น + ยอดที่ออมจริงทั้งหมด — ใช้รวมในสินทรัพย์
function savingsCurrentValue(cfg: SavingsConfig): number {
  return (cfg.startingBalance || 0) + cfg.log.reduce((s, r) => s + (r.amount || 0), 0)
}

function SavingsTab() {
  const currentYear = new Date().getFullYear()
  const [cfg, setCfg] = useState<SavingsConfig>(loadSavings)
  const [showLog, setShowLog] = useState(false)

  function update(next: SavingsConfig) { setCfg(next); saveSavings(next) }
  function setField<K extends keyof SavingsConfig>(k: K, v: SavingsConfig[K]) { update({ ...cfg, [k]: v }) }
  function editAlloc(id: string, patch: Partial<SavingsAlloc>) {
    update({ ...cfg, allocs: cfg.allocs.map(a => (a.id === id ? { ...a, ...patch } : a)) })
  }
  function addAlloc() { update({ ...cfg, allocs: [...cfg.allocs, { id: genId(), name: '', pct: 0, returnRate: 8 }] }) }
  function removeAlloc(id: string) { update({ ...cfg, allocs: cfg.allocs.filter(a => a.id !== id) }) }

  const totalPct = cfg.allocs.reduce((s, a) => s + (a.pct || 0), 0)
  const blendedReturn = cfg.allocs.reduce((s, a) => s + (a.pct / 100) * (a.returnRate || 0), 0)

  // ── จำลองทบต้นรายเดือนแยกแต่ละสินทรัพย์ ตั้งแต่เดือนนี้ → ธ.ค. ปีเป้าหมาย ──
  const now = new Date()
  const assets = cfg.allocs.map(a => ({
    name: a.name, pct: a.pct, r: (a.returnRate || 0) / 100,
    bal: cfg.startingBalance * (a.pct / 100), contrib: 0,
  }))
  const yearRows: { year: number; balance: number }[] = []
  let y = now.getFullYear(), m = now.getMonth(), guard = 0
  while (y <= cfg.targetYear && guard < 1200) {
    assets.forEach(a => {
      a.bal = a.bal * (1 + a.r / 12) + cfg.monthlyTarget * (a.pct / 100)
      a.contrib += cfg.monthlyTarget * (a.pct / 100)
    })
    if (m === 11) yearRows.push({ year: y, balance: assets.reduce((s, a) => s + a.bal, 0) })
    m++; if (m > 11) { m = 0; y++ }
    guard++
  }
  const finalTotal = assets.reduce((s, a) => s + a.bal, 0)
  const totalContrib = assets.reduce((s, a) => s + a.contrib, 0)
  const principal = cfg.startingBalance + totalContrib
  const growth = finalTotal - principal
  const yearsLeft = Math.max(cfg.targetYear - currentYear, 0)

  // ── สรุปยอดออมจริงจาก log ──
  const totalSaved = cfg.log.reduce((s, r) => s + (r.amount || 0), 0)
  const thisYearSaved = cfg.log.filter(r => r.month.startsWith(String(currentYear))).reduce((s, r) => s + r.amount, 0)
  const monthsElapsed = now.getMonth() + 1
  const thisYearTarget = cfg.monthlyTarget * monthsElapsed

  return (
    <div className="px-4 py-4 pb-8 space-y-3">
      {/* Hero */}
      <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-green-600 to-emerald-700">
        <div className="text-[11px] opacity-75 mb-0.5">ถ้าออมถึงปี {cfg.targetYear} (อีก {yearsLeft} ปี) จะมีประมาณ</div>
        <div className="text-3xl font-bold">{formatCurrency(finalTotal, 0)}</div>
        <div className="text-[11px] opacity-80 mt-0.5">ออม {formatCurrency(cfg.monthlyTarget, 0)}/เดือน · ผลตอบแทนเฉลี่ย {blendedReturn.toFixed(1)}%/ปี (ทบต้น)</div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-white/20 rounded-xl p-2.5 text-center">
            <div className="text-[10px] opacity-80">เงินต้นที่ออม</div>
            <div className="text-[14px] font-bold">{formatCurrency(principal, 0)}</div>
          </div>
          <div className="bg-white/20 rounded-xl p-2.5 text-center">
            <div className="text-[10px] opacity-80">ผลตอบแทนที่งอก</div>
            <div className="text-[14px] font-bold">{formatCurrency(growth, 0)}</div>
          </div>
        </div>
      </div>

      {/* Config */}
      <Card>
        <CardTitle>ตั้งค่าแผนออม</CardTitle>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">เป้าออม/เดือน</div>
            <input type="number" value={cfg.monthlyTarget || ''} onChange={e => setField('monthlyTarget', parseFloat(e.target.value) || 0)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">ออมถึงปี (ค.ศ.)</div>
            <input type="number" value={cfg.targetYear || ''} onChange={e => setField('targetYear', parseInt(e.target.value) || currentYear)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
          <div className="col-span-2">
            <div className="text-[12px] font-semibold text-gray-500 mb-1">เงินเก็บที่มีอยู่แล้ว (ตั้งต้น)</div>
            <input type="number" value={cfg.startingBalance || ''} onChange={e => setField('startingBalance', parseFloat(e.target.value) || 0)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
        </div>
      </Card>

      {/* Allocations */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <CardTitle>แบ่งพอร์ตลงทุน</CardTitle>
          <span className={`text-[11px] font-semibold ${totalPct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>รวม {totalPct}%</span>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">แต่ละก้อนใส่ % และผลตอบแทนที่คาดหวัง/ปี</div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-1 items-center text-[10px] text-gray-400 font-semibold">
          <span>สินทรัพย์</span><span className="text-right w-14">สัดส่วน%</span><span className="text-right w-16">ผลตอบแทน%</span><span></span>
        </div>
        {cfg.allocs.map(a => (
          <div key={a.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-1 items-center py-1">
            <input type="text" placeholder="ชื่อสินทรัพย์" value={a.name}
              onChange={e => editAlloc(a.id, { name: e.target.value })}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] w-full min-w-0" />
            <input type="number" value={a.pct || ''} onChange={e => editAlloc(a.id, { pct: parseFloat(e.target.value) || 0 })}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] w-14 text-right" />
            <input type="number" value={a.returnRate || ''} onChange={e => editAlloc(a.id, { returnRate: parseFloat(e.target.value) || 0 })}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] w-16 text-right" />
            <button onClick={() => removeAlloc(a.id)} className="text-red-400 text-[14px] px-0.5">🗑️</button>
          </div>
        ))}
        <button onClick={addAlloc} className="w-full mt-1.5 text-[12px] font-semibold text-emerald-600 bg-emerald-50 rounded-lg py-2 active:scale-[0.98]">
          ＋ เพิ่มสินทรัพย์
        </button>
        {totalPct !== 100 && (
          <div className="text-[11px] text-amber-600 mt-2">⚠️ สัดส่วนรวมควรเป็น 100% (ตอนนี้ {totalPct}%)</div>
        )}
      </Card>

      {/* Per-asset final breakdown */}
      <Card>
        <CardTitle>คาดการณ์แยกตามสินทรัพย์ (ปี {cfg.targetYear})</CardTitle>
        <div className="mt-2 space-y-1.5">
          {assets.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-[13px]">
              <span className="text-gray-600">{a.name || '—'} <span className="text-gray-300 text-[11px]">({a.pct}% · {(a.r * 100).toFixed(0)}%/ปี)</span></span>
              <span className="font-semibold text-gray-800">{formatCurrency(a.bal, 0)}</span>
            </div>
          ))}
          <div className="border-t pt-2 mt-1 flex justify-between text-[14px] font-bold">
            <span className="text-gray-700">รวม</span>
            <span className="text-emerald-600">{formatCurrency(finalTotal, 0)}</span>
          </div>
        </div>
      </Card>

      {/* Year-by-year growth table */}
      <Card>
        <CardTitle>ยอดสะสมรายปี (ทบต้นทบดอก)</CardTitle>
        <div className="overflow-x-auto -mx-1 mt-2">
          <table className="w-full text-[12px] min-w-[260px]">
            <thead>
              <tr className="text-gray-400 text-[10px] border-b border-gray-100">
                <th className="py-1.5 px-1 text-left font-semibold">สิ้นปี</th>
                <th className="py-1.5 px-1 text-right font-semibold">ยอดสะสม</th>
              </tr>
            </thead>
            <tbody>
              {yearRows.map(r => (
                <tr key={r.year} className="border-b border-gray-50">
                  <td className="py-1.5 px-1 text-gray-700">{r.year}</td>
                  <td className="py-1.5 px-1 text-right font-semibold text-emerald-700">{formatCurrency(r.balance, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Actual savings log */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>บันทึกออมจริง</CardTitle>
          <button onClick={() => setShowLog(v => !v)} className="text-[12px] font-semibold text-emerald-600">{showLog ? '▾ ซ่อน' : '▸ ดู/เพิ่ม'}</button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <div className="text-[10px] text-gray-400">ออมจริงปีนี้</div>
            <div className={`text-[14px] font-bold ${thisYearSaved >= thisYearTarget ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(thisYearSaved, 0)}</div>
            <div className="text-[10px] text-gray-400">เป้า {formatCurrency(thisYearTarget, 0)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <div className="text-[10px] text-gray-400">ออมจริงสะสมทั้งหมด</div>
            <div className="text-[14px] font-bold text-gray-800">{formatCurrency(totalSaved, 0)}</div>
          </div>
        </div>

        {showLog && (
          <div className="mt-3">
            <SavingsLogEditor cfg={cfg} onChange={update} />
          </div>
        )}
      </Card>

      <div className="text-[11px] text-gray-400 px-1 leading-relaxed">
        * คำนวณแบบทบต้นรายเดือน (ผลตอบแทนแยกตามสินทรัพย์) สมมติออมตามเป้าทุกเดือนและไม่ถอนออก · ผลจริงขึ้นกับตลาด
      </div>
    </div>
  )
}

function SavingsLogEditor({ cfg, onChange }: { cfg: SavingsConfig; onChange: (c: SavingsConfig) => void }) {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [amount, setAmount] = useState('')

  function addOrUpdate() {
    const amt = parseFloat(amount) || 0
    if (amt <= 0) return
    const existing = cfg.log.find(r => r.month === month)
    const log = existing
      ? cfg.log.map(r => (r.month === month ? { ...r, amount: amt } : r))
      : [...cfg.log, { id: genId(), month, amount: amt }]
    onChange({ ...cfg, log })
    setAmount('')
  }
  function remove(id: string) { onChange({ ...cfg, log: cfg.log.filter(r => r.id !== id) }) }

  const sorted = cfg.log.slice().sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <div className="text-[11px] text-gray-500 mb-1">เดือน</div>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-2 text-[13px] w-full" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] text-gray-500 mb-1">ออมจริง (บาท)</div>
          <input type="number" placeholder={String(cfg.monthlyTarget)} value={amount} onChange={e => setAmount(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-2 text-[13px] w-full text-right" />
        </div>
        <button onClick={addOrUpdate} className="bg-emerald-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-lg active:scale-95">บันทึก</button>
      </div>

      {sorted.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {sorted.map(r => {
            const short = cfg.monthlyTarget > 0 && r.amount < cfg.monthlyTarget
            return (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-[13px]">
                <span className="text-gray-600">{r.month}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${short ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(r.amount, 0)}</span>
                  <button onClick={() => remove(r.id)} className="text-red-400 text-[13px]">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
