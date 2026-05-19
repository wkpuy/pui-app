import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { CondoMortgage } from '../db'
import { formatCurrency } from '../utils/calculations'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import Button from '../components/Button'

interface AmortRow {
  month: number
  year: number
  payment: number
  principal: number  // base principal portion only (from basePayment − interest)
  extra: number      // extra principal paid this month
  interest: number
  balance: number
}

function calcAmortization(loanAmount: number, annualRate: number, termMonths: number, getExtra: (month: number) => number): AmortRow[] {
  const monthlyRate = annualRate / 100 / 12
  const basePayment = monthlyRate > 0
    ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
    : loanAmount / termMonths

  const rows: AmortRow[] = []
  let balance = loanAmount
  let month = 0
  while (balance > 0 && month < termMonths * 2) {
    month++
    const interest = balance * monthlyRate
    const basePrincipal = Math.max(0, Math.min(basePayment - interest, balance))
    const remainingAfterBase = balance - basePrincipal
    const extra = Math.min(getExtra(month), remainingAfterBase)
    balance = balance - basePrincipal - extra
    rows.push({
      month,
      year: Math.ceil(month / 12),
      payment: basePrincipal + extra + interest,
      principal: basePrincipal,
      extra,
      interest,
      balance: Math.max(balance, 0),
    })
    if (balance <= 0) break
  }
  return rows
}

export default function Condo() {
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [extraSim, setExtraSim] = useState(0)
  const [editingMonth, setEditingMonth] = useState<number | null>(null)
  const [editExtraVal, setEditExtraVal] = useState('')
  const [monthlyExtras, setMonthlyExtras] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem('condo_monthly_extras') ?? '{}') } catch { return {} }
  })

  const condo = useLiveQuery(() => db.condoMortgage.toArray().then(r => r[0]))

  const rowsBaseline = useMemo(() => {
    if (!condo) return []
    return calcAmortization(
      condo.loanAmount, condo.interestRate, condo.loanTermYears * 12,
      () => 0
    )
  }, [condo])

  const rows = useMemo(() => {
    if (!condo) return []
    return calcAmortization(
      condo.loanAmount, condo.interestRate, condo.loanTermYears * 12,
      (m) => monthlyExtras[m] ?? condo.monthlyExtra
    )
  }, [condo, monthlyExtras])

  const rowsSim = useMemo(() => {
    if (!condo) return []
    return calcAmortization(
      condo.loanAmount, condo.interestRate, condo.loanTermYears * 12,
      (m) => (monthlyExtras[m] ?? condo.monthlyExtra) + extraSim
    )
  }, [condo, extraSim, monthlyExtras])

  function startEditExtra(month: number) {
    setEditingMonth(month)
    setEditExtraVal(String(monthlyExtras[month] ?? condo?.monthlyExtra ?? 0))
  }

  function confirmEditExtra(month: number) {
    const val = parseFloat(editExtraVal) || 0
    const next = { ...monthlyExtras, [month]: val }
    localStorage.setItem('condo_monthly_extras', JSON.stringify(next))
    setMonthlyExtras(next)
    setEditingMonth(null)
  }

  // Active = with slider applied (if slider > 0); else just monthlyExtras
  const activeRows = extraSim > 0 ? rowsSim : rows
  const baselineMonths = rowsBaseline.length
  const baselineInterest = rowsBaseline.reduce((s, r) => s + r.interest, 0)
  const activeInterest = activeRows.reduce((s, r) => s + r.interest, 0)
  const monthsSaved = baselineMonths - activeRows.length
  const interestSaved = baselineInterest - activeInterest
  const hasAnyExtra = monthsSaved > 0

  // Payoff date based on activeRows length + start date
  const payoffDate = condo?.startDate && activeRows.length > 0 ? (() => {
    const d = new Date(condo.startDate)
    d.setMonth(d.getMonth() + activeRows.length - 1)
    return d
  })() : null
  const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const payoffLabel = payoffDate ? `${THAI_MONTHS_SHORT[payoffDate.getMonth()]} ${payoffDate.getFullYear() + 543}` : null

  const paidMonths = (() => {
    if (!condo?.startDate) return 0
    const start = new Date(condo.startDate)
    const now = new Date()
    return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth())
  })()

  const currentRow = rows[paidMonths - 1]
  const paidPrincipal = condo ? condo.loanAmount - (currentRow?.balance ?? condo.loanAmount) : 0
  const progressPct = condo ? (paidPrincipal / condo.loanAmount) * 100 : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <div className="bg-white flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">‹</button>
        <div className="flex-1 text-[17px] font-bold text-gray-900">สินเชื่อบ้าน / คอนโด</div>
        <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95">
          {condo ? 'แก้ไข' : '+ เพิ่ม'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!condo ? (
          <div className="text-center py-16 text-gray-400 px-8">
            <div className="text-5xl mb-4">🏠</div>
            <div className="font-semibold text-gray-600 mb-4">ยังไม่มีข้อมูลสินเชื่อ</div>
            <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-semibold active:scale-95">
              เพิ่มข้อมูลสินเชื่อ
            </button>
          </div>
        ) : (
          <>
            {/* Summary banner */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-5 py-5 text-white">
              <div className="text-xs opacity-75 mb-0.5">{condo.propertyName}</div>
              <div className="text-2xl font-bold mb-0.5">{condo.bankName}</div>
              <div className="text-sm opacity-80">วงเงิน {formatCurrency(condo.loanAmount)} · {condo.interestRate}%/ปี · {condo.loanTermYears} ปี</div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white/15 rounded-xl p-2 text-center">
                  <div className="text-[11px] opacity-75">ผ่อน/เดือน</div>
                  <div className="text-[13px] font-bold">{formatCurrency(rows[0]?.payment ?? 0, 0)}</div>
                </div>
                <div className="bg-white/15 rounded-xl p-2 text-center">
                  <div className="text-[11px] opacity-75">ดอกเบี้ยรวม</div>
                  <div className="text-[13px] font-bold">{formatCurrency(activeInterest, 0)}</div>
                </div>
                <div className="bg-white/15 rounded-xl p-2 text-center">
                  <div className="text-[11px] opacity-75">ปิดหนี้</div>
                  <div className="text-[13px] font-bold">{activeRows.length} เดือน</div>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mx-4 mt-3">
              <Card>
                <CardTitle>ความคืบหน้าการผ่อน</CardTitle>
                <div className="flex justify-between items-end mt-1 mb-2">
                  <div>
                    <div className="text-xl font-bold text-gray-900">{progressPct.toFixed(1)}%</div>
                    <div className="text-[12px] text-gray-400">จ่ายไปแล้ว {paidMonths} งวด</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-green-600">{formatCurrency(paidPrincipal, 0)}</div>
                    <div className="text-[11px] text-gray-400">เงินต้นที่จ่ายไป</div>
                  </div>
                </div>
                <ProgressBar value={progressPct} max={100} color={progressPct >= 50 ? 'bg-green-500' : 'bg-blue-500'} />
                {currentRow && (
                  <div className="text-[12px] text-gray-400 mt-1.5">คงเหลือ {formatCurrency(currentRow.balance, 0)}</div>
                )}
              </Card>
            </div>

            {/* Extra payment simulator */}
            <SectionLabel>💡 จ่ายเพิ่มต่อเดือน</SectionLabel>
            <div className="mx-4">
              <Card>
                <div className="flex items-center gap-3 mb-2">
                  <input type="range" min={0} max={50000} step={1000} value={extraSim}
                    onChange={e => setExtraSim(parseInt(e.target.value))}
                    className="flex-1 accent-indigo-600" />
                  <div className="text-[15px] font-bold text-indigo-600 w-24 text-right">{formatCurrency(extraSim)}</div>
                </div>
                {hasAnyExtra && (
                  <div className="bg-green-50 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="text-[13px] font-semibold text-green-800">ผลที่ได้ (เทียบกับไม่จ่ายเพิ่ม)</div>
                    <div className="text-[13px] text-green-700">⏱️ ปิดหนี้เร็วขึ้น <b>{monthsSaved} เดือน</b> ({Math.floor(monthsSaved / 12)} ปี {monthsSaved % 12} เดือน)</div>
                    <div className="text-[13px] text-green-700">💰 ประหยัดดอกเบี้ย <b>{formatCurrency(interestSaved, 0)}</b></div>
                    {payoffLabel && (
                      <div className="text-[13px] text-green-700">📅 จะปิดหนี้: <b>{payoffLabel}</b> (งวดที่ {activeRows.length})</div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Amortization table toggle */}
            <div className="mx-4 mt-3 mb-4">
              <button
                onClick={() => setShowTable(v => !v)}
                className="w-full bg-white rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-indigo-600 shadow-sm active:scale-95 flex items-center justify-between"
              >
                <span>ตารางการผ่อนชำระ</span>
                <span>{showTable ? '▲' : '▼'}</span>
              </button>

              {showTable && (
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-2">
                  <div className="grid grid-cols-[4rem_1fr_1fr_1fr_1fr] gap-1 px-3 py-2.5 border-b border-gray-100 bg-gray-50 sticky top-0">
                    <div className="text-[10px] font-bold text-gray-500">เดือน</div>
                    <div className="text-[10px] font-bold text-gray-500 text-right">เงินต้น</div>
                    <div className="text-[10px] font-bold text-gray-500 text-right">ดอกเบี้ย</div>
                    <div className="text-[10px] font-bold text-indigo-500 text-right">จ่ายเพิ่ม ✏️</div>
                    <div className="text-[10px] font-bold text-gray-500 text-right">คงเหลือ</div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {activeRows.map((row, idx) => {
                      const isEditing = editingMonth === row.month
                      const rowDate = condo?.startDate ? (() => {
                        const d = new Date(condo.startDate)
                        d.setMonth(d.getMonth() + (row.month - 1))
                        return `${THAI_MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`
                      })() : String(row.month)
                      return (
                        <div key={row.month}
                          className={`grid grid-cols-[4rem_1fr_1fr_1fr_1fr] gap-1 px-3 py-2 ${idx < activeRows.length - 1 ? 'border-b border-gray-50' : ''} ${row.month === paidMonths ? 'bg-indigo-50' : ''}`}
                        >
                          <div className="text-[10px] text-gray-600 font-medium leading-tight">{rowDate}</div>
                          <div className="text-[11px] text-right text-green-600">{formatCurrency(row.principal, 0)}</div>
                          <div className="text-[11px] text-right text-red-400">{formatCurrency(row.interest, 0)}</div>
                          <div className="text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editExtraVal}
                                autoFocus
                                onChange={e => setEditExtraVal(e.target.value)}
                                onBlur={() => confirmEditExtra(row.month)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmEditExtra(row.month); if (e.key === 'Escape') setEditingMonth(null) }}
                                className="w-full text-[11px] text-right border border-indigo-300 rounded px-1 py-0.5 bg-white"
                              />
                            ) : (
                              <button
                                onClick={() => startEditExtra(row.month)}
                                className={`text-[11px] text-right w-full ${row.extra > 0 ? 'text-indigo-600 font-semibold' : 'text-gray-300'}`}
                              >
                                {row.extra > 0 ? formatCurrency(row.extra, 0) : '—'}
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] text-right text-gray-700">{formatCurrency(row.balance, 0)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        <div className="h-4" />
      </div>

      {showForm && <CondoForm condo={condo ?? null} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function CondoForm({ condo, onClose }: { condo: CondoMortgage | null; onClose: () => void }) {
  const [form, setForm] = useState({
    propertyName: condo?.propertyName ?? '',
    bankName: condo?.bankName ?? '',
    totalPrice: condo?.totalPrice?.toString() ?? '',
    downPayment: condo?.downPayment?.toString() ?? '',
    loanAmount: condo?.loanAmount?.toString() ?? '',
    interestRate: condo?.interestRate?.toString() ?? '4',
    loanTermMonths: condo?.loanTermYears ? String(condo.loanTermYears * 12) : '360',
    startDate: condo?.startDate ?? new Date().toISOString().slice(0, 7) + '-01',
    monthlyExtra: condo?.monthlyExtra?.toString() ?? '0',
    notes: condo?.notes ?? '',
  })

  function onPriceChange(key: 'totalPrice' | 'downPayment', val: string) {
    const updates: any = { [key]: val }
    const price = key === 'totalPrice' ? parseFloat(val) : parseFloat(form.totalPrice)
    const down = key === 'downPayment' ? parseFloat(val) : parseFloat(form.downPayment)
    if (!isNaN(price) && !isNaN(down)) {
      updates.loanAmount = String(Math.max(price - down, 0))
    }
    setForm(v => ({ ...v, ...updates }))
  }

  async function save() {
    if (!form.propertyName || !form.loanAmount) return
    const termMonths = parseInt(form.loanTermMonths) || 360
    const data = {
      propertyName: form.propertyName,
      bankName: form.bankName,
      totalPrice: parseFloat(form.totalPrice) || 0,
      downPayment: parseFloat(form.downPayment) || 0,
      loanAmount: parseFloat(form.loanAmount),
      interestRate: parseFloat(form.interestRate),
      loanTermYears: termMonths / 12,
      startDate: form.startDate,
      monthlyExtra: parseFloat(form.monthlyExtra) || 0,
      notes: form.notes || undefined,
    }
    if (condo?.id) await db.condoMortgage.update(condo.id, data)
    else await db.condoMortgage.add(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{condo ? 'แก้ไข' : 'เพิ่ม'}สินเชื่อบ้าน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input placeholder="ชื่อทรัพย์ (เช่น คอนโด ABC)" value={form.propertyName}
          onChange={e => setForm(v => ({ ...v, propertyName: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <input placeholder="ธนาคารที่กู้" value={form.bankName}
          onChange={e => setForm(v => ({ ...v, bankName: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ราคาทรัพย์ (บาท)</div>
            <input type="number" value={form.totalPrice} onChange={e => onPriceChange('totalPrice', e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">เงินดาวน์ (บาท)</div>
            <input type="number" value={form.downPayment} onChange={e => onPriceChange('downPayment', e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">วงเงินกู้ (คำนวณอัตโนมัติ)</div>
          <input type="number" value={form.loanAmount} onChange={e => setForm(v => ({ ...v, loanAmount: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full bg-gray-50" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ดอกเบี้ย %/ปี</div>
            <input type="number" step="0.1" value={form.interestRate}
              onChange={e => setForm(v => ({ ...v, interestRate: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">จำนวนงวด (เดือน)</div>
            <input type="number" value={form.loanTermMonths}
              onChange={e => setForm(v => ({ ...v, loanTermMonths: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            {form.loanTermMonths && (
              <div className="text-[10px] text-gray-400 mt-0.5 ml-1">= {(parseInt(form.loanTermMonths) / 12).toFixed(1)} ปี</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">วันที่เริ่มผ่อน</div>
          <input type="date" value={form.startDate}
            onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">จ่ายเพิ่มต่อเดือน (บาท)</div>
          <input type="number" placeholder="0" value={form.monthlyExtra}
            onChange={e => setForm(v => ({ ...v, monthlyExtra: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>
        <Button onClick={save}>
          บันทึก
        </Button>
      </div>
    </div>
  )
}
