import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Investment, Dividend } from '../db'
import type { InvestmentType, InsuranceDetails, SavingsDetails } from '../db/types'
import PageHeader from '../components/PageHeader'
import { formatCurrency, formatPct } from '../utils/calculations'
import { fetchStockPrices } from '../api/stockPrice'
import { Toast } from '../components/Card'

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
  const [editItem, setEditItem] = useState<Investment | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [sortKey, setSortKey] = useState<'default' | 'gain' | 'loss' | 'value'>('default')

  const investments = useLiveQuery(() => db.investments.orderBy('type').toArray())
  const dividends = useLiveQuery(() => db.dividends.toArray())
  const baseFiltered = investments?.filter(i => tab === 'all' || i.type === tab) ?? []
  const filtered = [...baseFiltered].sort((a, b) => {
    const pctA = a.costBasis > 0 ? (a.currentValue - a.costBasis) / a.costBasis : 0
    const pctB = b.costBasis > 0 ? (b.currentValue - b.costBasis) / b.costBasis : 0
    if (sortKey === 'gain') return pctB - pctA
    if (sortKey === 'loss') return pctA - pctB
    if (sortKey === 'value') return b.currentValue - a.currentValue
    return 0
  })
  // exclude insurance from gain/loss totals
  const investable = investments?.filter(i => i.type !== 'insurance') ?? []
  const totalCost = investable.reduce((s, i) => s + i.costBasis, 0)
  const totalValue = investable.reduce((s, i) => s + i.currentValue, 0)
  const totalGain = totalValue - totalCost
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
  const selectedDividends = dividends?.filter(d => d.investmentId === selectedId) ?? []

  const syncPrices = useCallback(async (silent = false) => {
    if (!investments || investments.length === 0) return
    const stockInvs = investments.filter(i =>
      (i.type === 'thai_stock' || i.type === 'foreign_stock' || i.type === 'fund') && i.ticker
    )
    if (stockInvs.length === 0) return
    if (!silent) setSyncing(true)
    try {
      // Thai stocks need .BK suffix for Yahoo Finance
      const invWithApiTicker = stockInvs.map(inv => ({
        inv,
        apiTicker: inv.type === 'thai_stock' && inv.ticker && !inv.ticker.includes('.')
          ? inv.ticker + '.BK'
          : inv.ticker!,
      }))
      const prices = await fetchStockPrices(invWithApiTicker.map(x => x.apiTicker))
      let updatedCount = 0
      for (const { inv, apiTicker } of invWithApiTicker) {
        const price = prices[apiTicker]
        if (price) {
          const updates: Partial<Investment> = {
            currentPricePerUnit: price,
            updatedAt: new Date().toISOString(),
          }
          // Only recalculate currentValue when shares are defined; otherwise keep the manually-entered total
          if (inv.shares && inv.shares > 0) {
            updates.currentValue = parseFloat((price * inv.shares).toFixed(2))
          }
          await db.investments.update(inv.id!, updates)
          updatedCount++
        }
      }
      setLastSync(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
      if (!silent) {
        if (updatedCount > 0) {
          setToastMsg({ text: `อัพเดทราคา ${updatedCount} รายการสำเร็จ`, type: 'success' })
        } else {
          setToastMsg({ text: 'ไม่พบข้อมูลราคา — ตรวจสอบ Ticker อีกครั้ง', type: 'error' })
        }
      }
    } catch {
      if (!silent) setToastMsg({ text: 'ไม่สามารถโหลดราคาได้', type: 'error' })
    } finally {
      if (!silent) setSyncing(false)
    }
  }, [investments])

  // Auto-fetch on mount
  useEffect(() => {
    if (investments && investments.length > 0) {
      syncPrices(true)
    }
  }, [investments?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteInvestment(id: number) {
    await db.dividends.where('investmentId').equals(id).delete()
    await db.investments.delete(id)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Toast message={toastMsg?.text ?? null} type={toastMsg?.type} onDone={() => setToastMsg(null)} />
      <PageHeader
        title="การลงทุน"
        gradient="from-blue-500 to-cyan-600"
        rightAction={{ label: '＋ เพิ่ม', onClick: () => { setEditItem(null); setShowForm(true) } }}
      />
      <div className="flex-1 overflow-y-auto">
        {/* Total banner */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs opacity-80 mb-1">มูลค่ารวม</div>
              <div className="text-3xl font-bold mb-1">{formatCurrency(totalValue)}</div>
              <div className="text-sm opacity-90">
                ต้นทุน {formatCurrency(totalCost)} &nbsp;·&nbsp;
                <span className={totalGain >= 0 ? 'text-green-200' : 'text-red-200'}>
                  {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} ({formatPct(gainPct)})
                </span>
              </div>
            </div>
            <button
              onClick={() => syncPrices(false)}
              disabled={syncing}
              className="bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-60 flex items-center gap-1"
            >
              {syncing ? '⏳' : '🔄'} {syncing ? 'กำลังอัพเดท...' : 'Sync ราคา'}
            </button>
          </div>
          {lastSync && <div className="text-[11px] opacity-60 mt-1">อัพเดทล่าสุด {lastSync}</div>}
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

        {/* Sort controls */}
        {filtered.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 border-b border-gray-100 overflow-x-auto">
            <span className="text-[11px] text-gray-400 font-semibold flex-shrink-0">เรียง:</span>
            {([['default', '📋 ปกติ'], ['gain', '▲ กำไร%'], ['loss', '▼ ขาดทุน%'], ['value', '💰 มูลค่า']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSortKey(k)}
                className={`flex-shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${sortKey === k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 px-8">
            <div className="text-5xl mb-3">{tab === 'all' ? '📭' : TYPE_ICONS[tab as InvestmentType] ?? '📭'}</div>
            <div className="font-semibold text-gray-600 mb-1">
              {tab === 'all' ? 'ยังไม่มีข้อมูลการลงทุน' : `ยังไม่มี${TYPE_LABELS[tab as InvestmentType]}`}
            </div>
            <div className="text-[13px]">กด ＋ เพิ่ม เพื่อเพิ่มพอร์ตแรก</div>
          </div>
        ) : (
          <div className="mx-4 mt-3 bg-white rounded-2xl overflow-hidden shadow-sm">
            {filtered.map((inv, idx) => {
              const isStock = inv.type === 'thai_stock' || inv.type === 'foreign_stock' || inv.type === 'fund'
              // derive per-unit prices — use stored value or back-calculate from totals
              const costUnit = inv.costPerUnit ?? (inv.shares && inv.shares > 0 ? inv.costBasis / inv.shares : inv.costBasis)
              const priceUnit = inv.currentPricePerUnit ?? (inv.shares && inv.shares > 0 ? inv.currentValue / inv.shares : inv.currentValue)
              const totalCostItem = inv.costBasis
              const totalValueItem = inv.currentValue
              const gain = totalValueItem - totalCostItem
              const pct = totalCostItem > 0 ? (gain / totalCostItem) * 100 : 0
              const isExpanded = selectedId === inv.id
              return (
                <div key={inv.id}>
                  {idx > 0 && <div className="h-px bg-gray-50 mx-4" />}
                  <div className="flex items-center">
                    <button
                      className="flex-1 flex items-center justify-between px-4 py-3.5 active:bg-gray-50 text-left"
                      onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id!)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg">
                          {TYPE_ICONS[inv.type]}
                        </div>
                        <div>
                          <div className="text-[15px] font-semibold text-gray-900">{inv.name}</div>
                          {isStock && inv.shares ? (
                            <div className="text-xs text-gray-400">
                              {inv.ticker && `${inv.ticker} · `}{inv.shares.toLocaleString()} หน่วย · ทุน {formatCurrency(costUnit)}/หน่วย
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">
                              {inv.ticker && `${inv.ticker} · `}ต้นทุน {formatCurrency(totalCostItem)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {inv.type === 'insurance' ? (
                          <div>
                            <div className="text-[13px] font-semibold text-gray-600">ทุนประกัน</div>
                            <div className="text-[14px] font-bold text-indigo-600">
                              {inv.insuranceDetails?.coverageAmount
                                ? formatCurrency(inv.insuranceDetails.coverageAmount)
                                : '—'}
                            </div>
                          </div>
                        ) : isStock && inv.shares ? (
                          <div>
                            <div className="text-[11px] text-gray-400">{formatCurrency(priceUnit)}/หน่วย</div>
                            <div className="text-[15px] font-bold text-gray-900">{formatCurrency(totalValueItem)}</div>
                            <div className={`text-xs font-semibold ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {gain >= 0 ? '+' : ''}{formatCurrency(gain)} ({formatPct(pct)})
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-[15px] font-bold text-gray-900">{formatCurrency(totalValueItem)}</div>
                            <div className={`text-xs font-semibold ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {gain >= 0 ? '+' : ''}{formatCurrency(gain)} ({formatPct(pct)})
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                    {/* Edit / Delete actions */}
                    <div className="flex gap-1 pr-3">
                      <button
                        onClick={() => { setEditItem(inv); setShowForm(true) }}
                        className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95"
                      >✏️</button>
                      <button
                        onClick={() => {
                          if (confirm(`ลบ "${inv.name}" ออกใช่ไหม?`)) deleteInvestment(inv.id!)
                        }}
                        className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-400 active:scale-95"
                      >🗑️</button>
                    </div>
                  </div>

                  {/* Insurance detail row */}
                  {isExpanded && inv.type === 'insurance' && inv.insuranceDetails && (
                    <div className="mx-4 mb-3 bg-indigo-50 rounded-xl p-3 text-[13px]">
                      <div className="font-semibold text-indigo-700 mb-2">รายละเอียดประกัน</div>
                      <div className="grid grid-cols-2 gap-y-1.5 text-gray-700">
                        {inv.insuranceDetails.company && <div>บริษัท: <b>{inv.insuranceDetails.company}</b></div>}
                        {inv.insuranceDetails.premiumAmount && (
                          <div>เบี้ย: <b>{formatCurrency(inv.insuranceDetails.premiumAmount)}</b></div>
                        )}
                        {inv.insuranceDetails.paymentFrequency && (
                          <div>ชำระ: <b>{{ monthly: 'รายเดือน', quarterly: 'ราย 3 เดือน', annual: 'รายปี', lumpsum: 'ครั้งเดียว' }[inv.insuranceDetails.paymentFrequency]}</b></div>
                        )}
                        {inv.insuranceDetails.maturityDate && (
                          <div>ครบกำหนด: <b>{inv.insuranceDetails.maturityDate}</b></div>
                        )}
                      </div>
                      {inv.notes && <div className="mt-2 text-gray-500 text-[12px]">{inv.notes}</div>}
                    </div>
                  )}

                  {/* Savings detail row */}
                  {isExpanded && inv.type === 'savings' && (
                    <div className="mx-4 mb-3 bg-green-50 rounded-xl p-3 text-[13px]">
                      <div className="font-semibold text-green-700 mb-2">ออมทรัพย์ / เงินฝาก</div>
                      <div className="grid grid-cols-2 gap-y-1.5 text-gray-700">
                        {inv.savingsDetails?.bankName && <div>ธนาคาร: <b>{inv.savingsDetails.bankName}</b></div>}
                        {inv.savingsDetails?.interestRate && <div>ดอกเบี้ย: <b>{inv.savingsDetails.interestRate}%/ปี</b></div>}
                        {inv.savingsDetails?.accountType && (
                          <div>ประเภท: <b>{{ regular: 'ออมทรัพย์', fixed_deposit: 'ฝากประจำ', money_market: 'Money Market' }[inv.savingsDetails.accountType]}</b></div>
                        )}
                        <div>ยอดปัจจุบัน: <b className="text-green-700">{formatCurrency(inv.currentValue)}</b></div>
                      </div>
                      {inv.notes && <div className="mt-2 text-gray-500 text-[12px]">{inv.notes}</div>}
                    </div>
                  )}

                  {/* Dividends */}
                  {isExpanded && inv.hasDividend && (
                    <DividendPanel
                      investmentId={inv.id!}
                      dividends={selectedDividends}
                      costBasis={inv.costBasis}
                      costPerUnit={inv.costPerUnit ?? (inv.shares && inv.shares > 0 ? inv.costBasis / inv.shares : undefined)}
                      shares={inv.shares}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="h-4" />
      </div>

      {showForm && (
        <InvestmentForm
          editItem={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}

function DividendPanel({ investmentId, dividends, costBasis, costPerUnit, shares }: {
  investmentId: number; dividends: Dividend[]; costBasis: number
  costPerUnit?: number; shares?: number
}) {
  const [showAddDiv, setShowAddDiv] = useState(false)
  const [editDiv, setEditDiv] = useState<Dividend | null>(null)
  const [form, setForm] = useState({ date: '', amountPerShare: '', totalReceived: '' })

  const sorted = [...dividends].sort((a, b) => b.date.localeCompare(a.date))
  const allReceived = dividends.reduce((s, d) => s + d.totalReceived, 0)

  // parse date safely: expects YYYY-MM-DD, guards against extra digits
  function parseDateParts(dateStr: string): { year: string; mmdd: string } {
    const m = (dateStr ?? '').match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m) return { year: m[1], mmdd: `${m[2]}/${m[3]}` }
    // fallback for malformed dates: try splitting
    const parts = (dateStr ?? '').split('-')
    const year = (parts[0] ?? '').slice(0, 4)
    const mm = (parts[1] ?? '').padStart(2, '0')
    const dd = (parts[2] ?? '').slice(0, 2).padStart(2, '0')
    return { year: year || '????', mmdd: `${mm}/${dd}` }
  }

  // yield per year: group amountPerShare by year, compute each year's yield vs costPerUnit
  const byYear = dividends.reduce<Record<string, number>>((acc, d) => {
    const yr = parseDateParts(d.date).year
    acc[yr] = (acc[yr] ?? 0) + d.amountPerShare
    return acc
  }, {})
  const yearYields = Object.entries(byYear).map(([yr, totalPerShare]) => ({
    year: yr,
    yieldPct: costPerUnit && costPerUnit > 0 ? (totalPerShare / costPerUnit) * 100 : 0,
  })).sort((a, b) => b.year.localeCompare(a.year))
  // fallback: cumulative yield using totals (for old data without costPerUnit)
  const fallbackYield = costBasis > 0 ? (allReceived / costBasis) * 100 : 0
  const hasPerUnit = costPerUnit && costPerUnit > 0

  // when amountPerShare changes, auto-fill totalReceived = amountPerShare × shares
  function handleAmountPerShare(val: string) {
    const amt = parseFloat(val) || 0
    const auto = shares && shares > 0 ? (amt * shares).toFixed(2) : ''
    setForm(v => ({ ...v, amountPerShare: val, totalReceived: auto || v.totalReceived }))
  }

  async function saveDividend() {
    if (!form.date || !form.totalReceived) return
    const data = {
      investmentId,
      date: form.date,
      amountPerShare: parseFloat(form.amountPerShare) || 0,
      totalReceived: parseFloat(form.totalReceived),
    }
    if (editDiv?.id) {
      await db.dividends.update(editDiv.id, data)
    } else {
      await db.dividends.add(data)
    }
    setForm({ date: '', amountPerShare: '', totalReceived: '' })
    setShowAddDiv(false)
    setEditDiv(null)
  }

  function startEdit(d: Dividend) {
    setEditDiv(d)
    setForm({ date: d.date, amountPerShare: d.amountPerShare.toString(), totalReceived: d.totalReceived.toString() })
    setShowAddDiv(true)
  }

  return (
    <div className="mx-4 mb-3 bg-indigo-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[12px] font-bold text-indigo-700">ประวัติปันผล</div>
        <button onClick={() => { setEditDiv(null); setForm({ date: '', amountPerShare: '', totalReceived: '' }); setShowAddDiv(v => !v) }}
          className="text-[12px] text-indigo-600 font-semibold">＋ เพิ่ม</button>
      </div>
      {/* Yield per year summary */}
      {yearYields.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {yearYields.map(({ year, yieldPct: yp }) => (
            <div key={year} className="bg-indigo-100 rounded-lg px-2 py-0.5 text-[11px]">
              <span className="text-indigo-500">{year} </span>
              <span className="font-bold text-indigo-700">
                {hasPerUnit ? yp.toFixed(2) : fallbackYield.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {showAddDiv && (
        <div className="bg-white rounded-xl p-3 mb-2 flex flex-col gap-2">
          <div className="text-[12px] font-semibold text-gray-500">{editDiv ? 'แก้ไขปันผล' : 'เพิ่มปันผล'}</div>
          <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          <div>
            <input type="number" placeholder="ปันผล / หุ้น (บาท)" value={form.amountPerShare}
              onChange={e => handleAmountPerShare(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            {shares && shares > 0 && form.amountPerShare && (
              <div className="text-[11px] text-indigo-500 mt-1 pl-1">
                {parseFloat(form.amountPerShare).toFixed(2)} × {shares.toLocaleString()} หุ้น = ฿{(parseFloat(form.amountPerShare) * shares).toFixed(2)}
              </div>
            )}
          </div>
          <div>
            <input type="number" placeholder="ได้รับรวม (บาท)" value={form.totalReceived}
              onChange={e => setForm(v => ({ ...v, totalReceived: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            {costPerUnit && costPerUnit > 0 && form.amountPerShare && (
              <div className="text-[11px] text-indigo-500 mt-1 pl-1">
                Yield ครั้งนี้: {((parseFloat(form.amountPerShare) / costPerUnit) * 100).toFixed(2)}%
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={saveDividend} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold">บันทึก</button>
            <button onClick={() => { setShowAddDiv(false); setEditDiv(null) }} className="px-4 bg-gray-100 text-gray-600 rounded-lg py-2 text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-[12px] text-indigo-400 text-center py-2">ยังไม่มีข้อมูลปันผล</div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1 text-[10px] font-bold text-indigo-400 mb-1 px-1">
            <div>วันที่</div><div className="text-right">บ./หุ้น</div><div className="text-right">ได้รับ</div><div className="text-right">Yield%</div><div></div>
          </div>
          {sorted.slice(0, 6).map(d => (
            <div key={d.id} className="grid grid-cols-5 gap-1 text-[12px] py-1 border-t border-indigo-100 px-1 items-center">
              <div className="text-gray-500">{parseDateParts(d.date).mmdd}</div>
              <div className="text-right font-medium">{d.amountPerShare.toFixed(2)}</div>
              <div className="text-right text-green-600 font-semibold">{formatCurrency(d.totalReceived)}</div>
              <div className="text-right text-indigo-600">
                {costPerUnit && costPerUnit > 0
                  ? ((d.amountPerShare / costPerUnit) * 100).toFixed(2) + '%'
                  : costBasis > 0 ? ((d.totalReceived / costBasis) * 100).toFixed(1) + '%' : '—'}
              </div>
              <div className="flex gap-1 justify-end">
                <button onClick={() => startEdit(d)} className="text-[10px] text-indigo-500">✏️</button>
                <button onClick={() => { if (confirm('ลบปันผลนี้?')) db.dividends.delete(d.id!) }} className="text-[10px] text-red-400">🗑️</button>
              </div>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-indigo-200 flex justify-between text-[12px]">
            <span className="text-indigo-500">รวมได้รับทั้งหมด</span>
            <span className="font-bold text-green-600">{formatCurrency(allReceived)}</span>
          </div>
        </>
      )}
    </div>
  )
}

function InvestmentForm({ editItem, onClose }: { editItem: Investment | null; onClose: () => void }) {
  // derive per-unit values when editing old records that only have totals
  const initCostPerUnit = () => {
    if (editItem?.costPerUnit != null) return editItem.costPerUnit.toString()
    if (editItem?.shares && editItem.shares > 0 && editItem.costBasis > 0)
      return (editItem.costBasis / editItem.shares).toFixed(4)
    return editItem?.costBasis?.toString() ?? ''
  }
  const initPricePerUnit = () => {
    if (editItem?.currentPricePerUnit != null) return editItem.currentPricePerUnit.toString()
    if (editItem?.shares && editItem.shares > 0 && editItem.currentValue > 0)
      return (editItem.currentValue / editItem.shares).toFixed(4)
    return editItem?.currentValue?.toString() ?? ''
  }

  const [form, setForm] = useState<{
    type: InvestmentType
    name: string; ticker: string; costPerUnit: string; currentPricePerUnit: string; shares: string
    // for insurance total cost & savings balance
    costBasisDirect: string; currentValueDirect: string
    hasDividend: boolean; currency: string; notes: string
    insCompany: string
    insPolicyType: 'life' | 'health' | 'accident' | 'savings_insurance' | 'other'
    insPaymentFreq: 'monthly' | 'quarterly' | 'annual' | 'lumpsum'
    insPremium: string; insCoverage: string; insMaturity: string
    savBank: string
    savAccountType: 'regular' | 'fixed_deposit' | 'money_market'
    savInterestRate: string
  }>({
    type: (editItem?.type ?? 'thai_stock') as InvestmentType,
    name: editItem?.name ?? '',
    ticker: editItem?.ticker ?? '',
    costPerUnit: initCostPerUnit(),
    currentPricePerUnit: initPricePerUnit(),
    shares: editItem?.shares?.toString() ?? '',
    costBasisDirect: editItem?.costBasis?.toString() ?? '',
    currentValueDirect: editItem?.currentValue?.toString() ?? '',
    hasDividend: editItem?.hasDividend ?? false,
    currency: editItem?.currency ?? 'THB',
    notes: editItem?.notes ?? '',
    insCompany: editItem?.insuranceDetails?.company ?? '',
    insPolicyType: (editItem?.insuranceDetails?.policyType ?? 'life') as 'life',
    insPaymentFreq: (editItem?.insuranceDetails?.paymentFrequency ?? 'annual') as 'annual',
    insPremium: editItem?.insuranceDetails?.premiumAmount?.toString() ?? '',
    insCoverage: editItem?.insuranceDetails?.coverageAmount?.toString() ?? '',
    insMaturity: editItem?.insuranceDetails?.maturityDate ?? '',
    savBank: editItem?.savingsDetails?.bankName ?? '',
    savAccountType: (editItem?.savingsDetails?.accountType ?? 'regular') as 'regular',
    savInterestRate: editItem?.savingsDetails?.interestRate?.toString() ?? '',
  })

  // computed preview for stock/fund
  const sharesNum = parseFloat(form.shares) || 0
  const costUnitNum = parseFloat(form.costPerUnit) || 0
  const priceUnitNum = parseFloat(form.currentPricePerUnit) || 0
  const previewTotalCost = sharesNum * costUnitNum
  const previewTotalValue = sharesNum * priceUnitNum
  const previewGain = previewTotalValue - previewTotalCost
  const previewPct = previewTotalCost > 0 ? (previewGain / previewTotalCost) * 100 : 0

  async function save() {
    if (!form.name) return

    const isStockType = form.type === 'thai_stock' || form.type === 'foreign_stock' || form.type === 'fund'
    const sharesVal = form.shares ? parseFloat(form.shares) : undefined

    let costBasisVal: number
    let currentValueVal: number
    let costPerUnitVal: number | undefined
    let currentPricePerUnitVal: number | undefined

    if (isStockType && sharesVal && sharesVal > 0) {
      costPerUnitVal = parseFloat(form.costPerUnit) || 0
      currentPricePerUnitVal = parseFloat(form.currentPricePerUnit) || 0
      costBasisVal = parseFloat((costPerUnitVal * sharesVal).toFixed(2))
      currentValueVal = parseFloat((currentPricePerUnitVal * sharesVal).toFixed(2))
    } else if (form.type === 'savings') {
      currentValueVal = parseFloat(form.currentValueDirect) || 0
      costBasisVal = currentValueVal
    } else {
      costBasisVal = parseFloat(form.costBasisDirect) || 0
      currentValueVal = parseFloat(form.currentValueDirect) || 0
    }

    const insuranceDetails: InsuranceDetails | undefined = form.type === 'insurance' ? {
      company: form.insCompany || undefined,
      policyType: form.insPolicyType as InsuranceDetails['policyType'],
      paymentFrequency: form.insPaymentFreq as InsuranceDetails['paymentFrequency'],
      premiumAmount: form.insPremium ? parseFloat(form.insPremium) : undefined,
      coverageAmount: form.insCoverage ? parseFloat(form.insCoverage) : undefined,
      maturityDate: form.insMaturity || undefined,
    } : undefined

    const savingsDetails: SavingsDetails | undefined = form.type === 'savings' ? {
      bankName: form.savBank || undefined,
      accountType: form.savAccountType as SavingsDetails['accountType'],
      interestRate: form.savInterestRate ? parseFloat(form.savInterestRate) : undefined,
    } : undefined

    const data: Omit<Investment, 'id'> = {
      type: form.type,
      name: form.name,
      ticker: form.ticker || undefined,
      costBasis: costBasisVal,
      currentValue: currentValueVal,
      costPerUnit: costPerUnitVal,
      currentPricePerUnit: currentPricePerUnitVal,
      shares: sharesVal,
      hasDividend: form.hasDividend,
      currency: form.currency as 'THB' | 'USD' | 'OTHER',
      notes: form.notes || undefined,
      insuranceDetails,
      savingsDetails,
      createdAt: editItem?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (editItem?.id) {
      await db.investments.update(editItem.id, data)
    } else {
      await db.investments.add(data)
    }
    onClose()
  }

  const isInsurance = form.type === 'insurance'
  const isSavings = form.type === 'savings'
  const isStock = form.type === 'thai_stock' || form.type === 'foreign_stock' || form.type === 'fund'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900">{editItem ? 'แก้ไข' : 'เพิ่ม'}การลงทุน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <select value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as InvestmentType }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <input placeholder={isInsurance ? 'ชื่อกรมธรรม์' : isSavings ? 'ชื่อบัญชี' : 'ชื่อ (เช่น CPALL, S&P500 ETF)'}
          value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />

        {/* Insurance-specific fields */}
        {isInsurance && (
          <>
            <div className="text-[12px] font-bold text-indigo-600 -mb-1">ข้อมูลประกัน</div>
            <input placeholder="บริษัทประกัน" value={form.insCompany}
              onChange={e => setForm(v => ({ ...v, insCompany: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.insPolicyType} onChange={e => setForm(v => ({ ...v, insPolicyType: e.target.value as 'life' | 'health' | 'accident' | 'savings_insurance' | 'other' }))}
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm">
                <option value="life">ประกันชีวิต</option>
                <option value="health">ประกันสุขภาพ</option>
                <option value="accident">ประกันอุบัติเหตุ</option>
                <option value="savings_insurance">ประกันออมทรัพย์</option>
                <option value="other">อื่นๆ</option>
              </select>
              <select value={form.insPaymentFreq} onChange={e => setForm(v => ({ ...v, insPaymentFreq: e.target.value as 'monthly' | 'quarterly' | 'annual' | 'lumpsum' }))}
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm">
                <option value="monthly">รายเดือน</option>
                <option value="quarterly">ราย 3 เดือน</option>
                <option value="annual">รายปี</option>
                <option value="lumpsum">ครั้งเดียว</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="เบี้ยประกัน (บาท)" value={form.insPremium}
                onChange={e => setForm(v => ({ ...v, insPremium: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm" />
              <input type="number" placeholder="ทุนประกัน (บาท)" value={form.insCoverage}
                onChange={e => setForm(v => ({ ...v, insCoverage: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div>
              <div className="text-[12px] text-gray-500 mb-1">วันครบกำหนดกรมธรรม์</div>
              <input type="date" value={form.insMaturity}
                onChange={e => setForm(v => ({ ...v, insMaturity: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            </div>
            <div className="text-[12px] font-bold text-indigo-600 -mb-1">ต้นทุนรวมที่จ่ายไปแล้ว</div>
            <input type="number" placeholder="ต้นทุนรวม (บาท)" value={form.costBasisDirect}
              onChange={e => setForm(v => ({ ...v, costBasisDirect: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </>
        )}

        {/* Savings-specific fields */}
        {isSavings && (
          <>
            <div className="text-[12px] font-bold text-green-600 -mb-1">ข้อมูลบัญชีเงินฝาก</div>
            <input placeholder="ธนาคาร (เช่น กสิกร, กรุงเทพ)" value={form.savBank}
              onChange={e => setForm(v => ({ ...v, savBank: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.savAccountType} onChange={e => setForm(v => ({ ...v, savAccountType: e.target.value as 'regular' | 'fixed_deposit' | 'money_market' }))}
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm">
                <option value="regular">ออมทรัพย์</option>
                <option value="fixed_deposit">ฝากประจำ</option>
                <option value="money_market">Money Market</option>
              </select>
              <input type="number" placeholder="ดอกเบี้ย %/ปี" value={form.savInterestRate}
                onChange={e => setForm(v => ({ ...v, savInterestRate: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div className="text-[12px] font-bold text-green-600 -mb-1">ยอดเงินปัจจุบัน</div>
            <input type="number" placeholder="ยอดเงิน (บาท)" value={form.currentValueDirect}
              onChange={e => setForm(v => ({ ...v, currentValueDirect: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </>
        )}

        {/* Stock/fund fields */}
        {isStock && (
          <>
            <input placeholder="Ticker (เช่น CPALL, QQQ)" value={form.ticker}
              onChange={e => setForm(v => ({ ...v, ticker: e.target.value.toUpperCase() }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            <input type="number" placeholder="จำนวนหุ้น / หน่วย" value={form.shares}
              onChange={e => setForm(v => ({ ...v, shares: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-gray-500 mb-1 pl-1">ราคาต้นทุน / หน่วย (บาท)</div>
                <input type="number" placeholder="เช่น 45.50" value={form.costPerUnit}
                  onChange={e => setForm(v => ({ ...v, costPerUnit: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500 mb-1 pl-1">ราคาปัจจุบัน / หน่วย (บาท)</div>
                <input type="number" placeholder="เช่น 52.00" value={form.currentPricePerUnit}
                  onChange={e => setForm(v => ({ ...v, currentPricePerUnit: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
              </div>
            </div>
            {/* Live preview of computed totals */}
            {sharesNum > 0 && (costUnitNum > 0 || priceUnitNum > 0) && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-[12px] space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>ต้นทุนรวม ({sharesNum.toLocaleString()} × {formatCurrency(costUnitNum)})</span>
                  <span className="font-semibold text-gray-700">{formatCurrency(previewTotalCost)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>มูลค่าตอนนี้ ({sharesNum.toLocaleString()} × {formatCurrency(priceUnitNum)})</span>
                  <span className="font-semibold text-gray-700">{formatCurrency(previewTotalValue)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1">
                  <span className="text-gray-500">กำไร / ขาดทุน</span>
                  <span className={`font-bold ${previewGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {previewGain >= 0 ? '+' : ''}{formatCurrency(previewGain)} ({formatPct(previewPct)})
                  </span>
                </div>
              </div>
            )}
            <label className="flex items-center gap-3 px-1">
              <input type="checkbox" checked={form.hasDividend} onChange={e => setForm(v => ({ ...v, hasDividend: e.target.checked }))}
                className="w-5 h-5 rounded accent-indigo-600" />
              <span className="text-sm font-medium text-gray-700">มีปันผล</span>
            </label>
          </>
        )}

        {/* Other type */}
        {form.type === 'other' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-gray-500 mb-1 pl-1">ต้นทุนรวม (บาท)</div>
              <input type="number" placeholder="0" value={form.costBasisDirect}
                onChange={e => setForm(v => ({ ...v, costBasisDirect: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1 pl-1">มูลค่าตอนนี้ (บาท)</div>
              <input type="number" placeholder="0" value={form.currentValueDirect}
                onChange={e => setForm(v => ({ ...v, currentValueDirect: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            </div>
          </div>
        )}

        <input placeholder="หมายเหตุ (ไม่บังคับ)" value={form.notes}
          onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />

        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          {editItem ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
