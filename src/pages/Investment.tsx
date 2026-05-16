import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Dividend } from '../db'
import PageHeader from '../components/PageHeader'
import { formatCurrency, formatPct } from '../utils/calculations'
import type { InvestmentType } from '../db/types'

const TYPE_LABELS: Record<InvestmentType, string> = {
  thai_stock: 'หุ้นไทย', foreign_stock: 'หุ้นต่างประเทศ',
  fund: 'กองทุน', insurance: 'ประกัน', savings: 'ออมทรัพย์', other: 'อื่นๆ',
}
const TYPE_ICONS: Record<InvestmentType, string> = {
  thai_stock: '📈', foreign_stock: '🌏', fund: '🏦', insurance: '🛡️', savings: '💵', other: '📦',
}

type Tab = 'all' | InvestmentType

export default function Investment() {
  const [tab, setTab] = useState<Tab>('all')
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const investments = useLiveQuery(() => db.investments.orderBy('type').toArray())
  const dividends = useLiveQuery(() => db.dividends.toArray())
  const filtered = investments?.filter(i => tab === 'all' || i.type === tab) ?? []
  const totalCost = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
  const totalValue = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
  const totalGain = totalValue - totalCost
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const selectedDividends = dividends?.filter(d => d.investmentId === selectedId) ?? []

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title="การลงทุน"
        rightAction={{ label: '＋ เพิ่ม', onClick: () => setShowForm(true) }}
      />
      <div className="flex-1 overflow-y-auto">
        {/* Total banner */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-5 text-white">
          <div className="text-xs opacity-80 mb-1">มูลค่ารวม</div>
          <div className="text-3xl font-bold mb-1">{formatCurrency(totalValue)}</div>
          <div className="text-sm opacity-90">
            ต้นทุน {formatCurrency(totalCost)} &nbsp;·&nbsp;
            <span className={totalGain >= 0 ? 'text-green-200' : 'text-red-200'}>
              {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} ({formatPct(gainPct)})
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
          {(['all', 'thai_stock', 'foreign_stock', 'fund', 'insurance', 'savings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
              }`}
            >
              {t === 'all' ? 'ทั้งหมด' : TYPE_LABELS[t as InvestmentType]}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <div>ยังไม่มีข้อมูลการลงทุน</div>
          </div>
        ) : (
          <div className="mx-4 mt-3 bg-white rounded-2xl overflow-hidden shadow-sm">
            {filtered.map((inv, idx) => {
              const gain = inv.currentValue - inv.costBasis
              const pct = inv.costBasis > 0 ? (gain / inv.costBasis) * 100 : 0
              return (
                <div key={inv.id}>
                  {idx > 0 && <div className="h-px bg-gray-50 mx-4" />}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50"
                    onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id!)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg">
                        {TYPE_ICONS[inv.type]}
                      </div>
                      <div className="text-left">
                        <div className="text-[15px] font-semibold text-gray-900">{inv.name}</div>
                        <div className="text-xs text-gray-400">
                          {inv.ticker && `${inv.ticker} · `}ต้นทุน {formatCurrency(inv.costBasis)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px] font-bold text-gray-900">{formatCurrency(inv.currentValue)}</div>
                      <div className={`text-xs font-semibold ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {gain >= 0 ? '+' : ''}{formatCurrency(gain)} ({formatPct(pct)})
                      </div>
                    </div>
                  </button>
                  {/* Expanded: Dividends */}
                  {selectedId === inv.id && inv.hasDividend && (
                    <DividendPanel investmentId={inv.id!} dividends={selectedDividends} />
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="h-4" />
      </div>

      {showForm && <InvestmentForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function DividendPanel({ investmentId, dividends }: { investmentId: number; dividends: Dividend[] }) {
  const [showAddDiv, setShowAddDiv] = useState(false)
  const [form, setForm] = useState({ date: '', amountPerShare: '', totalReceived: '' })

  const sorted = [...dividends].sort((a, b) => b.date.localeCompare(a.date))
  const totalReceived = dividends.reduce((s, d) => s + d.totalReceived, 0)

  async function addDividend() {
    if (!form.date || !form.totalReceived) return
    await db.dividends.add({
      investmentId,
      date: form.date,
      amountPerShare: parseFloat(form.amountPerShare) || 0,
      totalReceived: parseFloat(form.totalReceived),
    })
    setForm({ date: '', amountPerShare: '', totalReceived: '' })
    setShowAddDiv(false)
  }

  return (
    <div className="mx-4 mb-3 bg-indigo-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold text-indigo-700">ประวัติปันผล</div>
        <button onClick={() => setShowAddDiv(v => !v)} className="text-[12px] text-indigo-600 font-semibold">＋ เพิ่ม</button>
      </div>

      {showAddDiv && (
        <div className="bg-white rounded-xl p-3 mb-2 flex flex-col gap-2">
          <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          <input type="number" placeholder="บาท/หุ้น" value={form.amountPerShare}
            onChange={e => setForm(v => ({ ...v, amountPerShare: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          <input type="number" placeholder="ได้รับรวม (บาท)" value={form.totalReceived}
            onChange={e => setForm(v => ({ ...v, totalReceived: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          <button onClick={addDividend} className="bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold">บันทึก</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-[12px] text-indigo-400 text-center py-2">ยังไม่มีข้อมูลปันผล</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-indigo-400 mb-1 px-1">
            <div>วันที่</div><div className="text-right">บ./หุ้น</div><div className="text-right">ได้รับ</div><div className="text-right">Yield</div>
          </div>
          {sorted.slice(0, 6).map(d => (
            <div key={d.id} className="grid grid-cols-4 gap-1 text-[12px] py-1 border-t border-indigo-100 px-1">
              <div className="text-gray-500">{d.date.slice(5)}</div>
              <div className="text-right font-medium">{d.amountPerShare.toFixed(2)}</div>
              <div className="text-right text-green-600 font-semibold">{formatCurrency(d.totalReceived)}</div>
              <div className="text-right text-indigo-600">—</div>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-indigo-200 flex justify-between text-[12px]">
            <span className="text-indigo-500">รวมทั้งหมด</span>
            <span className="font-bold text-green-600">{formatCurrency(totalReceived)}</span>
          </div>
        </>
      )}
    </div>
  )
}

function InvestmentForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    type: 'thai_stock' as InvestmentType,
    name: '', ticker: '', costBasis: '', currentValue: '', shares: '', hasDividend: false, currency: 'THB', notes: '',
  })

  async function save() {
    if (!form.name || !form.costBasis || !form.currentValue) return
    await db.investments.add({
      type: form.type,
      name: form.name,
      ticker: form.ticker || undefined,
      costBasis: parseFloat(form.costBasis),
      currentValue: parseFloat(form.currentValue),
      shares: form.shares ? parseFloat(form.shares) : undefined,
      hasDividend: form.hasDividend,
      currency: form.currency as 'THB' | 'USD' | 'OTHER',
      notes: form.notes || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900">เพิ่มการลงทุน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <select value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as InvestmentType }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="ชื่อ (เช่น CPALL, S&P500 ETF)" value={form.name}
          onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <input placeholder="Ticker (ไม่บังคับ)" value={form.ticker}
          onChange={e => setForm(v => ({ ...v, ticker: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="ต้นทุน (บาท)" value={form.costBasis}
            onChange={e => setForm(v => ({ ...v, costBasis: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm" />
          <input type="number" placeholder="มูลค่าตอนนี้" value={form.currentValue}
            onChange={e => setForm(v => ({ ...v, currentValue: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm" />
        </div>
        <input type="number" placeholder="จำนวนหุ้น/หน่วย (ไม่บังคับ)" value={form.shares}
          onChange={e => setForm(v => ({ ...v, shares: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <label className="flex items-center gap-3 px-1">
          <input type="checkbox" checked={form.hasDividend} onChange={e => setForm(v => ({ ...v, hasDividend: e.target.checked }))}
            className="w-5 h-5 rounded accent-indigo-600" />
          <span className="text-sm font-medium text-gray-700">มีปันผล</span>
        </label>

        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}
