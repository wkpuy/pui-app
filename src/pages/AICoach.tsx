import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { chatWithCoach, analyzePatterns, initGemini } from '../api/gemini'
import { getAgeDetail, calcBiologicalAge } from '../utils/calculations'
import { fetchStockPrices } from '../api/stockPrice'
import { BIOMARKERS, getCheckups } from './Health'
import { calcThaiTax, suggestUnusedAllowances } from '../utils/thaiTax'

interface Message { role: 'user' | 'assistant'; content: string; time: string; followUps?: string[] }

function getFollowUps(reply: string): string[] {
  const r = reply.toLowerCase()
  const picks: string[] = []
  if (/หุ้น|พอร์ต|ลงทุน|ticker|ราคา/.test(r)) picks.push('แนะนำวิธี rebalance พอร์ตได้ไหม?')
  if (/ภาษี|rmf|ssf|esg|ลดหย่อน/.test(r)) picks.push('ควรซื้อ RMF หรือ SSF ก่อนดีกว่ากัน?')
  if (/ldl|hdl|ความดัน|น้ำตาล|อักเสบ|crp|สุขภาพ/.test(r)) picks.push('ควรปรับอาหารอย่างไรให้ดีขึ้น?')
  if (/เกษียณ|pvd|4%|สินทรัพย์/.test(r)) picks.push('ถ้าเกษียณเร็วขึ้น 3 ปี ต้องออมเพิ่มเท่าไร?')
  if (/ผ่อน|หนี้|คอนโด|สินเชื่อ/.test(r)) picks.push('โปะคอนโดก่อนหรือลงทุนก่อนดีกว่ากัน?')
  if (/นอน|hrv|recovery|vo2|ออกกำลัง/.test(r)) picks.push('Zone 2 training คืออะไร และควรทำยังไง?')
  if (/subscription|netflix|spotify|icloud/.test(r)) picks.push('มี subscription ไหนที่ไม่คุ้มและควรยกเลิก?')
  if (picks.length < 2) {
    picks.push('สรุปประเด็นสำคัญที่ควรทำก่อนสิ้นปีนี้')
    picks.push('มีความเสี่ยงอะไรในพอร์ตฉันที่ควรระวัง?')
  }
  return picks.slice(0, 3)
}

const SMART_PROMPTS = [
  'พอร์ตหุ้นฉันตอนนี้กำไรขาดทุนหุ้นไหนมากที่สุด?',
  'ค่าตรวจเลือดล่าสุดมีอะไรน่ากังวลบ้าง?',
  'ฉันจะเกษียณทันไหม ขาดอีกเท่าไร?',
  'เดือนนี้รายจ่ายหมวดไหนเยอะที่สุด?',
  'แผนผ่อนล่วงหน้า 3 เดือนต่อจากนี้รวมเท่าไร?',
  'PVD ตอนเกษียณจะได้ประมาณเท่าไร?',
]

function num(n?: number, digits = 0) {
  if (n === undefined || n === null || isNaN(n)) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const [priceSyncStatus, setPriceSyncStatus] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const settings = useLiveQuery(() => db.settings.toArray().then(r => r[0]))
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const dividends = useLiveQuery(() => db.dividends.toArray())
  const allHealthRecords = useLiveQuery(() => db.healthRecords.orderBy('date').reverse().limit(5).toArray())
  const allDaily = useLiveQuery(() => db.healthDaily.orderBy('date').reverse().limit(30).toArray())
  const retirement = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const allFinance = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().limit(120).toArray())
  const installments = useLiveQuery(() => db.installments.toArray())
  const salaryRecords = useLiveQuery(() => db.salaryRecords.orderBy('year').toArray())
  const condo = useLiveQuery(() => db.condoMortgage.toArray().then(r => r[0]))
  const emergencyFund = useLiveQuery(() => db.emergencyFund.toArray().then(r => r[0]))
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray())
  const taxRecords = useLiveQuery(() => db.taxRecords.toArray())

  useEffect(() => {
    if (settings?.geminiApiKey) initGemini(settings.geminiApiKey)
  }, [settings?.geminiApiKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-refresh stock prices on mount (once per session)
  useEffect(() => {
    if (!investments) return
    if (sessionStorage.getItem('coach_prices_synced')) return
    sessionStorage.setItem('coach_prices_synced', '1')
    refreshPrices()
  }, [investments])

  useEffect(() => {
    if (!settings?.geminiApiKey || !investments || !allHealthRecords) return
    buildSmartAlerts()
  }, [settings, investments, allHealthRecords, allFinance])

  async function refreshPrices() {
    const tickerInvs = (investments ?? []).filter(i =>
      (i.type === 'thai_stock' || i.type === 'foreign_stock' || i.type === 'fund') && i.ticker
    )
    if (tickerInvs.length === 0) return
    setPriceSyncStatus('⏳ กำลังอัพเดทราคาหุ้น...')
    try {
      const tickerMap = tickerInvs.map(inv => ({
        inv,
        apiTicker: inv.type === 'thai_stock' && inv.ticker && !inv.ticker.includes('.')
          ? inv.ticker + '.BK' : inv.ticker!,
      }))
      const prices = await fetchStockPrices(tickerMap.map(x => x.apiTicker))
      let updated = 0
      for (const { inv, apiTicker } of tickerMap) {
        const price = prices[apiTicker]
        if (price) {
          const totalValue = inv.shares ? parseFloat((price * inv.shares).toFixed(2)) : price
          await db.investments.update(inv.id!, {
            currentPricePerUnit: price,
            currentValue: totalValue,
            updatedAt: new Date().toISOString(),
          })
          updated++
        }
      }
      setPriceSyncStatus(`✅ ราคาอัพเดท ${updated}/${tickerInvs.length} รายการ`)
      setTimeout(() => setPriceSyncStatus(null), 3000)
    } catch {
      setPriceSyncStatus('⚠️ อัพเดทราคาไม่สำเร็จ')
      setTimeout(() => setPriceSyncStatus(null), 3000)
    }
  }

  function buildContext() {
    const age = profile ? getAgeDetail(profile.dob) : null
    const today = new Date().toISOString().slice(0, 10)

    // ── Investments ─────────────────────────────────────────
    const totalCost = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
    const totalCurr = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0
    const totalPL = totalCurr - totalCost
    const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0

    const invByType = (investments ?? []).reduce((acc, i) => {
      acc[i.type] = (acc[i.type] ?? 0) + i.currentValue
      return acc
    }, {} as Record<string, number>)

    const investmentLines = (investments ?? []).map(i => {
      const pl = i.currentValue - i.costBasis
      const plPct = i.costBasis > 0 ? (pl / i.costBasis) * 100 : 0
      const lastPrice = i.currentPricePerUnit ? ` (ราคา/หน่วย ${num(i.currentPricePerUnit, 2)})` : ''
      const tickerStr = i.ticker ? `[${i.ticker}] ` : ''
      const shareStr = i.shares ? `${i.shares} หน่วย` : ''
      return `  - ${tickerStr}${i.name} (${i.type}): ต้นทุน ${num(i.costBasis)}, ปัจจุบัน ${num(i.currentValue)}${lastPrice} ${shareStr} | กำไร/ขาดทุน ${num(pl)} (${plPct.toFixed(1)}%)`
    }).join('\n')

    // ── Dividends summary ───────────────────────────────────
    const totalDiv = dividends?.reduce((s, d) => s + d.totalReceived, 0) ?? 0
    const div12mo = dividends?.filter(d => {
      const days = (Date.now() - new Date(d.date).getTime()) / (1000 * 3600 * 24)
      return days <= 365
    }).reduce((s, d) => s + d.totalReceived, 0) ?? 0

    // ── Health (latest record analyzed against reference ranges) ────────────
    const lh = allHealthRecords?.[0]
    const STATUS_LABEL: Record<string, string> = { optimal: '✨Optimal', good: '✓ปกติ', warning: '⚠️เฝ้าระวัง', high: '❗ผิดปกติ' }
    const analyzed: { key: string; label: string; value: number; unit: string; status: string; optimal: string; normal: string }[] = []
    if (lh) {
      for (const [k, v] of Object.entries(lh)) {
        if (typeof v !== 'number') continue
        const def = BIOMARKERS[k]
        if (!def) continue
        const status = def.evaluate(v)
        analyzed.push({ key: k, label: def.label, value: v, unit: def.unit, status: STATUS_LABEL[status], optimal: def.optimal, normal: def.normal })
      }
    }
    const concerning = analyzed.filter(a => a.status.includes('เฝ้าระวัง') || a.status.includes('ผิดปกติ'))
    const optimalCount = analyzed.filter(a => a.status.includes('Optimal')).length
    const healthLines = analyzed.length > 0
      ? analyzed.map(a => `  - ${a.label}: ${a.value} ${a.unit} → ${a.status} (Optimal ${a.optimal}, ปกติ ${a.normal})`).join('\n')
      : '  (ยังไม่มีผลตรวจ)'
    const concernLines = concerning.length > 0
      ? '\n  🔴 ค่าที่ควรให้ความสนใจ: ' + concerning.map(a => `${a.label} ${a.value}`).join(', ')
      : ''

    // Health daily — avg over last 7 + 30 days
    const recent7 = (allDaily ?? []).slice(0, 7)
    const recent30 = allDaily ?? []
    function avg(arr: any[], key: string) {
      const vals = arr.map(x => x[key]).filter(v => typeof v === 'number')
      if (vals.length === 0) return undefined
      return vals.reduce((s, v) => s + v, 0) / vals.length
    }
    const dailyLines = (allDaily?.[0]) ? `
  วันล่าสุด (${allDaily[0].date}):
    - น้ำหนัก ${num(allDaily[0].weightKg, 1)} กก., ก้าว ${num(allDaily[0].steps)}, เผาผลาญ ${num(allDaily[0].caloriesBurned)} cal
    - นอนรวม ${num(allDaily[0].sleepTotal, 1)} ชม. (Deep ${num(allDaily[0].sleepDeep, 1)}, REM ${num(allDaily[0].sleepRem, 1)})
    - HRV ${num(allDaily[0].hrv)} ms, RHR ${num(allDaily[0].restingHeartRate)} bpm, Recovery ${num(allDaily[0].recoveryScore)}%
    - VO2max ${num(allDaily[0].vo2max, 1)}, SpO2 ${num(allDaily[0].bloodOxygen)}%, Strain ${num(allDaily[0].strain, 1)}
  ค่าเฉลี่ย 7 วัน: นอน ${num(avg(recent7, 'sleepTotal'), 1)} ชม., HRV ${num(avg(recent7, 'hrv'))}, RHR ${num(avg(recent7, 'restingHeartRate'))}, Recovery ${num(avg(recent7, 'recoveryScore'))}%, ก้าว ${num(avg(recent7, 'steps'))}
  ค่าเฉลี่ย 30 วัน: นอน ${num(avg(recent30, 'sleepTotal'), 1)} ชม., HRV ${num(avg(recent30, 'hrv'))}, RHR ${num(avg(recent30, 'restingHeartRate'))}, VO2max ${num(avg(recent30, 'vo2max'), 1)}` : '  (ไม่มีข้อมูลกิจกรรมรายวัน)'

    // BMI + Biological Age
    const latestWeight = allDaily?.find(d => d.weightKg)?.weightKg
    const bmi = profile && latestWeight ? latestWeight / Math.pow(profile.heightCm / 100, 2) : null
    const bmiCat = bmi ? (bmi < 18.5 ? 'น้ำหนักน้อย' : bmi < 25 ? 'ปกติ' : bmi < 30 ? 'น้ำหนักเกิน' : 'อ้วน') : null
    const ageNow = age?.years ?? 35
    const latestDailyForBio = allDaily?.[0]
    const bioAge = lh && latestDailyForBio ? calcBiologicalAge(ageNow, {
      systolic: lh.systolic, glucose: lh.glucose, ldl: lh.ldl, hdl: lh.hdl,
      vo2max: latestDailyForBio.vo2max, sleepHours: latestDailyForBio.sleepTotal,
      steps: latestDailyForBio.steps, bmi: bmi ?? undefined,
    }) : null

    // Age-based recommended checkups
    const checkups = getCheckups(ageNow)

    // Health daily — recent activity
    const recentVo2max = (allDaily ?? []).find(d => d.vo2max !== undefined)?.vo2max

    // ── Finance ─────────────────────────────────────────────
    const thisMonth = today.slice(0, 7)
    const monthFin = (allFinance ?? []).filter(r => r.date.startsWith(thisMonth))
    const income = monthFin.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
    const expense = monthFin.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
    const catSum = monthFin.filter(r => r.type === 'expense').reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + r.amount
      return acc
    }, {} as Record<string, number>)
    const topCats = Object.entries(catSum).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([c, v]) => `${c} ${num(v)}`).join(', ')

    // ── Installments ────────────────────────────────────────
    const activeInst = (installments ?? []).filter(i => i.paidInstallments < i.totalInstallments)
    const instMonthly = activeInst.reduce((s, i) => s + i.monthlyAmount, 0)
    const instLines = activeInst.slice(0, 10).map(i =>
      `  - ${i.name}${i.cardName ? ` [${i.cardName}]` : ''}: ${num(i.monthlyAmount)}/เดือน × เหลือ ${i.totalInstallments - i.paidInstallments}/${i.totalInstallments} งวด`
    ).join('\n')

    // ── Salary ──────────────────────────────────────────────
    const latestSalary = salaryRecords?.[salaryRecords.length - 1]
    const pvdToDate = (salaryRecords ?? []).reduce((s, r) => {
      return s + r.baseSalary * 12 * ((r.pvdEmployeeRate + r.pvdEmployerRate) / 100)
    }, 0)

    // ── Retirement ──────────────────────────────────────────
    const ageY = age?.years ?? 35
    const yrsToRet = retirement ? Math.max(retirement.targetRetirementAge - ageY, 0) : 0
    const target = retirement ? retirement.monthlyExpenseAtRetirement * 12 * 25 : 0
    const portfolioVal = totalCurr
    const otherAssets = retirement?.currentTotalAssets ?? 0
    const totalAssets = portfolioVal + otherAssets + pvdToDate
    const gap = target - totalAssets

    // ── Subscriptions ───────────────────────────────────────
    const activeSubs = (subscriptions ?? []).filter(s => s.active)
    const subMonthly = activeSubs.reduce((s, x) =>
      s + (x.frequency === 'monthly' ? x.amount : x.frequency === 'quarterly' ? x.amount / 3 : x.amount / 12), 0)
    const subAnnual = activeSubs.reduce((s, x) =>
      s + (x.frequency === 'monthly' ? x.amount * 12 : x.frequency === 'quarterly' ? x.amount * 4 : x.amount), 0)
    const subLines = activeSubs.slice(0, 10).map(s =>
      `  - ${s.name}: ${num(s.amount)} ${s.frequency === 'monthly' ? 'บาท/เดือน' : s.frequency === 'quarterly' ? 'บาท/3 เดือน' : 'บาท/ปี'}${s.paymentMethod ? ` (${s.paymentMethod})` : ''}`
    ).join('\n')

    // ── Tax ─────────────────────────────────────────────────
    const currentBE = new Date().getFullYear() + 543
    const taxRec = (taxRecords ?? []).find(r => r.year === currentBE)
      ?? (taxRecords ?? []).sort((a, b) => b.year - a.year)[0]
    let taxStr = '  (ยังไม่มีข้อมูลภาษี — ไปเพิ่มที่หน้าภาษี)'
    let taxSuggestStr = ''
    if (taxRec) {
      const bd = calcThaiTax(taxRec)
      const suggestions = suggestUnusedAllowances(taxRec)
      taxStr = `ปีภาษี ${taxRec.year}:
  - เงินได้รวม: ${num(bd.grossIncome)} บาท (เงินเดือน ${num(taxRec.totalIncome)}, โบนัส ${num(taxRec.bonus)}, อื่นๆ ${num(taxRec.otherIncome)})
  - หักค่าใช้จ่าย: ${num(bd.expenseAllowance)} + ลดหย่อนรวม: ${num(bd.totalDeductions)} บาท
  - เงินได้สุทธิ: ${num(bd.netIncome)} บาท
  - ภาษีที่ต้องจ่าย: ${num(bd.taxOwed)} บาท (Effective ${(bd.effective * 100).toFixed(1)}%, Marginal ${(bd.marginal * 100).toFixed(0)}%)
  - หัก ณ ที่จ่าย: ${num(bd.withholding)} → ${bd.netTaxPayable >= 0 ? `ต้องจ่ายเพิ่ม ${num(bd.netTaxPayable)}` : `ขอคืน ${num(-bd.netTaxPayable)}`} บาท`
      taxSuggestStr = suggestions.length > 0
        ? `\n  📋 สิทธิ์ที่ยังไม่ได้ใช้เต็ม: ${suggestions.slice(0, 4).map(s => `${s.name} เหลือ ${num(s.unused)} บาท`).join(', ')}`
        : '\n  ✅ ใช้สิทธิ์ลดหย่อนได้เกือบเต็มแล้ว'
    }

    // ── Condo ───────────────────────────────────────────────
    const condoStr = condo ? `${condo.propertyName}: กู้ ${num(condo.loanAmount)}, ดอกเบี้ย ${condo.interestRate}%, ผ่อน ${condo.loanTermYears} ปี + จ่ายเพิ่ม ${num(condo.monthlyExtra)}/เดือน` : 'ยังไม่ได้บันทึก'

    return `คุณคือ AI Coach ส่วนตัวของ ${profile?.nickname ?? 'ผู้ใช้'} ตอบเป็นภาษาไทย กระชับ ตรงประเด็น เป็นกันเอง
ใช้ข้อมูลด้านล่างนี้ทั้งหมด อย่าเดา ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าต้องไปเพิ่มข้อมูลที่ไหนในแอพ

═══ วันที่อ้างอิง: ${today} ═══

═══ โปรไฟล์ ═══
- ${profile?.nickname ?? '-'} อายุ ${age?.years ?? '-'} ปี ${age?.months ?? 0} เดือน, เพศ ${profile?.gender === 'male' ? 'ชาย' : 'หญิง'}, ส่วนสูง ${profile?.heightCm ?? '-'} ซม.
${latestWeight ? `- น้ำหนักล่าสุด ${num(latestWeight, 1)} กก., BMI ${bmi?.toFixed(1) ?? '-'} (${bmiCat ?? '-'})` : ''}
${bioAge ? `- 🧬 อายุชีวภาพ (Biological Age): ${bioAge.toFixed(1)} ปี (${bioAge < ageNow ? `ดีกว่าอายุจริง ${(ageNow - bioAge).toFixed(1)} ปี` : bioAge > ageNow ? `สูงกว่าอายุจริง ${(bioAge - ageNow).toFixed(1)} ปี` : 'เท่าอายุจริง'})` : ''}
${recentVo2max ? `- 🫁 VO₂max ล่าสุด: ${recentVo2max.toFixed(1)} ml/kg/min` : ''}

═══ การลงทุน ═══
- พอร์ตรวม: ต้นทุน ${num(totalCost)} บาท, ปัจจุบัน ${num(totalCurr)} บาท
- กำไร/ขาดทุน: ${num(totalPL)} บาท (${totalPLPct.toFixed(2)}%)
- แบ่งตามประเภท: ${Object.entries(invByType).map(([k, v]) => `${k} ${num(v)}`).join(', ')}
รายการทั้งหมด (${investments?.length ?? 0} รายการ):
${investmentLines || '  (ยังไม่มีพอร์ต)'}

ปันผลรวมทั้งหมด: ${num(totalDiv)} บาท | 12 เดือนที่ผ่านมา: ${num(div12mo)} บาท

═══ สุขภาพ (ผลตรวจล่าสุด ${lh?.date ?? '-'}) ═══
สรุป: ${analyzed.length > 0 ? `${optimalCount}/${analyzed.length} ตัวที่อยู่ในเกณฑ์ Optimal` : 'ไม่มีข้อมูล'}${concernLines}
${healthLines}

═══ กิจกรรมรายวัน ═══${dailyLines}

═══ รายรับ-รายจ่ายเดือนนี้ (${thisMonth}) ═══
- รายรับ: ${num(income)} บาท | รายจ่าย: ${num(expense)} บาท | คงเหลือ: ${num(income - expense)} บาท
- หมวดจ่ายสูงสุด: ${topCats || '-'}
- ธุรกรรมรวม 120 รายการล่าสุด (ทั้งหมดมี ${allFinance?.length ?? 0})

═══ ผ่อนชำระ ═══
- งวดที่ยังต้องผ่อน: ${activeInst.length} รายการ, รวมเดือนละ ${num(instMonthly)} บาท
${instLines || '  (ไม่มีรายการผ่อน)'}

═══ เงินเดือน & PVD ═══
${latestSalary ? `- ปีล่าสุด ${latestSalary.year}: เงินเดือน ${num(latestSalary.baseSalary)}/เดือน, โบนัส ${num(latestSalary.bonus)}/ปี
- อัตรา PVD: พนักงาน ${latestSalary.pvdEmployeeRate}% + บริษัท ${latestSalary.pvdEmployerRate}%
- PVD สะสมจากที่บันทึก: ${num(pvdToDate)} บาท (${salaryRecords?.length ?? 0} ปี)` : '  (ยังไม่ได้บันทึกเงินเดือน)'}

═══ แผนเกษียณ ═══
${retirement ? `- เป้าอายุเกษียณ ${retirement.targetRetirementAge} ปี (เหลือ ${yrsToRet} ปี), อายุขัย ${retirement.lifeExpectancy} ปี
- ใช้/เดือนหลังเกษียณ: ${num(retirement.monthlyExpenseAtRetirement)} บาท → ต้องมี ~${num(target)} (4% Rule)
- มีอยู่: พอร์ต ${num(portfolioVal)} + PVD ${num(pvdToDate)} + อื่นๆ ${num(otherAssets)} = ${num(totalAssets)} บาท
- ${gap > 0 ? `ยังขาด ${num(gap)} บาท` : `บรรลุเป้าแล้ว เกินอีก ${num(-gap)} บาท`}` : '  (ยังไม่ได้ตั้งแผนเกษียณ)'}

═══ Subscriptions (${activeSubs.length} ใช้งาน) ═══
- รวม: ${num(subMonthly, 0)} บาท/เดือน หรือ ${num(subAnnual, 0)} บาท/ปี
${subLines || '  (ยังไม่มี subscription)'}

═══ ภาษีเงินได้บุคคลธรรมดา (Thai PIT) ═══
${taxStr}${taxSuggestStr}

═══ สินเชื่อบ้าน ═══
- ${condoStr}

═══ เงินสำรองฉุกเฉิน ═══
- ปัจจุบัน ${num(emergencyFund?.currentAmount)} บาท, เป้า ${emergencyFund?.targetMonths ?? '-'} เดือน

═══ การตรวจที่แนะนำตามอายุ ${ageNow} ═══
${checkups.map(c => `- ${c}`).join('\n')}

═══ องค์ความรู้ที่ต้องใช้อ้างอิง (Longevity & Finance) ═══

[Cardiometabolic / Longevity (Peter Attia framework)]
• ApoB Optimal <60–80 mg/dL — ปัจจัยทำนาย ASCVD ดีกว่า LDL
• Lp(a) Optimal <30 mg/dL — พันธุกรรม, ลดยาก แต่บอก risk
• hs-CRP Optimal <1.0 mg/L — inflammation marker
• Fasting Insulin Optimal <5 µU/mL → HOMA-IR <1.5 = insulin sensitive
• Homocysteine Optimal <9 µmol/L (แก้ด้วย B12, B6, folate)
• Omega-3 Index Optimal >8% (DHA+EPA)
• Vitamin D Optimal 50–80 ng/mL
• Triglyceride/HDL ratio <2 = ดี, >3.5 = insulin resistance
• HbA1c Optimal <5.4%
• Blood Pressure Optimal <120/<80

[Fitness / VO₂max thresholds — แนวโน้มอายุยืน]
• VO₂max ≥50 ml/kg/min = Excellent (top decile)
• 42–49 = Good, 35–41 = Average, <35 = Low → ลด mortality risk 5x ถ้าพ้น Low
• Zone 2 training 3 ครั้ง/สัปดาห์ × 45 นาที + VO₂max interval 1 ครั้ง

[Strength / Body composition]
• Grip strength ≥27 kg (ผู้หญิง) — sarcopenia marker
• Muscle mass > 30% body weight
• Bone density T-score >-1

[Investment principles]
• Diversification: หุ้นไทย/ต่างประเทศ/กองทุน/พันธบัตร ≈ Age Rule (100−อายุ)% ในหุ้น
• ปันผล: yield ดี ~3–5% ต่อปี, จ่ายสม่ำเสมอ ≥3 ปี
• Cost averaging > timing the market
• Rebalance ปีละ 1 ครั้ง

[Retirement (4% Rule / Trinity Study)]
• ต้องมี = ค่าใช้จ่ายต่อปี × 25
• Safe withdrawal rate 4%/ปี = เงินอยู่ได้ ~30 ปี
• PVD: รวมเป็นสินทรัพย์เพื่อเกษียณ

[Personal Finance]
• Emergency Fund 6 เดือนของค่าใช้จ่าย (ไม่ใช่รายรับ)
• Debt-to-income ratio <36%, ผ่อนบ้าน <28%
• Savings rate 20%+ ของรายได้
• 50/30/20 rule: 50% needs, 30% wants, 20% savings/debt

[Thai Personal Income Tax (PIT) 2566/2567]
• Brackets: 0-150k=0%, 150-300k=5%, 300-500k=10%, 500-750k=15%, 750k-1M=20%, 1-2M=25%, 2-5M=30%, >5M=35%
• ค่าใช้จ่าย 40(1): 50% เพดาน 100,000
• ลดหย่อนส่วนตัว 60,000 + คู่สมรส 60,000 + บุตร 30-60k/คน + บิดามารดา 30k/คน
• RMF ≤30% รายได้ ≤500k | SSF ≤30% รายได้ ≤200k | Thai ESG ≤30% รายได้ ≤300k (แยก)
• PVD + บำนาญ + RMF + SSF ≤ 500,000 รวมกัน
• ประกันชีวิต + สุขภาพตน ≤ 100,000 (ประกันสุขภาพ ≤ 25k)
• ดอกเบี้ยกู้บ้าน ≤ 100,000
• Easy E-Receipt ≤ 50,000
• กลยุทธ์ประหยัดภาษี: ใช้ RMF/SSF/Thai ESG ก่อนสิ้นปี, ซื้อประกันบำนาญ, ดอกเบี้ยบ้าน

═══ ข้อปฏิบัติ (สำคัญ) ═══
1. **คำนวณก่อนตอบ** — ใช้เลขจากข้อมูลจริง อย่าเดา ตรวจสูตรให้ถูก
2. **อ้างอิงเกณฑ์** — ระบุค่า Optimal/Normal เทียบกับค่าของผู้ใช้ทุกครั้งที่พูดเรื่องสุขภาพ/การเงิน
3. **สรุปก่อน รายละเอียดทีหลัง** — บรรทัดแรกตอบคำถามตรงๆ แล้วค่อยขยาย
4. **ระบุที่ต้องเพิ่มข้อมูล** — ถ้าขาด บอกชัดว่าไปเพิ่มหน้าไหน (สุขภาพ/ลงทุน/เงินเดือน ฯลฯ)
5. **แนะนำเชิงปฏิบัติ** — ให้ next action ที่ชัดเจน 1-3 ข้อ ไม่ใช่ทฤษฎีลอยๆ
6. **เรื่องนอกแอพ** (ข่าวบริษัท/ตลาด) — ตอบจาก general knowledge + ระบุว่ายังไม่ live data
7. **Disclaimer การแพทย์** — ค่าผิดปกติให้แนะนำพบแพทย์, ไม่วินิจฉัยเอง
8. **กระชับ** — ไม่ใช้คำฟุ่มเฟือย ใช้ bullet/รายการเมื่อเหมาะ`
  }

  async function buildSmartAlerts() {
    if (!settings?.geminiApiKey) return
    try {
      initGemini(settings.geminiApiKey)
      const context = buildContext()
      const prompt = `${context}\n\nวิเคราะห์ข้อมูลและแจ้งเตือน 2-3 ข้อสำคัญที่พบ เขียนแต่ละข้อสั้นๆ 1 บรรทัด เริ่มด้วย emoji`
      const result = await analyzePatterns(prompt)
      const lines = result.split('\n').filter(l => l.trim().length > 0).slice(0, 3)
      setAlerts(lines)
    } catch { /* silent */ }
  }

  async function sendMessage(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || loading) return
    if (!settings?.geminiApiKey) {
      setMessages(v => [...v, {
        role: 'assistant',
        content: 'กรุณาตั้งค่า Gemini API Key ก่อนในหน้า Settings ครับ',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      }])
      return
    }

    const userMsg: Message = { role: 'user', content: msg, time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      initGemini(settings.geminiApiKey)
      const history = newMessages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }],
      }))
      history.push({ role: 'user', parts: [{ text: msg }] })

      const reply = await chatWithCoach(history, buildContext())
      setMessages(v => [...v, {
        role: 'assistant', content: reply,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        followUps: getFollowUps(reply),
      }])

      await db.chatMessages.bulkAdd([
        { role: 'user', content: msg, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ])
    } catch (e: any) {
      setMessages(v => [...v, { role: 'assistant', content: `เกิดข้อผิดพลาด: ${e.message}`, time: '' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title="AI Coach"
        gradient="from-purple-500 to-violet-600"
        rightAction={{ label: '🔄 ราคา', onClick: refreshPrices }}
      />

      {priceSyncStatus && (
        <div className="bg-purple-50 px-4 py-1.5 text-[12px] text-purple-700 font-medium border-b border-purple-100">
          {priceSyncStatus}
        </div>
      )}

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide mb-1">Smart Alerts</div>
          {alerts.map((a, i) => (
            <div key={i} className="text-[12px] text-indigo-700 py-0.5">{a}</div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🤖</div>
            <div className="text-gray-500 font-medium mb-1">สวัสดีครับ ฉันคือ AI Coach</div>
            <div className="text-[13px] text-gray-400 mb-4">ฉันรู้ข้อมูลทั้งหมดของคุณในแอพนี้ ถามอะไรก็ได้</div>
            <div className="flex flex-col gap-2">
              {SMART_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="bg-indigo-50 text-indigo-700 text-[13px] font-medium px-4 py-2.5 rounded-xl active:scale-95 text-left">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 mb-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${m.role === 'assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gray-200'}`}>
              {m.role === 'assistant' ? '🤖' : '😊'}
            </div>
            <div className={`max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${m.role === 'assistant' ? 'bg-white text-gray-800 shadow-sm rounded-tl-sm' : 'bg-indigo-600 text-white rounded-tr-sm'}`}>
                {m.content}
              </div>
              {m.time && <div className="text-[10px] text-gray-400 px-1">{m.time}</div>}
              {/* Follow-up suggestion chips — only on last assistant message */}
              {m.role === 'assistant' && i === messages.length - 1 && m.followUps && m.followUps.length > 0 && !loading && (
                <div className="flex flex-col gap-1 mt-1 w-full">
                  {m.followUps.map(q => (
                    <button key={q} onClick={() => sendMessage(q)}
                      className="text-left text-[12px] text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl active:scale-[0.97] font-medium leading-snug">
                      {q} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm">🤖</div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="พิมพ์คำถาม..."
          rows={1}
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-[14px] resize-none outline-none focus:border-indigo-400"
          style={{ maxHeight: 100 }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 flex-shrink-0"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
