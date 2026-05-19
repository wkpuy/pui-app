import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useMemo, useEffect } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { formatCurrency } from '../utils/calculations'

const ASSET_COLORS: Record<string, string> = {
  stocks:      '#6366f1',
  funds:       '#0ea5e9',
  insurance:   '#f59e0b',
  savings:     '#10b981',
  real_estate: '#f97316',
  other:       '#94a3b8',
}

// Amortization — returns remaining balance after monthsElapsed payments
function calcRemainingBalance(
  loanAmount: number,
  annualRate: number,
  termMonths: number,
  monthsElapsed: number,
  monthlyExtra: number,
): number {
  if (loanAmount <= 0) return 0
  const r = annualRate / 100 / 12
  const basePayment = r > 0
    ? loanAmount * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
    : loanAmount / termMonths
  let balance = loanAmount
  for (let i = 0; i < Math.min(monthsElapsed, termMonths); i++) {
    const interest = balance * r
    const principal = Math.min(balance, basePayment - interest + monthlyExtra)
    balance = Math.max(0, balance - principal)
  }
  return balance
}

function formatM(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export default function NetWorth() {
  const navigate = useNavigate()

  const investments   = useLiveQuery(() => db.investments.toArray())
  const condo         = useLiveQuery(() => db.condoMortgage.toArray().then(r => r[0]))
  const installments  = useLiveQuery(() => db.installments.toArray())
  const financeRecs   = useLiveQuery(() => db.financeRecords.orderBy('date').toArray())
  const snapshots     = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').toArray())

  // ── Assets ─────────────────────────────────────────────────────────────────
  const assets = useMemo(() => {
    const stocks    = investments?.filter(i => i.type === 'thai_stock' || i.type === 'foreign_stock').reduce((s, i) => s + i.currentValue, 0) ?? 0
    const funds     = investments?.filter(i => i.type === 'fund').reduce((s, i) => s + i.currentValue, 0) ?? 0
    const insurance = investments?.filter(i => i.type === 'insurance').reduce((s, i) => s + i.currentValue, 0) ?? 0
    const savings   = investments?.filter(i => i.type === 'savings').reduce((s, i) => s + i.currentValue, 0) ?? 0
    const other     = investments?.filter(i => i.type === 'other').reduce((s, i) => s + i.currentValue, 0) ?? 0
    const realEstate = condo?.totalPrice ?? 0

    const items = [
      { key: 'stocks',      label: 'หุ้น',          value: stocks,      color: ASSET_COLORS.stocks },
      { key: 'funds',       label: 'กองทุน',         value: funds,       color: ASSET_COLORS.funds },
      { key: 'insurance',   label: 'ประกัน',         value: insurance,   color: ASSET_COLORS.insurance },
      { key: 'savings',     label: 'ออมทรัพย์',      value: savings,     color: ASSET_COLORS.savings },
      { key: 'real_estate', label: 'อสังหาฯ',        value: realEstate,  color: ASSET_COLORS.real_estate },
      { key: 'other',       label: 'อื่นๆ',          value: other,       color: ASSET_COLORS.other },
    ].filter(i => i.value > 0)

    return { items, total: items.reduce((s, i) => s + i.value, 0) }
  }, [investments, condo])

  // ── Liabilities ────────────────────────────────────────────────────────────
  const liabilities = useMemo(() => {
    const condoBalance = (() => {
      if (!condo) return 0
      const monthsElapsed = Math.max(0,
        Math.floor((Date.now() - new Date(condo.startDate).getTime()) / (30.44 * 24 * 3600 * 1000))
      )
      return calcRemainingBalance(condo.loanAmount, condo.interestRate, condo.loanTermYears * 12, monthsElapsed, condo.monthlyExtra)
    })()

    const instRemaining = installments
      ?.filter(i => i.paidInstallments < i.totalInstallments)
      .reduce((s, i) => s + (i.totalInstallments - i.paidInstallments) * i.monthlyAmount, 0) ?? 0

    const items = [
      { key: 'condo',        label: 'สินเชื่อบ้าน/คอนโด', value: condoBalance,    color: '#ef4444' },
      { key: 'installments', label: 'ยอดผ่อนคงเหลือ',     value: instRemaining,   color: '#f97316' },
    ].filter(i => i.value > 0)

    return { items, total: items.reduce((s, i) => s + i.value, 0) }
  }, [condo, installments])

  const netWorth = assets.total - liabilities.total

  // ── Auto-snapshot (once per month) ────────────────────────────────────────
  useEffect(() => {
    if (!investments || !snapshots) return
    const monthKey = new Date().toISOString().slice(0, 7)
    if (snapshots.some(s => s.date === monthKey)) return
    db.netWorthSnapshots.add({
      date: monthKey,
      totalAssets: assets.total,
      totalLiabilities: liabilities.total,
      netWorth,
    })
  }, [investments, snapshots]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Monthly income vs expense (12 months) ─────────────────────────────────
  const monthlyFinance = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      const key = d.toISOString().slice(0, 7)
      const recs = financeRecs?.filter(r => r.date.startsWith(key)) ?? []
      return {
        label: `${THAI_MONTHS[d.getMonth()]}`,
        income:  recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0),
        expense: recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
      }
    })
  }, [financeRecs])

  const hasFinanceData = monthlyFinance.some(m => m.income > 0 || m.expense > 0)

  // ── Net worth trend ────────────────────────────────────────────────────────
  const trendData = useMemo(() =>
    (snapshots ?? []).map(s => {
      const [y, m] = s.date.split('-')
      return {
        label: `${THAI_MONTHS[parseInt(m) - 1]} ${(parseInt(y) + 543).toString().slice(-2)}`,
        netWorth: s.netWorth,
        assets: s.totalAssets,
      }
    }),
  [snapshots])

  const isEmpty = assets.items.length === 0 && liabilities.items.length === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Net Worth" gradient="from-violet-600 to-indigo-700" />

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Hero ──────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-5 pb-6 pt-4 text-white">
          <div className="text-sm opacity-75 mb-1">ความมั่งคั่งสุทธิ</div>
          <div className={`text-4xl font-bold mb-4 ${netWorth < 0 ? 'text-red-300' : ''}`}>
            {formatCurrency(netWorth)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/15 rounded-2xl p-3">
              <div className="text-xs opacity-75 mb-0.5">สินทรัพย์รวม</div>
              <div className="text-[17px] font-bold">{formatCurrency(assets.total)}</div>
            </div>
            <div className="bg-white/15 rounded-2xl p-3">
              <div className="text-xs opacity-75 mb-0.5">หนี้สินรวม</div>
              <div className="text-[17px] font-bold text-red-300">{formatCurrency(liabilities.total)}</div>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="text-5xl mb-4">💰</div>
            <p className="text-gray-500 text-[14px] mb-6">เพิ่มข้อมูลการลงทุนเพื่อดู Net Worth</p>
            <button
              onClick={() => navigate('/investment')}
              className="bg-indigo-600 text-white text-[13px] font-semibold px-6 py-2.5 rounded-2xl active:scale-95"
            >
              ไปหน้าลงทุน →
            </button>
          </div>
        )}

        {/* Asset breakdown pie ────────────────────────────────────────────── */}
        {assets.items.length > 0 && (
          <Section label="สัดส่วนสินทรัพย์">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={assets.items} dataKey="value" nameKey="label"
                    cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={2}>
                    {assets.items.map(item => <Cell key={item.key} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => [formatCurrency(v as number), '']} />
                </PieChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
                {assets.items.map(item => {
                  const pct = assets.total > 0 ? (item.value / assets.total * 100).toFixed(0) : '0'
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <div className="min-w-0">
                        <div className="text-[11px] text-gray-500">{item.label} <span className="text-gray-400">{pct}%</span></div>
                        <div className="text-[12px] font-semibold text-gray-900">{formatCurrency(item.value)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Section>
        )}

        {/* Liabilities list ──────────────────────────────────────────────── */}
        {liabilities.items.length > 0 && (
          <Section label="หนี้สิน">
            <div className="flex flex-col gap-2">
              {liabilities.items.map(item => (
                <div key={item.key} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[14px] text-gray-700">{item.label}</span>
                  </div>
                  <span className="text-[14px] font-bold text-red-500">-{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Monthly income vs expense bar chart ──────────────────────────── */}
        {hasFinanceData && (
          <Section label="รายรับ-รายจ่าย 12 เดือน">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={monthlyFinance} barCategoryGap="30%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatM} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [formatCurrency(v as number), String(name)]}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="income"  name="รายรับ"   fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="expense" name="รายจ่าย"  fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-5 justify-center mt-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <div className="w-3 h-2 rounded-sm bg-emerald-500" /> รายรับ
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <div className="w-3 h-2 rounded-sm bg-red-400" /> รายจ่าย
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Net worth trend line chart ─────────────────────────────────────── */}
        {trendData.length > 1 && (
          <Section label="แนวโน้ม Net Worth">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatM} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [formatCurrency(v as number), String(name)]}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} />
                  <Line type="monotone" dataKey="assets"   name="สินทรัพย์" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-5 justify-center mt-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <div className="w-3 h-0.5 bg-indigo-500" /> Net Worth
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <div className="w-3 h-0.5 bg-emerald-500 border-dashed" /> สินทรัพย์
                </div>
              </div>
            </div>
          </Section>
        )}

        {trendData.length === 1 && (
          <div className="px-4 pb-2">
            <div className="bg-indigo-50 rounded-2xl px-4 py-3 text-[12px] text-indigo-600">
              กราฟแนวโน้มจะแสดงเมื่อมีข้อมูลอย่างน้อย 2 เดือน — กลับมาดูเดือนหน้า
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="px-5 pt-5 pb-2 text-[13px] font-semibold text-gray-500">{label}</div>
      <div className="px-4">{children}</div>
    </>
  )
}
