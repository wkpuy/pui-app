import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar } from '../components/Card'
import { formatCurrency } from '../utils/calculations'
import type { FinanceRecord } from '../db/types'

const CATEGORIES_EXPENSE = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'สุขภาพ', 'ท่องเที่ยว', 'บ้าน', 'ประกัน', 'ลงทุน', 'อื่นๆ']
const CATEGORIES_INCOME = ['เงินเดือน', 'โบนัส', 'ปันผล', 'ดอกเบี้ย', 'อื่นๆ']

export default function Finance() {
  const [tab, setTab] = useState<'overview' | 'records' | 'emergency'>('overview')
  const [showForm, setShowForm] = useState(false)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const records = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().toArray())
  const emergency = useLiveQuery(() => db.emergencyFund.toArray().then(r => r[0]))

  const monthRecords = records?.filter(r => r.date.startsWith(month)) ?? []
  const income = monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const expense = monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const net = income - expense

  // Category breakdown
  const expenseByCategory = monthRecords
    .filter(r => r.type === 'expense')
    .reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + r.amount; return acc }, {} as Record<string, number>)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="รายรับ-รายจ่าย" rightAction={{ label: '＋ เพิ่ม', onClick: () => setShowForm(true) }} />

      {/* Month selector */}
      <div className="bg-white px-4 py-2 border-b border-gray-100 flex items-center gap-2">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-[14px] font-semibold text-gray-700 border-none outline-none bg-transparent" />
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        {[['overview', 'ภาพรวม'], ['records', 'รายการ'], ['emergency', 'เงินฉุกเฉิน']] .map(([t, l]) => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`flex-1 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <>
            {/* Summary */}
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

            {/* Expense breakdown */}
            {Object.keys(expenseByCategory).length > 0 && (
              <>
                <SectionLabel>หมวดรายจ่าย</SectionLabel>
                <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
                  {Object.entries(expenseByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt], idx, arr) => (
                      <div key={cat} className={`px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[14px] font-medium text-gray-700">{cat}</span>
                          <span className="text-[14px] font-bold text-gray-900">{formatCurrency(amt)}</span>
                        </div>
                        <ProgressBar value={amt} max={expense} color="bg-red-400" />
                      </div>
                    ))}
                </div>
              </>
            )}

            {/* Sync from Google */}
            <div className="mx-4 mb-4">
              <Card className="!bg-blue-50">
                <div className="text-[13px] font-semibold text-blue-700 mb-2">📧 Sync จาก Gmail</div>
                <div className="text-[12px] text-blue-600 mb-3">อ่านอีเมลโอนเงิน กสิกร/กรุงเทพ อัตโนมัติ</div>
                <button className="bg-blue-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 w-full">
                  Sync ธนาคาร (ต้องต่อ Google)
                </button>
              </Card>
            </div>
            <div className="mx-4 mb-4">
              <Card className="!bg-purple-50">
                <div className="text-[13px] font-semibold text-purple-700 mb-2">📄 บัตรเครดิต PDF</div>
                <div className="text-[12px] text-purple-600 mb-3">อ่าน statement PDF จาก Google Drive</div>
                <button className="bg-purple-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 w-full">
                  เลือกไฟล์จาก Drive
                </button>
              </Card>
            </div>
          </>
        )}

        {tab === 'records' && (
          <div className="px-4 pt-3 flex flex-col gap-2 pb-4">
            {monthRecords.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📭</div>
                <div>ยังไม่มีรายการ</div>
              </div>
            ) : monthRecords.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${r.type === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {r.type === 'income' ? '💚' : '🔴'}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900">{r.description || r.category}</div>
                    <div className="text-[11px] text-gray-400">{r.date} · {r.category}</div>
                  </div>
                </div>
                <div className={`text-[15px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'emergency' && (
          <EmergencyFundTab emergency={emergency} monthlyExpense={expense} />
        )}
      </div>

      {showForm && <FinanceForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function EmergencyFundTab({ emergency, monthlyExpense }: { emergency: any; monthlyExpense: number }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ targetMonths: emergency?.targetMonths?.toString() ?? '6', currentAmount: emergency?.currentAmount?.toString() ?? '' })

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

function FinanceForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense' as 'income' | 'expense',
    amount: '', category: 'อาหาร', description: '', source: 'manual',
  })

  async function save() {
    if (!form.amount) return
    await db.financeRecords.add({
      date: form.date, type: form.type,
      amount: parseFloat(form.amount),
      category: form.category,
      description: form.description,
      source: form.source as FinanceRecord['source'],
    })
    onClose()
  }

  const cats = form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">เพิ่มรายการ</h3>
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
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="รายละเอียด (ไม่บังคับ)" value={form.description}
          onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}
