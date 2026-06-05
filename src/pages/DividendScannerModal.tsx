import { useState, useCallback, useRef, useEffect } from 'react'
import type { Investment } from '../db/types'
import {
  scanStock, applyFilter, getPortfolioRecommendation,
  SET50, SET100_EXTRA,
  DEFAULT_FILTER,
  type ScanResult, type ScanFilter, type PortfolioContext,
} from '../api/dividendScanner'

interface Props {
  portfolioStocks: Investment[]
  onClose: () => void
}

type Universe = 'set50' | 'set100' | 'portfolio'
type SortKey = 'score' | 'yield' | 'chowder' | 'price_pct'

const SIGNAL_CONFIG = {
  attractive: { label: 'ราคาน่าซื้อ', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  fair: { label: 'ราคาพอดี', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  expensive: { label: 'ราคาแพง', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const ACTION_CONFIG = {
  buy_more: { label: 'ซื้อเพิ่มได้', color: 'bg-emerald-500', icon: '🟢' },
  hold: { label: 'ถือ + เฝ้าระวัง', color: 'bg-amber-400', icon: '🟡' },
  hold_no_add: { label: 'ถือ ไม่ซื้อเพิ่ม', color: 'bg-orange-400', icon: '🟠' },
  consider_sell: { label: 'พิจารณาขาย', color: 'bg-red-500', icon: '🔴' },
}

function ProgressBar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  )
}

function SignalBadge({ signal }: { signal: ScanResult['valuationSignal'] }) {
  const cfg = SIGNAL_CONFIG[signal]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function YieldBar({ pct, label }: { pct: number; label: string }) {
  const w = Math.min(100, pct * 1000)
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 text-right text-[11px] text-gray-500">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-2 relative">
        <div className="h-2 rounded-full bg-blue-400" style={{ width: `${w}%` }} />
      </div>
      <div className="w-10 text-[11px] text-gray-600 font-semibold">{(pct * 100).toFixed(1)}%</div>
    </div>
  )
}

function generateAnalysisText(
  result: ScanResult,
  portfolioCtx?: PortfolioContext,
  alternativeYield?: number
): string {
  const rec = portfolioCtx ? getPortfolioRecommendation(result, portfolioCtx, alternativeYield) : null
  const upside = result.fairPrice > 0
    ? (result.fairPrice - result.currentPrice) / result.currentPrice
    : null
  const signalLabel = { attractive: 'ราคาน่าซื้อ', fair: 'ราคาพอดี', expensive: 'ราคาแพง' }[result.valuationSignal]

  const lines: string[] = []
  lines.push(`===== วิเคราะห์หุ้น ${result.ticker} =====`)
  lines.push(`ชื่อ: ${result.name}`)
  lines.push(`กลุ่ม: ${result.sector ?? '-'}`)
  lines.push(`ราคาปัจจุบัน: ฿${result.currentPrice.toFixed(2)}`)
  lines.push(`ช่วงราคา 52 สัปดาห์: ฿${result.fiftyTwoWeekLow.toFixed(2)} – ฿${result.fiftyTwoWeekHigh.toFixed(2)}`)
  lines.push(`ราคาอยู่ที่: ${result.pricePercentile}th percentile ของ 5 ปี (${signalLabel})`)
  lines.push('')

  lines.push('--- Valuation ---')
  lines.push(`Dividend Yield ปัจจุบัน: ${(result.currentYield * 100).toFixed(2)}%`)
  const yldRange = result.historicalYields.length > 0
    ? `${(Math.min(...result.historicalYields) * 100).toFixed(1)}%–${(Math.max(...result.historicalYields) * 100).toFixed(1)}%`
    : 'ไม่มีข้อมูล'
  lines.push(`Yield Percentile (เทียบประวัติ): ${result.yieldPercentile}th (ช่วงประวัติ ${yldRange})`)
  lines.push(`Median Historical Yield: ${(result.medianHistoricalYield * 100).toFixed(2)}%`)
  lines.push(`Fair Price (ประเมิน): ฿${result.fairPrice.toFixed(2)}${upside !== null ? ` (${upside >= 0 ? '+' : ''}${(upside * 100).toFixed(1)}% จากราคาปัจจุบัน)` : ''}`)
  lines.push(`Chowder Number: ${result.chowder.toFixed(1)} (Yield + Growth) ${result.chowder >= 12 ? '✓ ผ่านเกณฑ์' : '✗ ต่ำกว่าเกณฑ์ 12'}`)
  lines.push('')

  lines.push('--- คุณภาพปันผล ---')
  lines.push(`Yield: ${(result.currentYield * 100).toFixed(1)}%`)
  lines.push(`ความสม่ำเสมอ: ${result.dividendYears}/5 ปี`)
  lines.push(`การเติบโต (CAGR): ${result.growthCAGR >= 0 ? '+' : ''}${(result.growthCAGR * 100).toFixed(1)}%/ปี`)
  lines.push(`ความถี่การจ่าย: ${result.frequency.toFixed(1)} ครั้ง/ปี`)
  lines.push(`ปันผลปกติปีล่าสุด (12 เดือน): ฿${result.regularLastAnnualDiv.toFixed(2)}/หุ้น${result.hasSpecialDividend ? ` (รวมพิเศษ: ฿${result.lastAnnualDiv.toFixed(2)})` : ''}`)
  lines.push(`มีปันผลพิเศษ: ${result.hasSpecialDividend ? 'มี ⚠️ (ไม่รวมในการคำนวณ yield)' : 'ไม่มี'}`)
  lines.push(`เคยตัดปันผล: ${result.hasDividendCut ? 'มี ⚠️' : 'ไม่มี ✓'}`)
  lines.push('')

  lines.push('--- ประวัติปันผลรายปี ---')
  ;[...result.annualDividends].reverse().forEach((ann, i) => {
    const y = result.historicalYields[result.annualDividends.length - 1 - i]
    lines.push(`  ${ann.year}: ฿${ann.total.toFixed(2)} (${ann.count} ครั้ง)${y ? ` yield ณ ปีนั้น ${(y * 100).toFixed(1)}%` : ''}`)
  })
  lines.push('')

  if (portfolioCtx && rec) {
    const pnlPct = portfolioCtx.costBasis > 0
      ? (portfolioCtx.currentValue - portfolioCtx.costBasis) / portfolioCtx.costBasis
      : 0
    const actionLabel = { buy_more: 'ซื้อเพิ่มได้', hold: 'ถือ + เฝ้าระวัง', hold_no_add: 'ถือต่อ ไม่ซื้อเพิ่ม', consider_sell: 'พิจารณาขาย' }[rec.action]
    lines.push('--- ข้อมูลพอร์ตของฉัน ---')
    lines.push(`ต้นทุน: ฿${portfolioCtx.costPerUnit.toFixed(2)}/หุ้น | ถือ: ${portfolioCtx.shares.toLocaleString()} หุ้น`)
    lines.push(`มูลค่าปัจจุบัน: ฿${portfolioCtx.currentValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })} | กำไร/ขาดทุน: ${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(1)}%`)
    lines.push(`คำแนะนำ: ${actionLabel}`)
    rec.reason.forEach(r => lines.push(`  · ${r}`))
    if (rec.opportunityCost) lines.push(`  💡 ${rec.opportunityCost}`)
    if (rec.averageDownNote) lines.push(`  📐 ${rec.averageDownNote}`)
    lines.push('')
  }

  lines.push('--- Score รวม ---')
  lines.push(`Score: ${result.score}/100`)
  lines.push('')
  lines.push('*ข้อมูลจาก Yahoo Finance | วิเคราะห์โดย Dividend Yield Theory + Chowder Rule')
  lines.push('*ไม่มีข้อมูลงบการเงิน (P/E, ROE) — แนะนำตรวจสอบเพิ่มเติมก่อนตัดสินใจ')

  return lines.join('\n')
}

function DetailCard({
  result,
  portfolioCtx,
  alternativeYield,
  onClose,
}: {
  result: ScanResult
  portfolioCtx?: PortfolioContext
  alternativeYield?: number
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const rec = portfolioCtx ? getPortfolioRecommendation(result, portfolioCtx, alternativeYield) : null
  const actionCfg = rec ? ACTION_CONFIG[rec.action] : null
  const pnlPct = portfolioCtx && portfolioCtx.costBasis > 0
    ? (portfolioCtx.currentValue - portfolioCtx.costBasis) / portfolioCtx.costBasis
    : null

  const upside = result.fairPrice > 0
    ? (result.fairPrice - result.currentPrice) / result.currentPrice
    : null

  async function handleCopy() {
    const text = generateAnalysisText(result, portfolioCtx, alternativeYield)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={onClose} className="text-gray-400 text-xl leading-none">←</button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-base">{result.ticker} <span className="font-normal text-gray-500 text-sm">· {result.sector}</span></div>
          <div className="text-[12px] text-gray-500 truncate">{result.name}</div>
        </div>
        <SignalBadge signal={result.valuationSignal} />
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Price + Range */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-gray-900">฿{result.currentPrice.toFixed(2)}</span>
            <span className="text-sm text-gray-500">ราคาปัจจุบัน</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-gray-400 mb-1">
              <span>฿{result.fiftyTwoWeekLow.toFixed(2)}</span>
              <span className="text-gray-600 font-semibold">ช่วงราคา 52 สัปดาห์</span>
              <span>฿{result.fiftyTwoWeekHigh.toFixed(2)}</span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded-full">
              <div
                className="absolute top-0 h-2 w-1.5 bg-indigo-600 rounded-full -translate-x-0.5"
                style={{ left: `${result.pricePercentile}%` }}
              />
            </div>
            <div className="text-center text-[11px] text-gray-500 mt-1">
              ราคาอยู่ที่ <span className="font-bold text-gray-700">{result.pricePercentile}th percentile</span> ของช่วง 5 ปี
            </div>
          </div>
        </div>

        {/* Portfolio context */}
        {portfolioCtx && rec && actionCfg && (
          <div className={`rounded-2xl p-4 ${rec.action === 'buy_more' ? 'bg-emerald-50' : rec.action === 'consider_sell' ? 'bg-red-50' : rec.action === 'hold_no_add' ? 'bg-orange-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{actionCfg.icon}</span>
              <span className="font-bold text-gray-800">{actionCfg.label}</span>
            </div>
            <div className="text-[12px] text-gray-700 mb-2">
              ต้นทุน ฿{portfolioCtx.costPerUnit.toFixed(2)}/หุ้น · {portfolioCtx.shares.toLocaleString()} หุ้น ·{' '}
              <span className={pnlPct !== null && pnlPct >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(1)}%` : '-'}
              </span>
            </div>
            <ul className="space-y-1">
              {rec.reason.map((r, i) => (
                <li key={i} className="text-[12px] text-gray-700 flex gap-1.5">
                  <span className="flex-shrink-0 mt-0.5">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {rec.opportunityCost && (
              <div className="mt-3 p-2.5 bg-white/70 rounded-xl text-[11px] text-gray-600 leading-relaxed">
                💡 {rec.opportunityCost}
              </div>
            )}
            {rec.averageDownNote && (
              <div className="mt-2 p-2.5 bg-white/70 rounded-xl text-[11px] text-gray-600">
                📐 {rec.averageDownNote}
              </div>
            )}
          </div>
        )}

        {/* Valuation metrics */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Valuation</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-gray-600">Yield ปัจจุบัน</span>
                <span className="font-bold text-gray-900">{(result.currentYield * 100).toFixed(2)}%</span>
              </div>
              <ProgressBar value={result.yieldPercentile} color={result.yieldPercentile >= 65 ? 'bg-emerald-500' : result.yieldPercentile <= 35 ? 'bg-red-400' : 'bg-amber-400'} />
              <div className="text-[10px] text-gray-400 mt-0.5">
                Yield Percentile {result.yieldPercentile}%
                {result.historicalYields.length > 0
                  ? ` — ช่วงประวัติ ${(Math.min(...result.historicalYields) * 100).toFixed(1)}%–${(Math.max(...result.historicalYields) * 100).toFixed(1)}%`
                  : ' — ไม่มีข้อมูลประวัติ'}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-gray-600">Percentile ราคา (5yr)</span>
                <span className={`font-bold ${result.pricePercentile <= 40 ? 'text-emerald-600' : result.pricePercentile >= 75 ? 'text-red-600' : 'text-amber-600'}`}>
                  {result.pricePercentile}%
                </span>
              </div>
              <ProgressBar value={result.pricePercentile} color={result.pricePercentile <= 40 ? 'bg-emerald-500' : result.pricePercentile >= 75 ? 'bg-red-400' : 'bg-amber-400'} />
            </div>
            <div className="flex justify-between text-[12px] py-1 border-t border-gray-50">
              <span className="text-gray-600">Fair Price (ประเมิน)</span>
              <span className="font-semibold text-gray-900">
                ฿{result.fairPrice > 0 ? result.fairPrice.toFixed(2) : '-'}
                {upside !== null && (
                  <span className={`ml-1 text-[11px] ${upside >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    ({upside >= 0 ? '+' : ''}{(upside * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-600">Chowder Number</span>
              <span className={`font-bold ${result.chowder >= 12 ? 'text-emerald-600' : result.chowder >= 8 ? 'text-amber-600' : 'text-red-500'}`}>
                {result.chowder.toFixed(1)} {result.chowder >= 12 ? '✓' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Dividend quality */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">คุณภาพปันผล</div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Yield', value: `${(result.currentYield * 100).toFixed(1)}%` },
              { label: 'ความสม่ำเสมอ', value: `${result.dividendYears}/5 ปี` },
              { label: 'การเติบโต', value: result.growthCAGR > 0 ? `+${(result.growthCAGR * 100).toFixed(1)}%` : `${(result.growthCAGR * 100).toFixed(1)}%` },
              { label: 'จ่ายปีละ', value: `${result.frequency.toFixed(1)} ครั้ง` },
              { label: 'ปันผลปกติ/ปี', value: `฿${result.regularLastAnnualDiv.toFixed(2)}${result.hasSpecialDividend ? '*' : ''}` },
              { label: 'ตัดปันผล', value: result.hasDividendCut ? '⚠️ มี' : '✅ ไม่มี' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                <div className="text-[11px] text-gray-500 mb-0.5">{item.label}</div>
                <div className="text-[13px] font-bold text-gray-800">{item.value}</div>
              </div>
            ))}
          </div>

          {/* Special dividend notice */}
          {result.hasSpecialDividend && (
            <div className="mb-3 p-2.5 bg-amber-50 rounded-xl text-[11px] text-amber-700 leading-relaxed">
              ⚠️ <strong>มีปันผลพิเศษ (one-off)</strong> — ตรวจพบการจ่ายที่สูงผิดปกติ Yield และ Fair Price ใช้ปันผลปกติ ฿{result.regularLastAnnualDiv.toFixed(2)}/หุ้น (ไม่รวมพิเศษ) เพื่อความแม่นยำ
            </div>
          )}
          {/* Annual dividend history */}
          <div className="text-xs font-semibold text-gray-500 mb-2">ปันผลรายปี</div>
          <div className="space-y-1.5">
            {[...result.annualDividends].reverse().map(ann => {
              const histYield = result.historicalYields[result.annualDividends.indexOf(ann)]
              return (
                <YieldBar
                  key={ann.year}
                  pct={histYield ?? result.currentYield}
                  label={`${ann.year} ฿${ann.total.toFixed(2)}`}
                />
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pb-6">
          <button
            onClick={handleCopy}
            className={`flex-1 py-3 rounded-2xl text-[13px] font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            {copied ? '✅ คัดลอกแล้ว!' : '📋 Copy วิเคราะห์ → ถาม AI'}
          </button>
          <a
            href={`https://www.set.or.th/th/market/product/stock/quote/${result.ticker}/fundamental`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 px-4 py-3 rounded-2xl border border-gray-200 text-center text-[13px] font-semibold text-gray-600 active:scale-95"
          >
            SET.or.th
          </a>
        </div>
      </div>
    </div>
  )
}

function ResultCard({
  result,
  isInPortfolio,
  portfolioCtx,
  alternativeYield,
  onSelect,
}: {
  result: ScanResult
  isInPortfolio: boolean
  portfolioCtx?: PortfolioContext
  alternativeYield?: number
  onSelect: () => void
}) {
  const upside = result.fairPrice > 0
    ? (result.fairPrice - result.currentPrice) / result.currentPrice
    : null
  const rec = portfolioCtx ? getPortfolioRecommendation(result, portfolioCtx, alternativeYield) : null
  const actionCfg = rec ? ACTION_CONFIG[rec.action] : null

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isInPortfolio && <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded">★ ในพอร์ต</span>}
            <span className="font-bold text-gray-900 text-[15px]">{result.ticker}</span>
            {result.sector && <span className="text-[11px] text-gray-400">{result.sector}</span>}
          </div>
          <div className="text-[11px] text-gray-500 truncate mt-0.5">{result.name}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-gray-800 text-[15px]">฿{result.currentPrice.toFixed(2)}</div>
          <SignalBadge signal={result.valuationSignal} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-1 text-center mb-2">
        {[
          { label: 'Yield', value: `${(result.currentYield * 100).toFixed(1)}%`, highlight: result.currentYield >= 0.04 },
          { label: 'สม่ำเสมอ', value: `${result.dividendYears}/5 ปี`, highlight: result.dividendYears >= 4 },
          { label: 'Chowder', value: result.chowder.toFixed(1), highlight: result.chowder >= 12 },
          { label: 'ราคา', value: `P${result.pricePercentile}`, highlight: result.pricePercentile <= 50 },
        ].map(m => (
          <div key={m.label} className={`rounded-lg py-1 px-0.5 ${m.highlight ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <div className="text-[9px] text-gray-400">{m.label}</div>
            <div className={`text-[12px] font-bold ${m.highlight ? 'text-emerald-700' : 'text-gray-600'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Fair price + score */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-gray-500">
          {upside !== null && (
            <span className={upside >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
              Fair ฿{result.fairPrice.toFixed(2)} ({upside >= 0 ? '+' : ''}{(upside * 100).toFixed(1)}%)
            </span>
          )}
          {result.hasDividendCut && <span className="text-amber-600">⚠️ เคยตัดปันผล</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {actionCfg && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: actionCfg.color === 'bg-emerald-500' ? '#10b981' : actionCfg.color === 'bg-orange-400' ? '#fb923c' : actionCfg.color === 'bg-amber-400' ? '#fbbf24' : '#ef4444' }}>
              {actionCfg.label}
            </span>
          )}
          <span className="text-gray-400">Score</span>
          <span className="font-bold text-gray-700">{result.score}</span>
        </div>
      </div>
    </button>
  )
}

export default function DividendScannerModal({ portfolioStocks, onClose }: Props) {
  const [universe, setUniverse] = useState<Universe>('set50')
  const [filter, setFilter] = useState<ScanFilter>({ ...DEFAULT_FILTER })
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ScanResult[]>([])
  const [selected, setSelected] = useState<ScanResult | null>(null)
  const [scanned, setScanned] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  // Fix #8: cancel ref — set to true to abort a running scan
  const cancelRef = useRef(false)
  useEffect(() => () => { cancelRef.current = true }, [])

  // Build portfolio lookup
  const portfolioMap = new Map<string, Investment>()
  for (const inv of portfolioStocks) {
    if (inv.ticker) portfolioMap.set(inv.ticker.replace('.BK', '').toUpperCase(), inv)
  }

  // Build best alternative yield for opportunity cost
  const bestAltYield = results
    .filter(r => r.meetsFilter && r.valuationSignal === 'attractive')
    .reduce((best, r) => Math.max(best, r.currentYield), 0)

  const getStockList = () => {
    if (universe === 'portfolio') {
      return portfolioStocks
        .filter(inv => inv.type === 'thai_stock' && inv.ticker)
        .map(inv => ({ ticker: inv.ticker!.replace('.BK', '').toUpperCase(), name: inv.name }))
    }
    if (universe === 'set100') return [...SET50, ...SET100_EXTRA]
    return SET50
  }

  // Fix #8: batch 5 stocks in parallel, single 300ms gap between batches (~4–5× faster)
  // Cancel ref prevents setState after unmount or when user presses Cancel.
  const handleScan = useCallback(async () => {
    const list = getStockList()
    cancelRef.current = false
    setScanning(true)
    setProgress(0)
    setResults([])
    setErrors([])
    setScanned(false)

    const BATCH = 5
    const out: ScanResult[] = new Array(list.length)
    const errs: string[] = []
    let done = 0

    for (let i = 0; i < list.length; i += BATCH) {
      if (cancelRef.current) break
      const batch = list.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(stock => scanStock(stock)))
      if (cancelRef.current) break
      batchResults.forEach((result, j) => {
        result.meetsFilter = applyFilter(result, filter)
        if (result.error) errs.push(`${list[i + j].ticker}: ${result.error}`)
        out[i + j] = result
      })
      done = Math.min(list.length, i + BATCH)
      setProgress(Math.round((done / list.length) * 100))
      if (i + BATCH < list.length) await new Promise(r => setTimeout(r, 300))
    }

    if (!cancelRef.current) {
      setResults(out.filter(Boolean))
      setErrors(errs)
      setScanned(true)
    }
    setScanning(false)
  }, [universe, filter, portfolioStocks])

  const sorted = [...results]
    .filter(r => r.meetsFilter)
    .sort((a, b) => {
      if (sortKey === 'yield') return b.currentYield - a.currentYield
      if (sortKey === 'chowder') return b.chowder - a.chowder
      if (sortKey === 'price_pct') return a.pricePercentile - b.pricePercentile
      return b.score - a.score
    })

  const hiddenCount = results.filter(r => !r.meetsFilter && !r.error).length

  if (selected) {
    const portfolioInv = portfolioMap.get(selected.ticker)
    // Fix #7: shares===0 is falsy but valid (cost-only entry); use != null instead
    const ctx: PortfolioContext | undefined = portfolioInv && portfolioInv.shares != null && portfolioInv.costPerUnit != null
      ? {
          costPerUnit: portfolioInv.costPerUnit,
          currentPrice: selected.currentPrice,
          shares: portfolioInv.shares,
          currentValue: portfolioInv.currentValue,
          costBasis: portfolioInv.costBasis,
        }
      : undefined
    return (
      <DetailCard
        result={selected}
        portfolioCtx={ctx}
        alternativeYield={bestAltYield}
        onClose={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button>
        <div>
          <div className="font-bold text-gray-900">สแกนหุ้นปันผล</div>
          <div className="text-[11px] text-gray-400">5yr dividend quality + valuation analysis</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Settings */}
        <div className="bg-white mx-4 mt-4 rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">

          {/* Universe */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">Universe</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['set50', 'SET50 (50 หุ้น)'],
                ['set100', 'SET100 (89 หุ้น)'],
                ['portfolio', 'พอร์ตฉัน'],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => { setUniverse(val); setScanned(false) }}
                  className={`py-2 px-2 rounded-xl text-[12px] font-semibold transition-colors ${universe === val ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">เกณฑ์คัดกรอง</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-700">Yield ขั้นต่ำ</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="1" max="10" step="0.5"
                    value={filter.minYield * 100}
                    onChange={e => setFilter(f => ({ ...f, minYield: Number(e.target.value) / 100 }))}
                    className="w-24 accent-indigo-600"
                  />
                  <span className="text-[13px] font-bold text-indigo-600 w-10">{(filter.minYield * 100).toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-700">ความสม่ำเสมอ (ปี)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="1" max="5" step="1"
                    value={filter.minConsistencyYears}
                    onChange={e => setFilter(f => ({ ...f, minConsistencyYears: Number(e.target.value) }))}
                    className="w-24 accent-indigo-600"
                  />
                  <span className="text-[13px] font-bold text-indigo-600 w-10">{filter.minConsistencyYears}/5 ปี</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-700">Chowder ขั้นต่ำ</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="0" max="20" step="1"
                    value={filter.minChowder}
                    onChange={e => setFilter(f => ({ ...f, minChowder: Number(e.target.value) }))}
                    className="w-24 accent-indigo-600"
                  />
                  <span className="text-[13px] font-bold text-indigo-600 w-10">{filter.minChowder}</span>
                </div>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[13px] text-gray-700">ซ่อนหุ้นราคาแพง (&gt;80th)</span>
                <div
                  onClick={() => setFilter(f => ({ ...f, hideExpensive: !f.hideExpensive }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${filter.hideExpensive ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${filter.hideExpensive ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </label>
            </div>
          </div>

          {/* Fix #8: Cancel button during scan */}
          <div className="flex gap-2">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-[15px] active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {scanning ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>กำลังสแกน... {progress}%</span>
                </>
              ) : (
                <>🔍 สแกนหุ้นปันผล</>
              )}
            </button>
            {scanning && (
              <button
                onClick={() => { cancelRef.current = true }}
                className="px-4 py-3 rounded-2xl bg-gray-200 text-gray-600 font-semibold text-[13px] active:scale-95"
              >
                ยกเลิก
              </button>
            )}
          </div>

          {scanning && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="h-2 rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* Results */}
        {scanned && (
          <div className="px-4 mt-4 pb-8">
            {/* Summary + sort */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-bold text-gray-800">{sorted.length} หุ้น</span>
                <span className="text-[12px] text-gray-400 ml-1">ผ่านเกณฑ์</span>
                {hiddenCount > 0 && <span className="text-[11px] text-gray-400 ml-1">({hiddenCount} ถูกซ่อน)</span>}
              </div>
              <div className="flex gap-1">
                {([
                  ['score', 'Score'],
                  ['yield', 'Yield'],
                  ['chowder', 'Chowder'],
                  ['price_pct', 'ราคาถูก'],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setSortKey(k)}
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${sortKey === k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 shadow-sm'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {sorted.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold">ไม่พบหุ้นที่ผ่านเกณฑ์</div>
                <div className="text-[13px] mt-1">ลองปรับเกณฑ์ให้ผ่อนคลายขึ้น</div>
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map(result => {
                  const portfolioInv = portfolioMap.get(result.ticker)
                  // Fix #7: shares===0 is falsy but valid (cost-only entry); use != null instead
    const ctx: PortfolioContext | undefined = portfolioInv && portfolioInv.shares != null && portfolioInv.costPerUnit != null
                    ? {
                        costPerUnit: portfolioInv.costPerUnit,
                        currentPrice: result.currentPrice,
                        shares: portfolioInv.shares,
                        currentValue: portfolioInv.currentValue,
                        costBasis: portfolioInv.costBasis,
                      }
                    : undefined
                  return (
                    <ResultCard
                      key={result.ticker}
                      result={result}
                      isInPortfolio={portfolioMap.has(result.ticker)}
                      portfolioCtx={ctx}
                      alternativeYield={bestAltYield}
                      onSelect={() => setSelected(result)}
                    />
                  )
                })}
              </div>
            )}

            {errors.length > 0 && (
              <div className="mt-4 bg-amber-50 rounded-xl p-3">
                <div className="text-[11px] font-bold text-amber-700 mb-1">โหลดข้อมูลไม่ได้ ({errors.length} หุ้น)</div>
                <div className="text-[11px] text-amber-600">{errors.slice(0, 5).join(', ')}{errors.length > 5 ? ` +${errors.length - 5}` : ''}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
