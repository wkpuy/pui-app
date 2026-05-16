import { differenceInYears, differenceInMonths, differenceInDays, parseISO } from 'date-fns'

export function getAgeDetail(dob: string) {
  const birth = parseISO(dob)
  const now = new Date()
  const years = differenceInYears(now, birth)
  const months = differenceInMonths(now, birth) % 12
  const days = differenceInDays(now, new Date(birth.getFullYear() + years, birth.getMonth() + months, birth.getDate()))
  return { years, months, days }
}

export function formatThaiDate(dateStr: string) {
  const d = parseISO(dateStr)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatCurrency(amount: number, decimals = 0) {
  return '฿' + amount.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPct(value: number, decimals = 1) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function calcRetirementTarget(monthlyExpense: number, rate = 4) {
  return (monthlyExpense * 12 * 100) / rate
}

export function calcMonthlySaving(
  target: number,
  current: number,
  yearsLeft: number,
  returnRate: number
) {
  const r = returnRate / 100 / 12
  const n = yearsLeft * 12
  const fvCurrent = current * Math.pow(1 + r, n)
  const remaining = target - fvCurrent
  if (remaining <= 0) return 0
  return remaining / (((Math.pow(1 + r, n) - 1) / r))
}

export function calcBiologicalAge(
  actualAge: number,
  metrics: {
    systolic?: number
    glucose?: number
    ldl?: number
    hdl?: number
    vo2max?: number
    sleepHours?: number
    steps?: number
    bmi?: number
  }
): number {
  let delta = 0

  if (metrics.systolic) {
    if (metrics.systolic < 110) delta -= 1.5
    else if (metrics.systolic < 120) delta -= 0.5
    else if (metrics.systolic > 140) delta += 2
    else if (metrics.systolic > 130) delta += 1
  }
  if (metrics.glucose) {
    if (metrics.glucose < 85) delta -= 1
    else if (metrics.glucose > 100) delta += 1.5
    else if (metrics.glucose > 90) delta += 0.5
  }
  if (metrics.ldl) {
    if (metrics.ldl < 70) delta -= 1.5
    else if (metrics.ldl > 130) delta += 2
    else if (metrics.ldl > 100) delta += 0.5
  }
  if (metrics.hdl) {
    if (metrics.hdl > 60) delta -= 1
    else if (metrics.hdl < 40) delta += 1.5
  }
  if (metrics.vo2max) {
    if (metrics.vo2max > 50) delta -= 2
    else if (metrics.vo2max > 40) delta -= 1
    else if (metrics.vo2max < 30) delta += 2
  }
  if (metrics.sleepHours) {
    if (metrics.sleepHours >= 7 && metrics.sleepHours <= 9) delta -= 0.5
    else if (metrics.sleepHours < 6 || metrics.sleepHours > 9) delta += 1
  }
  if (metrics.steps) {
    if (metrics.steps >= 10000) delta -= 1
    else if (metrics.steps < 5000) delta += 1
  }
  if (metrics.bmi) {
    if (metrics.bmi >= 18.5 && metrics.bmi <= 24.9) delta -= 0.5
    else if (metrics.bmi > 30) delta += 2
    else if (metrics.bmi > 25) delta += 0.5
  }

  return Math.round((actualAge + delta) * 10) / 10
}

export function calcLifeScore(data: {
  investmentGainPct?: number
  emergencyMonths?: number
  retirementProgress?: number
  healthScore?: number
  sleepScore?: number
  stepsAvg?: number
}) {
  let finance = 50
  if (data.investmentGainPct !== undefined) finance += Math.min(data.investmentGainPct * 2, 20)
  if (data.emergencyMonths !== undefined) finance += Math.min(data.emergencyMonths * 4, 20)
  if (data.retirementProgress !== undefined) finance += data.retirementProgress * 0.1

  let health = 50
  if (data.healthScore !== undefined) health = data.healthScore
  if (data.sleepScore !== undefined) health += data.sleepScore * 0.1
  if (data.stepsAvg !== undefined) health += Math.min(data.stepsAvg / 500, 10)

  const retirement = data.retirementProgress ?? 50

  const total = finance * 0.4 + health * 0.35 + retirement * 0.25
  return Math.min(Math.max(Math.round(total), 0), 100)
}
