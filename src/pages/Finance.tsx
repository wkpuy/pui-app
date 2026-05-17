import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import { formatCurrency } from '../utils/calculations'
import type { FinanceRecord, Installment } from '../db/types'

const CATEGORIES_EXPENSE = [
  'อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'สุขภาพ', 'ท่องเที่ยว',
  'บ้าน', 'ประกัน', 'ลงทุน', 'ครอบครัว', 'Subscription', 'อื่นๆ',
]
const CATEGORIES_INCOME = ['เงินเดือน', 'โบนัส', 'ปันผล', 'ดอกเบี้ย', 'Freelance', 'อื่นๆ']

const CAT_ICONS: Record<string, string> = {
  อาหาร: '🍜', เดินทาง: '🚗', ช้อปปิ้ง: '🛍️', สุขภาพ: '💊', ท่องเที่ยว: '✈️',
  บ้าน: '🏠', ประกัน: '🛡️', ลงทุน: '📈', ครอบครัว: '👨‍👩‍👧', Subscription: '📱', อื่นๆ: '📦',
  เงินเดือน: '💼', โบนัส: '🎁', ปันผล: '💰', ดอกเบี้ย: '🏦', Freelance: '💻',
}

type Tab = 'overview' | 'records' | 'yearly' | 'installments' | 'emergency'

export default function Finance() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<FinanceRecord | null>(null)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const records = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().toArray())
  const emergency = useLiveQuery(() => db.emergencyFund.toArray().then(r => r[0]))
  const installments = useLiveQuery(() => db.installments.orderBy('startDate').reverse().toArray())

  const monthRecords = records?.filter(r => r.date.startsWith(month)) ?? []
  const income = monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const expense = monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const net = income - expense

  const expenseByCategory = monthRecords
    .filter(r => r.type === 'expense')
    .reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + r.amount; return acc }, {} as Record<string, number>)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="รายรับ-รายจ่าย" rightAction={{ label: '＋ เพิ่ม', onClick: () => { setEditRecord(null); setShowForm(true) } }} />

      {/* Month selector */}
      <div className="bg-white px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-[14px] font-semibold text-gray-700 border-none outline-none bg-transparent" />
        <div className="flex gap-2">
          <button onClick={() => navigate('/salary')}
            className="text-[12px] font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg active:scale-95">💼 เงินเดือน</button>
          <button onClick={() => navigate('/condo')}
            className="text-[12px] font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95">🏠 สินเชื่อ</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {([['overview', 'ภาพรวม'], ['records', 'รายการ'], ['yearly', 'รายปี'], ['installments', 'ผ่อนชำระ'], ['emergency', 'ฉุกเฉิน']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab
            income={income} expense={expense} net={net}
            expenseByCategory={expenseByCategory}
          />
        )}
        {tab === 'records' && (
          <RecordsTab
            records={monthRecords}
            onEdit={(r) => { setEditRecord(r); setShowForm(true) }}
          />
        )}
        {tab === 'yearly' && <YearlyTab records={records ?? []} />}
        {tab === 'installments' && <InstallmentsTab installments={installments ?? []} />}
        {tab === 'emergency' && <EmergencyFundTab emergency={emergency} monthlyExpense={expense} />}
      </div>

      {showForm && (
        <FinanceForm
          editRecord={editRecord}
          onClose={() => { setShowForm(false); setEditRecord(null) }}
        />
      )}
    </div>
  )
}

function OverviewTab({ income, expense, net, expenseByCategory }: {
  income: number; expense: number; net: number; expenseByCategory: Record<string, number>
}) {
  return (
    <>
      <div className="px-4 pt-3 grid grid-cols-3 gap-2">
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รายรับ</div>
          <div className="text-[15px] font-bold text-green-600">{formatCurrency(income)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รายจ่าย</div>
          <div className="text-[15px] font-bold text-red-500">{formatCurrency(expense)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">คงเหลือ</div>
          <div className={`text-[15px] font-bold ${net >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatCurrency(net)}</div>
        </Card>
      </div>

      {Object.keys(expenseByCategory).length > 0 && (
        <>
          <SectionLabel>หมวดรายจ่าย</SectionLabel>
          <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
            {Object.entries(expenseByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt], idx, arr) => (
                <div key={cat} className={`px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-medium text-gray-700">{CAT_ICONS[cat] ?? '📦'} {cat}</span>
                    <span className="text-[14px] font-bold text-gray-900">{formatCurrency(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={expense} color="bg-red-400" />
                </div>
              ))}
          </div>
        </>
      )}

      <div className="mx-4 mb-4">
        <Card className="!bg-blue-50">
          <div className="text-[13px] font-semibold text-blue-700 mb-2">📧 Sync จาก Gmail</div>
          <div className="text-[12px] text-blue-600 mb-3">อ่านอีเมลโอนเงิน กสิกร/กรุงเทพ อัตโนมัติ</div>
          <button className="bg-blue-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 w-full">
            Sync ธนาคาร (ต้องต่อ Google)
          </button>
        </Card>
      </div>
    </>
  )
}

function RecordsTab({ records, onEdit }: { records: FinanceRecord[]; onEdit: (r: FinanceRecord) => void }) {
  return (
    <div className="px-4 pt-3 flex flex-col gap-2 pb-4">
      {records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <div>ยังไม่มีรายการ</div>
        </div>
      ) : records.map(r => (
        <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${r.type === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
              {CAT_ICONS[r.category] ?? (r.type === 'income' ? '💚' : '🔴')}
            </div>
            <div>
              <div className="text-[14px] font-semibold text-gray-900">{r.description || r.category}</div>
              <div className="text-[11px] text-gray-400">{r.date} · {r.category}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[15px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
              {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
            </div>
            <div className="flex gap-1">
              <button onClick={() => onEdit(r)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
              <button onClick={() => { if (confirm('ลบรายการนี้?')) db.financeRecords.delete(r.id!) }}
                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function YearlyTab({ records }: { records: FinanceRecord[] }) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [drillMonth, setDrillMonth] = useState<string | null>(null)

  const years = [...new Set(records.map(r => parseInt(r.date.slice(0, 4))))].sort((a, b) => b - a)

  const yearRecords = records.filter(r => r.date.startsWith(selectedYear.toString()))
  const monthSummary = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    const key = `${selectedYear}-${m}`
    const mrs = yearRecords.filter(r => r.date.startsWith(key))
    return {
      month: key,
      label: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][i],
      income: mrs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0),
      expense: mrs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
      records: mrs,
    }
  })

  const totalIncome = yearRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = yearRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)

  const drillData = drillMonth ? monthSummary.find(m => m.month === drillMonth) : null

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Year selector */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {(years.length > 0 ? years : [currentYear]).map(y => (
          <button key={y} onClick={() => { setSelectedYear(y); setDrillMonth(null) }}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-semibold ${selectedYear === y ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'}`}>
            {y}
          </button>
        ))}
      </div>

      {/* Year total */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">รายรับ/ปี</div>
          <div className="text-[14px] font-bold text-green-600">{formatCurrency(totalIncome, 0)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">รายจ่าย/ปี</div>
          <div className="text-[14px] font-bold text-red-500">{formatCurrency(totalExpense, 0)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">เก็บได้/ปี</div>
          <div className={`text-[14px] font-bold ${totalIncome - totalExpense >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
            {formatCurrency(totalIncome - totalExpense, 0)}
          </div>
        </Card>
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="text-[13px] font-bold text-gray-600 mb-3">รายเดือน</div>
        <div className="flex gap-1 items-end h-20">
          {monthSummary.map(m => {
            const maxVal = Math.max(...monthSummary.map(x => Math.max(x.income, x.expense)), 1)
            const expH = Math.round((m.expense / maxVal) * 72)
            const incH = Math.round((m.income / maxVal) * 72)
            return (
              <button key={m.month} onClick={() => setDrillMonth(drillMonth === m.month ? null : m.month)}
                className={`flex-1 flex flex-col items-center gap-0.5 ${drillMonth === m.month ? 'opacity-100' : 'opacity-80'}`}
              >
                <div className="w-full flex gap-0.5 items-end justify-center h-16">
                  <div style={{ height: incH || 2 }} className="flex-1 bg-green-400 rounded-t-sm" />
                  <div style={{ height: expH || 2 }} className="flex-1 bg-red-400 rounded-t-sm" />
                </div>
                <div className={`text-[9px] ${drillMonth === m.month ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>{m.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Drill-down month detail */}
      {drillData && (
        <div className="mb-4">
          <div className="text-[13px] font-bold text-gray-600 mb-2 px-1">{drillData.label} — {drillData.records.length} รายการ</div>
          <div className="flex flex-col gap-2">
            {drillData.records.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{CAT_ICONS[r.category] ?? '📦'}</span>
                  <div>
                    <div className="text-[13px] font-semibold text-gray-800">{r.description || r.category}</div>
                    <div className="text-[11px] text-gray-400">{r.date}</div>
                  </div>
                </div>
                <div className={`text-[14px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InstallmentsTab({ installments }: { installments: Installment[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Installment | null>(null)

  const activeInstallments = installments.filter(i => i.paidInstallments < i.totalInstallments)
  const totalMonthly = activeInstallments.reduce((s, i) => s + i.monthlyAmount, 0)

  // Check subscription renewals (next 30 days)
  const upcomingRenewals = installments.filter(inst => {
    if (inst.totalInstallments > 24) return false // long-term not subscription
    const start = new Date(inst.startDate)
    const today = new Date()
    const daysElapsed = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const cycleDays = 30
    const daysUntilRenewal = cycleDays - (daysElapsed % cycleDays)
    return daysUntilRenewal <= 30
  })

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] text-gray-500">ผ่อนต่อเดือนรวม</div>
          <div className="text-2xl font-bold text-red-500">{formatCurrency(totalMonthly)}</div>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95">
          ＋ เพิ่ม
        </button>
      </div>

      {upcomingRenewals.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-3 mb-3">
          <div className="text-[13px] font-semibold text-amber-700 mb-1.5">🔔 ใกล้ต่ออายุ</div>
          {upcomingRenewals.map(i => (
            <div key={i.id} className="text-[12px] text-amber-800">• {i.name} — {formatCurrency(i.monthlyAmount)}</div>
          ))}
        </div>
      )}

      {installments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💳</div>
          <div>ยังไม่มีรายการผ่อน</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {installments.map(inst => {
            const remaining = inst.totalInstallments - inst.paidInstallments
            const pct = (inst.paidInstallments / inst.totalInstallments) * 100
            const isDone = remaining <= 0
            return (
              <div key={inst.id} className={`bg-white rounded-2xl p-4 shadow-sm ${isDone ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900">{inst.name}</div>
                    <div className="text-[12px] text-gray-400">{inst.category} · เริ่ม {inst.startDate.slice(0, 7)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(inst); setShowForm(true) }}
                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
                    <button onClick={() => { if (confirm('ลบ?')) db.installments.delete(inst.id!) }}
                      className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] text-gray-600">{isDone ? '✅ ปิดแล้ว' : `เหลือ ${remaining} งวด`}</span>
                  <span className="text-[14px] font-bold text-indigo-600">{formatCurrency(inst.monthlyAmount)}/เดือน</span>
                </div>
                <ProgressBar value={pct} max={100} color={isDone ? 'bg-green-500' : 'bg-indigo-500'} />
                <div className="text-[11px] text-gray-400 mt-1">
                  {inst.paidInstallments}/{inst.totalInstallments} งวด · รวม {formatCurrency(inst.totalAmount)}
                </div>
                {!isDone && (
                  <button
                    onClick={() => db.installments.update(inst.id!, { paidInstallments: inst.paidInstallments + 1 })}
                    className="mt-2 text-[12px] font-semibold text-indigo-600 active:scale-95"
                  >
                    + บันทึกชำระงวดถัดไป
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && <InstallmentForm editItem={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

function InstallmentForm({ editItem, onClose }: { editItem: Installment | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editItem?.name ?? '',
    totalAmount: editItem?.totalAmount?.toString() ?? '',
    monthlyAmount: editItem?.monthlyAmount?.toString() ?? '',
    totalInstallments: editItem?.totalInstallments?.toString() ?? '',
    paidInstallments: editItem?.paidInstallments?.toString() ?? '0',
    startDate: editItem?.startDate ?? new Date().toISOString().slice(0, 10),
    category: editItem?.category ?? 'ช้อปปิ้ง',
    source: editItem?.source ?? 'credit_card',
  })

  async function save() {
    if (!form.name || !form.monthlyAmount) return
    const data = {
      name: form.name,
      totalAmount: parseFloat(form.totalAmount) || (parseFloat(form.monthlyAmount) * parseInt(form.totalInstallments)),
      monthlyAmount: parseFloat(form.monthlyAmount),
      totalInstallments: parseInt(form.totalInstallments) || 1,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate,
      category: form.category,
      source: form.source,
    }
    if (editItem?.id) await db.installments.update(editItem.id, data)
    else await db.installments.add(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'เพิ่ม'}รายการผ่อน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input placeholder="ชื่อรายการ (เช่น iPhone 16, Netflix)" value={form.name}
          onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ยอดรวม (บาท)</div>
            <input type="number" value={form.totalAmount}
              onChange={e => setForm(v => ({ ...v, totalAmount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ต่อเดือน (บาท)</div>
            <input type="number" value={form.monthlyAmount}
              onChange={e => setForm(v => ({ ...v, monthlyAmount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">จำนวนงวดทั้งหมด</div>
            <input type="number" value={form.totalInstallments}
              onChange={e => setForm(v => ({ ...v, totalInstallments: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ชำระไปแล้ว (งวด)</div>
            <input type="number" value={form.paidInstallments}
              onChange={e => setForm(v => ({ ...v, paidInstallments: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">วันที่เริ่ม</div>
          <input type="date" value={form.startDate}
            onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>
        <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {CATEGORIES_EXPENSE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}

function EmergencyFundTab({ emergency, monthlyExpense }: { emergency: any; monthlyExpense: number }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    targetMonths: emergency?.targetMonths?.toString() ?? '6',
    currentAmount: emergency?.currentAmount?.toString() ?? '',
  })

  const target = (emergency?.targetMonths ?? 6) * monthlyExpense
  const current = emergency?.currentAmount ?? 0
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0

  async function save() {
    const data = { targetMonths: parseInt(form.targetMonths), currentAmount: parseFloat(form.currentAmount), updatedAt: new Date().toISOString() }
    if (emergency?.id) await db.emergencyFund.update(emergency.id, data)
    else await db.emergencyFund.add(data)
    setShowForm(false)
  }

  return (
    <div className="px-4 pt-3">
      <Card>
        <CardTitle>เงินสำรองฉุกเฉิน</CardTitle>
        <div className="flex justify-between items-end mb-3 mt-1">
          <div>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(current)}</div>
            <div className="text-xs text-gray-400 mt-0.5">เป้าหมาย {emergency?.targetMonths ?? 6} เดือน = {formatCurrency(target)}</div>
          </div>
          <div className="text-2xl font-bold text-indigo-600">{pct.toFixed(0)}%</div>
        </div>
        <ProgressBar value={pct} max={100} color={pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'} />
        <div className="text-xs text-gray-400 mt-1.5">
          {pct >= 100 ? '✅ ครบแล้ว' : `ยังขาด ${formatCurrency(target - current)}`}
        </div>
        <button onClick={() => setShowForm(v => !v)} className="mt-3 text-indigo-600 text-sm font-semibold">
          แก้ไขข้อมูล
        </button>
        {showForm && (
          <div className="mt-3 flex flex-col gap-2">
            <input type="number" placeholder="เป้าหมาย (เดือน)" value={form.targetMonths}
              onChange={e => setForm(v => ({ ...v, targetMonths: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            <input type="number" placeholder="มีอยู่ตอนนี้ (บาท)" value={form.currentAmount}
              onChange={e => setForm(v => ({ ...v, currentAmount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            <button onClick={save} className="bg-indigo-600 text-white font-bold py-2.5 rounded-xl text-sm active:scale-95">
              บันทึก
            </button>
          </div>
        )}
      </Card>
      <div className="h-4" />
    </div>
  )
}

function FinanceForm({ editRecord, onClose }: { editRecord: FinanceRecord | null; onClose: () => void }) {
  const [form, setForm] = useState({
    date: editRecord?.date ?? new Date().toISOString().slice(0, 10),
    type: (editRecord?.type ?? 'expense') as 'income' | 'expense',
    amount: editRecord?.amount?.toString() ?? '',
    category: editRecord?.category ?? 'อาหาร',
    description: editRecord?.description ?? '',
    source: editRecord?.source ?? 'manual',
  })

  async function save() {
    if (!form.amount) return
    const data = {
      date: form.date, type: form.type,
      amount: parseFloat(form.amount),
      category: form.category,
      description: form.description,
      source: form.source as FinanceRecord['source'],
    }
    if (editRecord?.id) await db.financeRecords.update(editRecord.id, data)
    else await db.financeRecords.add(data)
    onClose()
  }

  const cats = form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editRecord ? 'แก้ไข' : 'เพิ่ม'}รายการ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="flex gap-2">
          {(['expense', 'income'] as const).map(t => (
            <button key={t} onClick={() => setForm(v => ({ ...v, type: t, category: t === 'income' ? 'เงินเดือน' : 'อาหาร' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${form.type === t ? (t === 'income' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600') : 'border-gray-100 text-gray-400'}`}>
              {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
            </button>
          ))}
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <input type="number" placeholder="จำนวนเงิน (บาท)" value={form.amount}
          onChange={e => setForm(v => ({ ...v, amount: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {cats.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        <input placeholder="รายละเอียด (ไม่บังคับ)" value={form.description}
          onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          {editRecord ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
