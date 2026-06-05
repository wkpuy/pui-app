// Dividend Scanner — uses Yahoo Finance v8 chart API (free, no auth required)
// Data: price history + dividend events (5yr) for SET50/SET100 universe

export interface StockUniverse {
  ticker: string  // without .BK
  name: string
  sector?: string
}

export interface DividendRecord {
  date: string       // YYYY-MM-DD
  amount: number     // per share
  year: number
}

export interface AnnualDividend {
  year: number
  total: number
  count: number
}

export interface ScanResult {
  ticker: string
  name: string
  sector?: string

  // Price
  currentPrice: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  pricePercentile: number          // 0–100 in 5yr range

  // Dividend data
  dividends: DividendRecord[]
  annualDividends: AnnualDividend[]
  lastAnnualDiv: number            // sum of most recent 12mo (may include special)
  regularLastAnnualDiv: number     // sum excluding detected special dividends
  hasSpecialDividend: boolean      // true if a one-off outlier was detected in last 12mo
  currentYield: number             // regularLastAnnualDiv / currentPrice (0–1)
  dividendYears: number            // years with at least 1 payment
  consistency: number              // dividendYears / 5 (0–1)
  growthCAGR: number               // median of YoY growth rates (robust to endpoint outliers)
  frequency: number                // avg payments per year
  hasDividendCut: boolean          // any year dropped >50%

  // Historical yield analysis
  historicalYields: number[]       // yearly yield at year-end price (using regular div)
  medianHistoricalYield: number
  yieldPercentile: number          // where current yield sits in history (higher = cheaper)
  fairPrice: number                // regularLastAnnualDiv / medianHistoricalYield

  // Composite score
  chowder: number                  // yield% + growthCAGR%
  score: number                    // 0–100

  // Signal
  valuationSignal: 'attractive' | 'fair' | 'expensive'
  meetsFilter: boolean

  // Error
  error?: string
}

export interface PortfolioRecommendation {
  action: 'buy_more' | 'hold' | 'hold_no_add' | 'consider_sell'
  reason: string[]
  opportunityCost?: string
  averageDownNote?: string
}

// ─── SET50 Universe ───────────────────────────────────────────────────────────
export const SET50: StockUniverse[] = [
  { ticker: 'ADVANC', name: 'แอดวานซ์ อินโฟ เซอร์วิส', sector: 'เทคโนโลยี' },
  { ticker: 'AOT', name: 'ท่าอากาศยานไทย', sector: 'คมนาคม' },
  { ticker: 'AWC', name: 'แอสเสท เวิรด์ คอร์ป', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'BANPU', name: 'บ้านปู', sector: 'พลังงาน' },
  { ticker: 'BBL', name: 'กรุงเทพ', sector: 'ธนาคาร' },
  { ticker: 'BDMS', name: 'กรุงเทพดุสิตเวชการ', sector: 'สุขภาพ' },
  { ticker: 'BEM', name: 'ทางด่วนและรถไฟฟ้ากรุงเทพ', sector: 'คมนาคม' },
  { ticker: 'BH', name: 'โรงพยาบาลบำรุงราษฎร์', sector: 'สุขภาพ' },
  { ticker: 'BJC', name: 'เบอร์ลี่ ยุคเกอร์', sector: 'พาณิชย์' },
  { ticker: 'BTS', name: 'บีทีเอส กรุ๊ป โฮลดิ้งส์', sector: 'คมนาคม' },
  { ticker: 'CBG', name: 'คาราบาวกรุ๊ป', sector: 'อาหาร' },
  { ticker: 'CENTEL', name: 'โรงแรมเซ็นทรัลพลาซา', sector: 'ท่องเที่ยว' },
  { ticker: 'CHG', name: 'โรงพยาบาลจุฬารัตน์', sector: 'สุขภาพ' },
  { ticker: 'COM7', name: 'คอม เซเว่น', sector: 'เทคโนโลยี' },
  { ticker: 'CPALL', name: 'ซีพี ออลล์', sector: 'พาณิชย์' },
  { ticker: 'CPF', name: 'เจริญโภคภัณฑ์อาหาร', sector: 'อาหาร' },
  { ticker: 'CPN', name: 'เซ็นทรัลพัฒนา', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'CRC', name: 'เซ็นทรัล รีเทล คอร์ปอเรชั่น', sector: 'พาณิชย์' },
  { ticker: 'DELTA', name: 'เดลต้า อีเลคโทรนิคส์', sector: 'อิเล็กทรอนิกส์' },
  { ticker: 'EA', name: 'พลังงานบริสุทธิ์', sector: 'พลังงาน' },
  { ticker: 'EGCO', name: 'ผลิตไฟฟ้า', sector: 'พลังงาน' },
  { ticker: 'GLOBAL', name: 'สยามโกลบอลเฮ้าส์', sector: 'พาณิชย์' },
  { ticker: 'GULF', name: 'กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์', sector: 'พลังงาน' },
  { ticker: 'HANA', name: 'ฮานา ไมโครอิเล็กทรอนิกส์', sector: 'อิเล็กทรอนิกส์' },
  { ticker: 'HMPRO', name: 'โฮม โปรดักส์ เซ็นเตอร์', sector: 'พาณิชย์' },
  { ticker: 'INTUCH', name: 'อินทัช โฮลดิ้งส์', sector: 'เทคโนโลยี' },
  { ticker: 'IVL', name: 'อินโดรามา เวนเจอร์ส', sector: 'เคมีภัณฑ์' },
  { ticker: 'KBANK', name: 'กสิกรไทย', sector: 'ธนาคาร' },
  { ticker: 'KCE', name: 'เคซีอี อีเลคโทรนิคส์', sector: 'อิเล็กทรอนิกส์' },
  { ticker: 'KTB', name: 'กรุงไทย', sector: 'ธนาคาร' },
  { ticker: 'KTC', name: 'บัตรกรุงไทย', sector: 'การเงิน' },
  { ticker: 'LH', name: 'แลนด์ แอนด์ เฮ้าส์', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'MINT', name: 'ไมเนอร์ อินเตอร์เนชั่นแนล', sector: 'ท่องเที่ยว' },
  { ticker: 'MTC', name: 'เมืองไทย แคปปิตอล', sector: 'การเงิน' },
  { ticker: 'OR', name: 'ปตท.น้ำมันและการค้าปลีก', sector: 'พลังงาน' },
  { ticker: 'OSP', name: 'โอสถสภา', sector: 'อาหาร' },
  { ticker: 'PTT', name: 'ปตท.', sector: 'พลังงาน' },
  { ticker: 'PTTEP', name: 'ปตท.สำรวจและผลิตปิโตรเลียม', sector: 'พลังงาน' },
  { ticker: 'RATCH', name: 'ราช กรุ๊ป', sector: 'พลังงาน' },
  { ticker: 'SCC', name: 'ปูนซิเมนต์ไทย', sector: 'วัสดุก่อสร้าง' },
  { ticker: 'SCB', name: 'ไทยพาณิชย์', sector: 'ธนาคาร' },
  { ticker: 'SCGP', name: 'เอสซีจี แพคเกจจิ้ง', sector: 'บรรจุภัณฑ์' },
  { ticker: 'SPALI', name: 'ศุภาลัย', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'TISCO', name: 'ทิสโก้ไฟแนนเชียลกรุ๊ป', sector: 'การเงิน' },
  { ticker: 'TMB', name: 'ธนาคารทหารไทยธนชาต (TTB)', sector: 'ธนาคาร' },
  { ticker: 'TOP', name: 'ไทยออยล์', sector: 'พลังงาน' },
  { ticker: 'TQM', name: 'ทีคิวเอ็ม คอร์ปอเรชั่น', sector: 'ประกัน' },
  { ticker: 'TRUE', name: 'ทรู คอร์ปอเรชั่น', sector: 'เทคโนโลยี' },
  { ticker: 'TU', name: 'ไทยยูเนี่ยน กรุ๊ป', sector: 'อาหาร' },
  { ticker: 'WHA', name: 'ดับบลิวเอชเอ คอร์ปอเรชั่น', sector: 'อสังหาริมทรัพย์' },
]

export const SET100_EXTRA: StockUniverse[] = [
  { ticker: 'ACE', name: 'แอ๊บโซลูท คลีน เอ็นเนอร์จี้', sector: 'พลังงาน' },
  { ticker: 'AMATA', name: 'อมตะ คอร์ปอเรชัน', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'AP', name: 'เอพี (ไทยแลนด์)', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'BEAUTY', name: 'บิวตี้ คอมมิวนิตี้', sector: 'สุขภาพ' },
  { ticker: 'BECL', name: 'ทางด่วนกรุงเทพ', sector: 'คมนาคม' },
  { ticker: 'BGRIM', name: 'บี.กริม เพาเวอร์', sector: 'พลังงาน' },
  { ticker: 'CIMBT', name: 'ซีไอเอ็มบี ไทย', sector: 'ธนาคาร' },
  { ticker: 'CK', name: 'ช.การช่าง', sector: 'ก่อสร้าง' },
  { ticker: 'DOHOME', name: 'โดโฮม', sector: 'พาณิชย์' },
  { ticker: 'ERW', name: 'เดอะ เอราวัณ กรุ๊ป', sector: 'ท่องเที่ยว' },
  { ticker: 'GPSC', name: 'โกลบอล เพาเวอร์ ซินเนอร์ยี่', sector: 'พลังงาน' },
  { ticker: 'INSET', name: 'อินเทล เน็ตเวิร์ค', sector: 'เทคโนโลยี' },
  { ticker: 'ITD', name: 'อิตาเลียนไทย ดีเวล๊อปเมนต์', sector: 'ก่อสร้าง' },
  { ticker: 'JMART', name: 'เจมาร์ท', sector: 'พาณิชย์' },
  { ticker: 'JMT', name: 'เจ เอ็ม ที เน็ทเวอร์ค เซอร์วิสเซ็ส', sector: 'การเงิน' },
  { ticker: 'LPN', name: 'แอล.พี.เอ็น.ดีเวลลอปเมนท์', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'MAKRO', name: 'สยามแม็คโคร', sector: 'พาณิชย์' },
  { ticker: 'ORI', name: 'ออริจิ้น พร็อพเพอร์ตี้', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'PS', name: 'พฤกษา โฮลดิ้ง', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'PSH', name: 'พฤกษา เรียลเอสเตท', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'PTTGC', name: 'พีทีที โกลบอล เคมิคอล', sector: 'เคมีภัณฑ์' },
  { ticker: 'QH', name: 'ควอลิตี้เฮ้าส์', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'ROBINS', name: 'โรบินสัน', sector: 'พาณิชย์' },
  { ticker: 'SAMART', name: 'สามารถคอร์ปอเรชั่น', sector: 'เทคโนโลยี' },
  { ticker: 'SAT', name: 'สมบูรณ์ แอ๊ดวานซ์ เทคโนโลยี', sector: 'ยานยนต์' },
  { ticker: 'SGP', name: 'สยามแก๊ส แอนด์ ปิโตรเคมีคัลส์', sector: 'พลังงาน' },
  { ticker: 'SIRI', name: 'แสนสิริ', sector: 'อสังหาริมทรัพย์' },
  { ticker: 'SMPC', name: 'สหมิตรถังแก๊ส', sector: 'เคมีภัณฑ์' },
  { ticker: 'STEC', name: 'ซิโน-ไทย เอ็นจีเนียริ่งฯ', sector: 'ก่อสร้าง' },
  { ticker: 'SYNTEC', name: 'ซินเท็ค คอนสตรัคชั่น', sector: 'ก่อสร้าง' },
  { ticker: 'TASCO', name: 'ทิพยประกันภัย', sector: 'ประกัน' },
  { ticker: 'THAI', name: 'การบินไทย', sector: 'คมนาคม' },
  { ticker: 'THCOM', name: 'ไทยคม', sector: 'เทคโนโลยี' },
  { ticker: 'TIDLOR', name: 'เงินติดล้อ', sector: 'การเงิน' },
  { ticker: 'TPIPP', name: 'ทีพีไอ โพลีน เพาเวอร์', sector: 'พลังงาน' },
  { ticker: 'TSC', name: 'โตโยต้า ลีสซิ่ง (ประเทศไทย)', sector: 'การเงิน' },
  { ticker: 'TTCL', name: 'ทีทีซีแอล', sector: 'พลังงาน' },
  { ticker: 'VGI', name: 'วีจีไอ', sector: 'สื่อ' },
  { ticker: 'WHAUP', name: 'ดับบลิวเอชเอ ยูทิลิตี้ส์ แอนด์ เพาเวอร์', sector: 'พลังงาน' },
]

// ─── API Fetch ────────────────────────────────────────────────────────────────

async function fetchChartData(ticker: string): Promise<{ meta: any; dividends: DividendRecord[]; prices: { date: string; close: number }[] } | null> {
  const apiTicker = `${ticker}.BK`
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(apiTicker)}?interval=1mo&range=5y&events=dividends`

  async function attempt(fetchUrl: string) {
    const res = await fetch(fetchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  let json: any
  try {
    json = await attempt(url)
  } catch {
    try {
      json = await attempt(`https://corsproxy.io/?${encodeURIComponent(url)}`)
    } catch {
      return null
    }
  }

  const result = json?.chart?.result?.[0]
  if (!result) return null

  const meta = result.meta ?? {}
  const timestamps: number[] = result.timestamp ?? []
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

  const prices = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i] ?? 0,
    }))
    .filter(p => p.close > 0)

  const rawDivs = result.events?.dividends ?? {}
  const dividends: DividendRecord[] = Object.values(rawDivs as Record<string, { date: number; amount: number }>)
    .map(d => ({
      date: new Date(d.date * 1000).toISOString().split('T')[0],
      amount: d.amount,
      year: new Date(d.date * 1000).getFullYear(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { meta, dividends, prices }
}

// ─── Calculations ─────────────────────────────────────────────────────────────

function calcPercentile(value: number, arr: number[]): number {
  if (arr.length === 0) return 50
  const below = arr.filter(v => v < value).length
  return Math.round((below / arr.length) * 100)
}

function calcMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function groupByYear(dividends: DividendRecord[]): AnnualDividend[] {
  const map: Record<number, number[]> = {}
  for (const d of dividends) {
    if (!map[d.year]) map[d.year] = []
    map[d.year].push(d.amount)
  }
  return Object.entries(map)
    .map(([yr, amounts]) => ({
      year: Number(yr),
      total: amounts.reduce((a, b) => a + b, 0),
      count: amounts.length,
    }))
    .sort((a, b) => a.year - b.year)
}

// Fix #5: Use median of YoY growth rates instead of first-last CAGR.
// This is robust to a single anomalous year at either endpoint.
function calcGrowthCAGR(annualDivs: AnnualDividend[]): number {
  if (annualDivs.length < 2) return 0
  const yoyRates: number[] = []
  for (let i = 1; i < annualDivs.length; i++) {
    const prev = annualDivs[i - 1].total
    const curr = annualDivs[i].total
    if (prev > 0) yoyRates.push((curr - prev) / prev)
  }
  return yoyRates.length > 0 ? calcMedian(yoyRates) : 0
}

// Fix #1: Detect special (one-off) dividend payments.
// A payment is "special" if it exceeds 2× the median of all per-payment amounts.
// Returns the subset of dividends that are regular (non-special).
function filterSpecialDividends(dividends: DividendRecord[]): {
  regular: DividendRecord[]
  hasSpecial: boolean
} {
  if (dividends.length === 0) return { regular: [], hasSpecial: false }
  const amounts = dividends.map(d => d.amount).sort((a, b) => a - b)
  const medianAmt = calcMedian(amounts)
  const threshold = medianAmt * 2.5  // >2.5× median = special
  const special = dividends.filter(d => d.amount > threshold && medianAmt > 0)
  if (special.length === 0) return { regular: dividends, hasSpecial: false }
  return { regular: dividends.filter(d => d.amount <= threshold), hasSpecial: true }
}

function calcLastAnnualDiv(dividends: DividendRecord[]): number {
  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const recent = dividends.filter(d => new Date(d.date) >= oneYearAgo)
  if (recent.length > 0) return recent.reduce((s, d) => s + d.amount, 0)
  // Fallback: last calendar year
  const lastYear = now.getFullYear() - 1
  const lastYrDivs = dividends.filter(d => d.year === lastYear)
  return lastYrDivs.reduce((s, d) => s + d.amount, 0)
}

// ─── Core Scan ────────────────────────────────────────────────────────────────

export async function scanStock(stock: StockUniverse): Promise<ScanResult> {
  const base: ScanResult = {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    currentPrice: 0,
    fiftyTwoWeekHigh: 0,
    fiftyTwoWeekLow: 0,
    pricePercentile: 50,
    dividends: [],
    annualDividends: [],
    lastAnnualDiv: 0,
    regularLastAnnualDiv: 0,
    hasSpecialDividend: false,
    currentYield: 0,
    dividendYears: 0,
    consistency: 0,
    growthCAGR: 0,
    frequency: 0,
    hasDividendCut: false,
    historicalYields: [],
    medianHistoricalYield: 0,
    yieldPercentile: 50,
    fairPrice: 0,
    chowder: 0,
    score: 0,
    valuationSignal: 'fair',
    meetsFilter: false,
  }

  const data = await fetchChartData(stock.ticker)
  if (!data) return { ...base, error: 'โหลดข้อมูลไม่ได้' }

  const { meta, dividends, prices } = data

  const currentPrice: number = meta?.regularMarketPrice ?? 0
  const fiftyTwoWeekHigh: number = meta?.fiftyTwoWeekHigh ?? 0
  const fiftyTwoWeekLow: number = meta?.fiftyTwoWeekLow ?? 0

  if (currentPrice <= 0) return { ...base, error: 'ไม่มีข้อมูลราคา' }

  // Price percentile in 5yr range
  const allPrices = prices.map(p => p.close)
  const pricePercentile = calcPercentile(currentPrice, allPrices)

  // Dividend calculations
  const fiveYearsAgo = new Date()
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
  const divs5yr = dividends.filter(d => new Date(d.date) >= fiveYearsAgo)
  const annualDividends = groupByYear(divs5yr)
  const dividendYears = annualDividends.length

  // Fix #1: Separate special (one-off) dividends from regular recurring ones.
  // Yield, fairPrice, score all use regularLastAnnualDiv to avoid distortion.
  const lastAnnualDiv = calcLastAnnualDiv(dividends)
  const { regular: regularDivs5yr, hasSpecial: hasSpecialDividend } = filterSpecialDividends(divs5yr)
  const regularLastAnnualDiv = calcLastAnnualDiv(regularDivs5yr)
  // If no regular dividends found at all, fall back to total (edge case)
  const yieldBase = regularLastAnnualDiv > 0 ? regularLastAnnualDiv : lastAnnualDiv
  const currentYield = yieldBase > 0 ? yieldBase / currentPrice : 0

  // Fix #5: growthCAGR now uses median-YoY on regular dividends grouped by year
  const regularAnnualDivs = groupByYear(regularDivs5yr)
  const growthCAGR = calcGrowthCAGR(regularAnnualDivs.length >= 2 ? regularAnnualDivs : annualDividends)

  const frequency = dividendYears > 0
    ? annualDividends.reduce((s, a) => s + a.count, 0) / dividendYears
    : 0

  // Check for dividend cuts (>50% drop year-over-year) on regular dividends
  let hasDividendCut = false
  for (let i = 1; i < annualDividends.length; i++) {
    const prev = annualDividends[i - 1].total
    const curr = annualDividends[i].total
    if (prev > 0 && curr / prev < 0.5) { hasDividendCut = true; break }
  }

  // Historical yield: use regular annual dividends per year for accuracy
  const regularByYear = new Map(regularAnnualDivs.map(a => [a.year, a.total]))
  const historicalYields: number[] = []
  for (const ann of annualDividends) {
    const yearEndPrice = prices.find(p => p.date.startsWith(`${ann.year}-12`))?.close
      ?? prices.filter(p => p.date.startsWith(`${ann.year}`)).pop()?.close
    const regularTotal = regularByYear.get(ann.year) ?? ann.total
    if (yearEndPrice && yearEndPrice > 0 && regularTotal > 0) {
      historicalYields.push(regularTotal / yearEndPrice)
    }
  }

  const medianHistoricalYield = calcMedian(historicalYields)
  const yieldPercentile = historicalYields.length > 0
    ? calcPercentile(currentYield, historicalYields)
    : 50
  // Fix #1 (continued): fairPrice uses regularLastAnnualDiv, not the special-inflated total
  const fairPrice = medianHistoricalYield > 0 ? yieldBase / medianHistoricalYield : 0

  // Chowder number: yield% + growth% (both now use regular/robust values)
  const chowder = (currentYield * 100) + (growthCAGR * 100)

  // Fix #6: Score uses regularLastAnnualDiv-based currentYield — immune to special div inflation
  let score = 0
  score += Math.min(25, (currentYield / 0.08) * 25)          // yield (max at 8%)
  score += (dividendYears / 5) * 20                           // consistency
  score += hasDividendCut ? 0 : 10                            // no dividend cut
  score += Math.min(20, Math.max(0, growthCAGR * 200))        // growth (max at 10%)
  score += Math.min(15, chowder > 12 ? 15 : (chowder / 12) * 15)  // chowder
  score += Math.min(10, (yieldPercentile / 100) * 10)         // yield percentile (valuation)
  score = Math.min(100, Math.round(score))

  // Valuation signal
  let valuationSignal: ScanResult['valuationSignal'] = 'fair'
  if (yieldPercentile >= 65) valuationSignal = 'attractive'
  else if (yieldPercentile <= 35) valuationSignal = 'expensive'

  return {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    currentPrice,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    pricePercentile,
    dividends: divs5yr,
    annualDividends,
    lastAnnualDiv,
    regularLastAnnualDiv: yieldBase,
    hasSpecialDividend,
    currentYield,
    dividendYears,
    consistency: dividendYears / 5,
    growthCAGR,
    frequency,
    hasDividendCut,
    historicalYields,
    medianHistoricalYield,
    yieldPercentile,
    fairPrice,
    chowder,
    score,
    valuationSignal,
    meetsFilter: false,
  }
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export interface ScanFilter {
  minYield: number          // 0.04 = 4%
  minConsistencyYears: number  // 3–5
  minChowder: number        // default 8
  hideExpensive: boolean
  maxPricePercentile: number // default 80
}

export const DEFAULT_FILTER: ScanFilter = {
  minYield: 0.04,
  minConsistencyYears: 3,
  minChowder: 8,
  hideExpensive: false,
  maxPricePercentile: 85,
}

export function applyFilter(result: ScanResult, filter: ScanFilter): boolean {
  if (result.error) return false
  if (result.currentYield < filter.minYield) return false
  if (result.dividendYears < filter.minConsistencyYears) return false
  if (result.chowder < filter.minChowder) return false  // Fix #2: was missing
  if (filter.hideExpensive && result.pricePercentile > filter.maxPricePercentile) return false
  return true
}

// ─── Portfolio Recommendation ─────────────────────────────────────────────────

export interface PortfolioContext {
  costPerUnit: number
  currentPrice: number
  shares: number
  currentValue: number
  costBasis: number
}

export function getPortfolioRecommendation(
  result: ScanResult,
  ctx: PortfolioContext,
  alternativeYield?: number  // best alternative stock yield for opportunity cost
): PortfolioRecommendation {
  const pnlPct = ctx.costBasis > 0 ? (ctx.currentValue - ctx.costBasis) / ctx.costBasis : 0
  const isProfit = pnlPct >= 0
  const isStrongFundamentals = result.chowder >= 10 && result.dividendYears >= 3 && !result.hasDividendCut
  const isCheapOrFair = result.valuationSignal === 'attractive' || result.valuationSignal === 'fair'
  const isExpensive = result.valuationSignal === 'expensive'
  const isWeakFundamentals = result.dividendYears < 3 || result.hasDividendCut || result.chowder < 6

  const reason: string[] = []

  // Quadrant logic
  if (isCheapOrFair && isStrongFundamentals) {
    const action: PortfolioRecommendation['action'] = 'buy_more'
    reason.push(`ราคาอยู่ที่ ${result.pricePercentile}th percentile (ค่อนข้างถูก)`)
    reason.push(`Yield ${(result.currentYield * 100).toFixed(1)}% > ค่าเฉลี่ยประวัติ`)
    reason.push(`Chowder ${result.chowder.toFixed(1)} — พื้นฐานแข็ง`)
    if (!isProfit) {
      reason.push(`ขาดทุนอยู่ ${(pnlPct * 100).toFixed(1)}% — ซื้อเพิ่มลด cost basis ได้`)
      // Fix #4: use shares × currentPrice (cost of new purchase), not currentValue (stale market value)
      const newCost = ctx.shares > 0
        ? (ctx.costBasis + ctx.shares * result.currentPrice) / (ctx.shares * 2)
        : 0
      return {
        action,
        reason,
        averageDownNote: `ถ้าซื้อเพิ่ม ${ctx.shares.toLocaleString()} หุ้น: cost basis ใหม่ ≈ ฿${newCost.toFixed(2)}/หุ้น`,
      }
    }
    return { action, reason }
  }

  if (isExpensive && isStrongFundamentals) {
    const action: PortfolioRecommendation['action'] = 'hold_no_add'
    reason.push(`ราคาอยู่ที่ ${result.pricePercentile}th percentile (ค่อนข้างแพง)`)
    reason.push(`Chowder ${result.chowder.toFixed(1)} — พื้นฐานยังดี ไม่ควรขาย`)
    if (result.fairPrice > 0) {
      reason.push(`รอราคาลงมาแถว ฿${result.fairPrice.toFixed(2)} ก่อนซื้อเพิ่ม`)
    }
    return { action, reason }
  }

  if (isCheapOrFair && isWeakFundamentals) {
    const action: PortfolioRecommendation['action'] = 'hold'
    reason.push(`ราคาถูกแต่พื้นฐานมีสัญญาณเตือน`)
    if (result.hasDividendCut) reason.push(`มีการตัดปันผลในช่วง 5 ปีที่ผ่านมา`)
    if (result.dividendYears < 3) reason.push(`จ่ายปันผลไม่สม่ำเสมอ (${result.dividendYears}/5 ปี)`)
    reason.push(`เฝ้าดูปันผลรอบหน้า — ถ้าตัดอีกควรพิจารณาขาย`)
    return { action, reason }
  }

  // Expensive + Weak fundamentals → Consider selling
  const action: PortfolioRecommendation['action'] = 'consider_sell'
  reason.push(`ราคาอยู่ที่ ${result.pricePercentile}th percentile (แพง)`)
  if (result.hasDividendCut) reason.push(`ปันผลลดลงอย่างมีนัยสำคัญ`)
  if (result.dividendYears < 3) reason.push(`จ่ายปันผลไม่สม่ำเสมอ`)
  if (result.chowder < 6) reason.push(`Chowder ${result.chowder.toFixed(1)} ต่ำกว่าเกณฑ์`)

  let opportunityCost: string | undefined
  if (alternativeYield && alternativeYield > result.currentYield && ctx.currentValue > 0) {
    const altAnnualDiv = ctx.currentValue * alternativeYield
    const curAnnualDiv = ctx.currentValue * result.currentYield
    opportunityCost = `เงิน ฿${ctx.currentValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })} นี้ถ้าย้ายไปหุ้นที่ดีกว่า (yield ${(alternativeYield * 100).toFixed(1)}%) จะได้ปันผล ฿${altAnnualDiv.toLocaleString('th-TH', { maximumFractionDigits: 0 })}/ปี vs ฿${curAnnualDiv.toLocaleString('th-TH', { maximumFractionDigits: 0 })}/ปี ตอนนี้`
  }

  if (isProfit) {
    reason.push(`ล็อกกำไร ${(pnlPct * 100).toFixed(1)}% ก่อนพื้นฐานแย่ลง`)
  } else {
    reason.push(`ตัดขาดทุน ${(pnlPct * 100).toFixed(1)}% — การถือต่อมี opportunity cost`)
  }

  return { action, reason, opportunityCost }
}
