import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import { formatCurrency, calcRetirementTarget, calcMonthlySaving, getAgeDetail } from '../utils/calculations'

export default function Retirement() {
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const plan = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const [showForm, setShowForm] = useState(!plan)

  const age = profile ? getAgeDetail(profile.dob).years : 35
  const target = plan ? calcRetirementTarget(plan.monthlyExpenseAtRetirement) : 0
  const progress = plan && target > 0 ? Math.min((plan.currentTotalAssets / target) * 100, 100) : 0
  const yearsLeft = plan ? Math.max(plan.targetRetirementAge - age, 0) : 0
  const monthlySaving = plan ? calcMonthlySaving(target, plan.currentTotalAssets, yearsLeft, plan.expectedReturnRate) : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="แผนเกษียณ" rightAction={{ label: plan ? 'แก้ไข' : '+ ตั้งค่า', onClick: () => setShowForm(true) }} />
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
            {/* Target banner */}
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
              <div className="text-sm opacity-80">
                เหลือเวลา {yearsLeft} ปี {Math.round((yearsLeft % 1) * 12)} เดือน
              </div>
            </div>

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
                    <div className="text-xl font-bold text-green-600">{formatCurrency(plan.currentTotalAssets)}</div>
                  </div>
                </div>
                <ProgressBar value={progress} max={100} color={progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-indigo-500' : 'bg-amber-500'} />
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>ยังขาด {formatCurrency(Math.max(target - plan.currentTotalAssets, 0))}</span>
                  <span>เป้า {formatCurrency(target)}</span>
                </div>
              </Card>
            </div>

            {/* Monthly saving */}
            <div className="mx-4 mt-3">
              <Card className="!bg-indigo-50">
                <CardTitle>ต้องออมต่อเดือน (อีก {yearsLeft} ปี)</CardTitle>
                <div className="flex items-baseline gap-1 mt-1">
                  <div className="text-3xl font-bold text-indigo-700">{formatCurrency(monthlySaving)}</div>
                  <div className="text-sm text-indigo-400">/ เดือน</div>
                </div>
                <div className="text-xs text-indigo-500 mt-1.5">
                  คำนวณที่ผลตอบแทนเฉลี่ย {plan.expectedReturnRate}% ต่อปี (4% Rule)
                </div>
              </Card>
            </div>

            {/* What If Simulator */}
            <SectionLabel>🧮 What If Simulator</SectionLabel>
            <div className="mx-4 mb-4">
              <WhatIfSimulator
                target={target}
                current={plan.currentTotalAssets}
                yearsLeft={yearsLeft}
                returnRate={plan.expectedReturnRate}
                monthly={monthlySaving}
              />
            </div>
          </>
        )}
        <div className="h-4" />
      </div>

      {showForm && <RetirementForm plan={plan} onClose={() => setShowForm(false)} />}
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
    monthlyExpenseAtRetirement: plan?.monthlyExpenseAtRetirement?.toString() ?? '40000',
    currentTotalAssets: plan?.currentTotalAssets?.toString() ?? '0',
    expectedReturnRate: plan?.expectedReturnRate?.toString() ?? '7',
    inflationRate: plan?.inflationRate?.toString() ?? '3',
  })

  async function save() {
    const data = {
      targetRetirementAge: parseInt(form.targetRetirementAge),
      monthlyExpenseAtRetirement: parseFloat(form.monthlyExpenseAtRetirement),
      currentTotalAssets: parseFloat(form.currentTotalAssets),
      expectedReturnRate: parseFloat(form.expectedReturnRate),
      inflationRate: parseFloat(form.inflationRate),
      updatedAt: new Date().toISOString(),
    }
    if (plan?.id) await db.retirementPlan.update(plan.id, data)
    else await db.retirementPlan.add(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">แผนเกษียณ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        {[
          ['อายุเกษียณ (ปี)', 'targetRetirementAge', '55'],
          ['ค่าใช้จ่าย/เดือนตอนเกษียณ', 'monthlyExpenseAtRetirement', '40000'],
          ['สินทรัพย์ทั้งหมดตอนนี้ (บาท)', 'currentTotalAssets', '0'],
          ['ผลตอบแทนคาดหวัง (%/ปี)', 'expectedReturnRate', '7'],
          ['เงินเฟ้อ (%/ปี)', 'inflationRate', '3'],
        ].map(([label, key, ph]) => (
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
