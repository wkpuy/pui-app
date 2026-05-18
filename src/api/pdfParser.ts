import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

// Hardcoded CDN worker URL — bypasses SW caching, no dependency on version export
GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs'

export interface CreditCardTransaction {
  transDate: string
  postDate: string
  description: string
  amount: number        // positive = charge, negative = credit/refund
  isPayment: boolean
  bankName: string
  cardType?: string
  installmentInfo?: { current: number; total: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAmt(s: string): number {
  s = s.replace(/,/g, '').trim()
  const isCR = s.toUpperCase().endsWith('CR')
  const n = parseFloat(isCR ? s.slice(0, -2).trim() : s)
  return isNaN(n) ? NaN : isCR ? -Math.abs(n) : n
}

// "DD/MM/YY" → "YYYY-MM-DD"
function ddmmyyToIso(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{2})\/(\d{2})$/)
  if (!m) return ''
  return `${2000 + parseInt(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

// "DD" + "MMM" + year → "YYYY-MM-DD"
function ddMmmToIso(dd: string, mmm: string, year: number): string {
  const mm = MONTHS[mmm.toUpperCase()]
  return mm ? `${year}-${mm}-${dd.padStart(2, '0')}` : ''
}

// ─── Text extraction ──────────────────────────────────────────────────────────

interface TextPiece { x: number; y: number; str: string }

function groupIntoRows(pieces: TextPiece[], tolerance = 4): TextPiece[][] {
  if (!pieces.length) return []
  const sorted = [...pieces].sort((a, b) => b.y - a.y)
  const rows: TextPiece[][] = []
  let row = [sorted[0]]
  let rowY = sorted[0].y
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - rowY) <= tolerance) {
      row.push(sorted[i])
    } else {
      rows.push(row)
      row = [sorted[i]]
      rowY = sorted[i].y
    }
  }
  if (row.length) rows.push(row)
  return rows
}

async function extractLines(buffer: ArrayBuffer): Promise<string[]> {
  const pdf = await getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    const pieces: TextPiece[] = []
    for (const item of content.items as any[]) {
      const str: string = item.str ?? ''
      if (!str.trim()) continue
      pieces.push({ x: item.transform[4], y: item.transform[5], str })
    }

    for (const row of groupIntoRows(pieces)) {
      const line = row
        .sort((a, b) => a.x - b.x)
        .map(p => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) lines.push(line)
    }
  }
  return lines
}

// ─── KTC ─────────────────────────────────────────────────────────────────────
// Format: DD/MM/YY  DD/MM/YY  DESCRIPTION  AMOUNT
// Installment prefix: "XX/YY DESCRIPTION"

const DATE_SLASH = /^\d{1,2}\/\d{2}\/\d{2}$/

function parseKTC(lines: string[]): CreditCardTransaction[] {
  const txns: CreditCardTransaction[] = []
  let active = false

  for (const line of lines) {
    if (!active && (line.includes('TRANS. DATE') || line.includes('วันที่ใช้บัตร') || line.includes('ยอดเรียกเก็บรอบที่แล้ว'))) {
      active = true; continue
    }
    if (active && line.includes('สรุปยอดรอบนี้')) break
    if (!active) continue

    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) continue
    if (!DATE_SLASH.test(parts[0]) || !DATE_SLASH.test(parts[1])) continue

    const transDate = ddmmyyToIso(parts[0])
    const postDate = ddmmyyToIso(parts[1])
    if (!transDate) continue

    const amtStr = parts[parts.length - 1]
    const amount = parseAmt(amtStr)
    if (isNaN(amount)) continue

    const description = parts.slice(2, parts.length - 1).join(' ')
    const isPayment = /PAYMENT/i.test(description)

    let installmentInfo: { current: number; total: number } | undefined
    const inst = description.match(/^(\d{2,3})\/(\d{2,3})\s+/)
    if (inst) installmentInfo = { current: parseInt(inst[1]), total: parseInt(inst[2]) }

    txns.push({ transDate, postDate, description, amount, isPayment, bankName: 'KTC', installmentInfo })
  }
  return txns
}

// ─── KBANK ───────────────────────────────────────────────────────────────────
// Multiple card sections per statement
// Format: DD/MM/YY  DD/MM/YY  DESCRIPTION  AMOUNT
// Installment suffix: "DESCRIPTION : XX/YY"

function parseKBANK(lines: string[]): CreditCardTransaction[] {
  const txns: CreditCardTransaction[] = []
  let cardType = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track card type header
    if (/KBANK[-\s](SHOPEE|PLUSTINUM|MASTERCARD|JCB|PLATINUM|VISA)/i.test(line)) {
      const m = line.match(/KBANK[-\s]\w+/i)
      if (m) cardType = m[0].toUpperCase()
    }

    if (!line.includes('PREVIOUS BALANCE')) continue

    // Parse this card section until TOTAL BALANCE
    let j = i + 1
    while (j < lines.length && !lines[j].includes('TOTAL BALANCE')) {
      const sline = lines[j]
      j++

      const parts = sline.trim().split(/\s+/)
      if (parts.length < 4) continue
      if (!DATE_SLASH.test(parts[0]) || !DATE_SLASH.test(parts[1])) continue

      const transDate = ddmmyyToIso(parts[0])
      const postDate = ddmmyyToIso(parts[1])
      if (!transDate) continue

      const amtStr = parts[parts.length - 1]
      const amount = parseAmt(amtStr)
      if (isNaN(amount)) continue

      const description = parts.slice(2, parts.length - 1).join(' ')
      const isPayment = /PAYMENT/i.test(description)

      let installmentInfo: { current: number; total: number } | undefined
      const instEnd = description.match(/:?\s*(\d{2,3})\/(\d{2,3})\s*$/)
      const instStart = description.match(/^(\d{2,3})\/(\d{2,3})\s+/)
      const inst = instEnd || instStart
      if (inst) installmentInfo = { current: parseInt(inst[1]), total: parseInt(inst[2]) }

      txns.push({ transDate, postDate, description, amount, isPayment, bankName: 'KBANK', cardType: cardType || undefined, installmentInfo })
    }
  }
  return txns
}

// ─── UOB ─────────────────────────────────────────────────────────────────────
// Format: POST_DD POST_MMM  TRANS_DD TRANS_MMM  DESCRIPTION  AMOUNT [CR]

function parseUOB(lines: string[]): CreditCardTransaction[] {
  const txns: CreditCardTransaction[] = []
  let year = new Date().getFullYear()
  let inSection = false
  let cardType = 'UOB ONE'

  // Extract year from statement
  for (const line of lines) {
    const m = line.match(/\b(20\d{2})\b/)
    if (m) { year = parseInt(m[1]); break }
  }

  for (const line of lines) {
    if (/UOB ONE|UOB CREDIT|UOB VISA|UOB MASTERCARD/i.test(line)) {
      const m = line.match(/UOB[\s-]\w+/i)
      if (m) cardType = m[0].toUpperCase()
      inSection = true
      continue
    }
    if (/SUB TOTAL|TOTAL BALANCE|TOTAL FEE/i.test(line)) { inSection = false; continue }
    if (/PREVIOUS BALANCE/i.test(line)) continue
    if (!inSection) continue

    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    if (!/^\d{2}$/.test(parts[0]) || !MONTHS[parts[1]?.toUpperCase()]) continue
    if (!/^\d{2}$/.test(parts[2]) || !MONTHS[parts[3]?.toUpperCase()]) continue

    const postDate = ddMmmToIso(parts[0], parts[1], year)
    const transDate = ddMmmToIso(parts[2], parts[3], year)

    let amtIdx = parts.length - 1
    const isCR = parts[amtIdx].toUpperCase() === 'CR'
    if (isCR) amtIdx--

    const amount = parseAmt(parts[amtIdx] + (isCR ? 'CR' : ''))
    if (isNaN(amount)) continue

    const description = parts.slice(4, amtIdx).join(' ')
    const isPayment = /PAYMENT THANK YOU/i.test(description)

    txns.push({ transDate, postDate, description, amount, isPayment, bankName: 'UOB', cardType })
  }
  return txns
}

// ─── KRUNGSRI ────────────────────────────────────────────────────────────────
// Handles both regular transactions and "ผ่อนชำระรายเดือน" installment section
// Installment column "งวดที่เรียกเก็บ": 003/006 (3-digit) or 03/06 (2-digit)

const INST_RE = /(\d{2,3})\/(\d{2,3})/

function parseKRUNGSRI(lines: string[]): CreditCardTransaction[] {
  const txns: CreditCardTransaction[] = []
  let active = false
  let inInstallmentSection = false

  for (const line of lines) {
    // Detect installment section header
    if (/ผ่อนชำระรายเดือน|INSTALLMENT|แผนผ่อนชำระ/i.test(line)) {
      inInstallmentSection = true
    }
    if (!active && (/วันที่รายการ|TRANS.*DATE|TRANSACTION DATE|PREVIOUS BALANCE/i.test(line))) {
      active = true; continue
    }
    if (active && /ยอดรวม|TOTAL AMOUNT|ยอดค้างชำระ|NEW BALANCE/i.test(line)) {
      active = false; inInstallmentSection = false; continue
    }
    if (!active) continue

    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    if (!DATE_SLASH.test(parts[0])) continue

    const amtStr = parts[parts.length - 1]
    const amount = parseAmt(amtStr)
    if (isNaN(amount)) continue

    let transDate: string, postDate: string, descStart: number
    if (parts.length >= 3 && DATE_SLASH.test(parts[1])) {
      transDate = ddmmyyToIso(parts[0])
      postDate = ddmmyyToIso(parts[1])
      descStart = 2
    } else {
      transDate = ddmmyyToIso(parts[0])
      postDate = transDate
      descStart = 1
    }
    if (!transDate) continue

    // Amount is last token; installment col (งวดที่เรียกเก็บ) may be second-to-last
    let descEnd = parts.length - 1
    let installmentInfo: { current: number; total: number } | undefined

    // Check if second-to-last token is an installment number e.g. 003/006
    const possibleInst = parts[descEnd - 1]
    if (possibleInst && INST_RE.test(possibleInst) && !DATE_SLASH.test(possibleInst)) {
      const m = possibleInst.match(INST_RE)!
      installmentInfo = { current: parseInt(m[1]), total: parseInt(m[2]) }
      descEnd-- // exclude installment col from description
    }

    const description = parts.slice(descStart, descEnd).join(' ')
    const isPayment = /PAYMENT/i.test(description)

    // Also detect inline installment prefix/suffix: "03/06 DESC" or "DESC 03/06"
    if (!installmentInfo) {
      const instStart = description.match(/^(\d{2,3})\/(\d{2,3})\s+/)
      const instEnd = description.match(/:?\s*(\d{2,3})\/(\d{2,3})\s*$/)
      const inst = instStart || instEnd
      if (inst) installmentInfo = { current: parseInt(inst[1]), total: parseInt(inst[2]) }
    }

    // Force installmentInfo if we're inside installment section
    if (inInstallmentSection && !installmentInfo) {
      const anyInst = line.match(INST_RE)
      if (anyInst) installmentInfo = { current: parseInt(anyInst[1]), total: parseInt(anyInst[2]) }
    }

    txns.push({ transDate, postDate, description, amount, isPayment, bankName: 'KRUNGSRI', installmentInfo })
  }
  return txns
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseBillPdf(
  buffer: ArrayBuffer,
  bankName: string
): Promise<CreditCardTransaction[]> {
  const lines = await extractLines(buffer)
  const bank = bankName.toUpperCase()

  let txns: CreditCardTransaction[]
  if (bank.includes('KTC')) txns = parseKTC(lines)
  else if (bank.includes('KBANK')) txns = parseKBANK(lines)
  else if (bank.includes('UOB')) txns = parseUOB(lines)
  else if (bank.includes('KRUNGSRI') || bank.includes('BAY')) txns = parseKRUNGSRI(lines)
  else {
    const flat = lines.join('\n')
    if (/KRUNGTHAI CARD|KTC VISA|KTC MASTERCARD/i.test(flat)) txns = parseKTC(lines)
    else if (/KASIKORNBANK|กสิกรไทย/i.test(flat)) txns = parseKBANK(lines)
    else if (/UOB ONE|ยูโอบี/i.test(flat)) txns = parseUOB(lines)
    else if (/KRUNGSRI|กรุงศรี/i.test(flat)) txns = parseKRUNGSRI(lines)
    else txns = parseKTC(lines)
  }

  // Filter out pure payment entries; keep credits/refunds
  return txns.filter(t => !t.isPayment)
}
