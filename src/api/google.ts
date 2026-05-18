// Google OAuth2 + Calendar + Gmail + Drive
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

export async function signInWithGoogle(clientId: string): Promise<{ accessToken: string; email: string }> {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin
    const state = Math.random().toString(36).slice(2)
    sessionStorage.setItem('oauth_state', state)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: SCOPES,
      state,
    })

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'google_oauth',
      'width=500,height=600'
    )

    const timer = setInterval(async () => {
      try {
        if (!popup || popup.closed) {
          clearInterval(timer)
          reject(new Error('Popup closed'))
          return
        }
        const url = new URL(popup.location.href)
        if (url.origin === window.location.origin) {
          clearInterval(timer)
          popup.close()
          const hash = new URLSearchParams(url.hash.slice(1))
          const accessToken = hash.get('access_token')
          if (!accessToken) { reject(new Error('No token')); return }
          // Get user email
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const info = await res.json()
          resolve({ accessToken, email: info.email })
        }
      } catch {
        // still waiting for redirect
      }
    }, 500)
  })
}

export async function fetchCalendarEvents(accessToken: string, timeMinIso?: string, timeMaxIso?: string) {
  const now = new Date()
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    timeMin: timeMinIso ?? now.toISOString(),
    timeMax: timeMaxIso ?? future.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) throw new Error(`Google Calendar error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'Google Calendar error')
  return data.items || []
}

export interface ParsedDividendEvent {
  title: string
  ticker: string           // e.g. "LH", "BEC"
  date: string             // YYYY-MM-DD
  eventType: 'dividend' | 'xd' | 'other'
  amountPerShare: number   // บาท/หุ้น
  totalReceived: number    // เงินที่จะได้รับ
  shares: number           // จำนวนที่ถือ
  rawDescription: string
}

// Title format: [TICKER] วันที่จ่ายปันผล  or  [TICKER] วันขึ้นเครื่องหมาย XD
const TICKER_RE = /^\[([A-Z0-9-]+)\]/i

function parseDescription(desc: string) {
  const clean = desc.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

  const sharesMatch = clean.match(/จำนวนที่ถือ\s*[:\s]\s*([\d,]+)\s*หุ้น/i)
  const perShareMatch = clean.match(/ปันผล\s*[:\s]\s*([\d.]+)\s*บาท\/หุ้น/i)
  const totalMatch = clean.match(/เงินที่จะได้รับ\s*[:\s]\s*([\d,.]+)\s*บาท/i)

  return {
    shares: sharesMatch ? parseFloat(sharesMatch[1].replace(/,/g, '')) : 0,
    amountPerShare: perShareMatch ? parseFloat(perShareMatch[1]) : 0,
    totalReceived: totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0,
  }
}

export function parseDividendEvents(events: any[]): ParsedDividendEvent[] {
  return events
    .filter((e: any) => {
      const title: string = e.summary || ''
      return TICKER_RE.test(title) && (title.includes('ปันผล') || title.includes('XD') || title.includes('xd'))
    })
    .map((e: any) => {
      const title: string = e.summary || ''
      const tickerMatch = title.match(TICKER_RE)
      const ticker = tickerMatch ? tickerMatch[1].toUpperCase() : ''
      const date: string = e.start?.date || e.start?.dateTime?.slice(0, 10) || ''
      const eventType: ParsedDividendEvent['eventType'] =
        title.includes('XD') || title.includes('xd') ? 'xd' : title.includes('ปันผล') ? 'dividend' : 'other'
      const desc = e.description || ''
      const parsed = parseDescription(desc)

      return {
        title,
        ticker,
        date,
        eventType,
        amountPerShare: parsed.amountPerShare,
        totalReceived: parsed.totalReceived,
        shares: parsed.shares,
        rawDescription: desc,
      }
    })
}

// sinceDate: YYYY/MM/DD (Gmail format). If omitted → 7 days back.
export async function fetchGmailBankMessages(accessToken: string, sinceDate?: string) {
  const timeFilter = sinceDate ? `after:${sinceDate}` : `after:${toGmailDate(Date.now() - 7 * 24 * 3600 * 1000)}`
  // KBank (KPLUS@kasikornbank.com) + Bangkok Bank (BualuangmBanking@bangkokbank.com) only
  const query = encodeURIComponent(
    `(from:(kasikornbank.com OR bangkokbank.com)` +
    ` OR subject:("Result of Funds Transfer" OR "Result of PromptPay" OR "Result of Bill Payment"` +
    ` OR "ยืนยันการชำระเงิน" OR "ยืนยันการโอนเงิน" OR "ยืนยันการเติมเงิน"))` +
    ` ${timeFilter}`
  )
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  const data = await res.json()
  if (!data.messages) return []

  // Fetch full message details in batches of 5 to avoid rate limits
  const results: any[] = []
  const ids = data.messages.slice(0, 60)
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5)
    const batchResults = await Promise.all(
      batch.map((m: any) =>
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then(r => r.json())
      )
    )
    results.push(...batchResults)
  }
  return results
}

// Thai full month names (BBL uses พ.ศ. dates like "8 พฤษภาคม 2569")
const THAI_MONTHS_FULL: Record<string, string> = {
  มกราคม: '01', กุมภาพันธ์: '02', มีนาคม: '03', เมษายน: '04',
  พฤษภาคม: '05', มิถุนายน: '06', กรกฎาคม: '07', สิงหาคม: '08',
  กันยายน: '09', ตุลาคม: '10', พฤศจิกายน: '11', ธันวาคม: '12',
}

// Parse Thai Buddhist-era date string → "YYYY-MM-DD" (AD)
// Handles: "8 พฤษภาคม 2569", "08/05/2569", "08/05/2026"
function parseThaiDate(s: string): string {
  // "DD MMMM BBBB" Thai full month
  const fullMatch = s.match(/(\d{1,2})\s+([฀-๿]+)\s+(\d{4})/)
  if (fullMatch) {
    const mm = THAI_MONTHS_FULL[fullMatch[2]]
    if (mm) {
      const rawYear = parseInt(fullMatch[3])
      const year = rawYear > 2400 ? rawYear - 543 : rawYear  // แปลง พ.ศ. → ค.ศ.
      return `${year}-${mm}-${fullMatch[1].padStart(2, '0')}`
    }
  }
  // "DD/MM/BBBB" or "DD/MM/YYYY"
  const slashMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashMatch) {
    const rawYear = parseInt(slashMatch[3])
    const year = rawYear > 2400 ? rawYear - 543 : rawYear
    return `${year}-${slashMatch[2]}-${slashMatch[1]}`
  }
  return ''
}

function toGmailDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function calcSinceDate(monthsSelection: number): string {
  const now = new Date()
  // monthsSelection=1 → this month only (day 1 of current month)
  // monthsSelection=2 → this month + prev month (day 1 of month-1)
  // monthsSelection=3 → this month + 2 prev months (day 1 of month-2)
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsSelection - 1), 1)
  return toGmailDate(start.getTime())
}

export function parseBankEmail(message: any) {
  const headers = message.payload?.headers || []
  const subject: string = headers.find((h: any) => h.name === 'Subject')?.value || ''
  const from: string = headers.find((h: any) => h.name === 'From')?.value || ''
  const dateHeader: string = headers.find((h: any) => h.name === 'Date')?.value || ''
  const bodyRaw = extractEmailBody(message.payload)

  // Decode HTML entities — numeric (&#40; → '('), hex (&#x28; → '('), and named
  const body = bodyRaw
    .replace(/<[^>]*>/g, ' ')               // strip HTML tags
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&lpar;/g, '(').replace(/&rpar;/g, ')')
    .replace(/\s+/g, ' ')
    .trim()

  // KBank: KPLUS@kasikornbank.com — "Result of Funds Transfer/PromptPay/Bill Payment (Success)"
  // BBL:   BualuangmBanking@bangkokbank.com — "ยืนยันการชำระเงิน/โอนเงิน/เติมเงินพร้อมเพย์"
  const isKBank = from.includes('kasikornbank.com')
              || /Result of .*(Transfer|Payment)/i.test(subject)
  const isBBL = from.includes('bangkokbank.com')

  let amount = 0
  let description = subject
  let txDate = ''
  let rawRef: string = message.id as string

  // ── KBank / KPLUS ──────────────────────────────────────────────
  if (isKBank) {
    // Amount: "จำนวนเงิน (บาท): 80.00"  — parens may have been HTML-encoded
    const amtMatch = body.match(/จำนวนเงิน\s*[(（]บาท[)）]\s*[:\s]\s*([\d,]+\.?\d*)/)
                  ?? body.match(/จำนวนเงิน[^0-9]*([\d,]+\.?\d*)\s*บาท/)
    amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0

    // Date: "วันที่ทำรายการ: 18/05/2026  18:08:43"
    const dateMatch = body.match(/วันที่ทำรายการ\s*[:\s]\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (dateMatch) txDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

    // Transaction ref → use as rawRef for stable dedup
    const refMatch = body.match(/เลขที่รายการ\s*[:\s]\s*([A-Z0-9]{6,30})/i)
    if (refMatch) rawRef = `kbank_${refMatch[1]}`

    // Description: ชื่อบัญชี → stop before next label (จำนวนเงิน / ค่าธรรมเนียม / ยอด)
    const nameMatch = body.match(/ชื่อบัญชี\s*[:\s]\s*(.+?)(?=\s+(?:จำนวนเงิน|ค่าธรรมเนียม|ยอด|เลขที่|วันที่))/)
                   ?? body.match(/ชื่อผู้รับเงิน\s*[:\s]\s*(.+?)(?=\s+(?:จำนวนเงิน|ค่าธรรมเนียม|ยอด))/)
                   ?? body.match(/เพื่อเข้าบัญชีบริษัท\s*[:\s]\s*(.+?)(?=\s+(?:จำนวนเงิน|ชื่อบัญชี|ค่าธรรมเนียม))/)
                   ?? body.match(/ชำระให้\s*[:\s]\s*(.+?)(?=\s+(?:จำนวนเงิน|ค่าธรรมเนียม|ยอด))/)
    if (nameMatch) description = nameMatch[1].trim()

  // ── Bangkok Bank (BualuangmBanking@bangkokbank.com) ─────────────
  // Subject: "ยืนยันการชำระเงิน" / "ยืนยันการโอนเงิน" / "ยืนยันการเติมเงินพร้อมเพย์"
  // Amount:  "จำนวนเงิน (บาท)   6,770.00"  (whitespace separator, no colon)
  // Date:    "วันที่   8 พฤษภาคม 2569 เวลา 17:03:53 น."  (พ.ศ. → subtract 543)
  // Ref:     "หมายเลขอ้างอิง   405609"
  // Payee:   "ชื่อบริษัท / ชื่อผู้ให้บริการ   ป้าหมู"  (bill payment)
  //      or  "ชื่อผู้รับเงิน   นาย ..."              (transfer)
  } else if (isBBL) {
    // Amount — no colon, just whitespace between label and value
    const amtMatch = body.match(/จำนวนเงิน\s*[(（]บาท[)）]\s+([\d,]+\.?\d*)/)
                  ?? body.match(/จำนวนเงิน[^0-9]*([\d,]+\.?\d*)\s*บาท/)
    amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0

    // Date — Thai full-month พ.ศ. format: "8 พฤษภาคม 2569"
    const dateSection = body.match(/วันที่\s+(.+?)(?:\s+เวลา|\s+น\.\s|\s*$)/)
    txDate = dateSection ? parseThaiDate(dateSection[1]) : ''

    // Reference for dedup
    const refMatch = body.match(/หมายเลขอ้างอิง\s+(\d+)/)
    if (refMatch) rawRef = `bbl_${refMatch[1]}`

    // Payee — bill payment:    "ชื่อบริษัท / ชื่อผู้ให้บริการ   ป้าหมู"
    //          transfer:        "ชื่อบัญชี   น.ส. วารุณี ก่อทรัพย์"
    //          PromptPay topup: "ชื่อเจ้าของ e-wallet   น.ส. ชาคริยา ศรีเมือง"
    // Stop before next field label so we don't swallow extra columns
    const STOP = /จาก|ไปที่|จำนวนเงิน|ค่าธรรมเนียม|หมายเลข|บันทึก|เลขที่|รหัสบริษัท|ธนาคาร|ค่าบริการ|ชื่อผู้ให้บริการ/
    const stopAhead = `(?=\\s+(?:${STOP.source}))`
    const payeeMatch =
      body.match(new RegExp(`ชื่อบริษัท\\s*\\/\\s*ชื่อผู้ให้บริการ\\s+(.+?)${stopAhead}`))
   ?? body.match(new RegExp(`ชื่อเจ้าของ\\s+e-wallet\\s+(.+?)${stopAhead}`))
   ?? body.match(new RegExp(`ชื่อผู้รับเงิน\\s+(.+?)${stopAhead}`))
   ?? body.match(new RegExp(`ชื่อบัญชี\\s+(.+?)${stopAhead}`))
    if (payeeMatch) description = payeeMatch[1].trim()
  }

  // ── Universal fallbacks if specific parsing failed ──────────────
  if (amount === 0) {
    const patterns = [
      /จำนวนเงิน\s*[(（]บาท[)）]\s*[:\s]\s*([\d,]+\.?\d*)/,
      /จำนวนเงิน[^\d]*([\d,]+\.?\d*)\s*บาท/,
      /ยอดเงิน[^\d]*([\d,]+\.?\d*)\s*บาท/,
      /THB\s*([\d,]+\.?\d*)/i,
      /([\d,]+\.\d{2})\s*บาท/,
    ]
    for (const pat of patterns) {
      const m = body.match(pat) ?? subject.match(pat)
      if (m) { amount = parseFloat(m[1].replace(/,/g, '')); if (amount > 0) break }
    }
  }
  if (!txDate) {
    // Try DD/MM/YYYY (or DD/MM/BBBB พ.ศ.)
    const slashPatterns = [
      /วันที่ทำรายการ\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/,
      /วันที่\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/,
      /(\d{2}\/\d{2}\/\d{4})/,
    ]
    for (const pat of slashPatterns) {
      const m = body.match(pat) ?? subject.match(pat)
      if (m) { txDate = parseThaiDate(m[1]); if (txDate) break }
    }
    // Try Thai full-month date: "8 พฤษภาคม 2569"
    if (!txDate) {
      const thaiMatch = body.match(/(\d{1,2}\s+[฀-๿]+\s+\d{4})/)
      if (thaiMatch) txDate = parseThaiDate(thaiMatch[1])
    }
  }
  if (!txDate) {
    try { txDate = new Date(dateHeader).toISOString().slice(0, 10) } catch { txDate = '' }
  }

  const source = isKBank ? 'kasikorn' : isBBL ? 'bangkok_bank' : 'other'

  return {
    date: txDate || new Date().toISOString().slice(0, 10),
    amount,
    type: 'expense' as 'income' | 'expense',
    description,
    source,
    rawRef,
    fromHeader: from,
  }
}

// ── Drive Backup ──────────────────────────────────────────────────────────────

const BACKUP_FILENAME = 'pui-personal-backup.json'

export async function findDriveBackupFile(accessToken: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime+desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return data.files?.[0] ?? null
}

export async function uploadBackupToDrive(accessToken: string, backupData: object, existingFileId?: string): Promise<void> {
  const content = JSON.stringify(backupData)
  const metadata = JSON.stringify({ name: BACKUP_FILENAME, mimeType: 'application/json' })
  const boundary = 'pui_backup_boundary'
  const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
  const method = existingFileId ? 'PATCH' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
}

export async function downloadDriveBackup(accessToken: string, fileId: string): Promise<object> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return res.json()
}

function decodeBase64(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    return atob(padded)
  } catch { return '' }
}

function extractEmailBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    // Fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) return decodeBase64(part.body.data)
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }
  return ''
}

export interface DriveFile {
  id: string
  name: string
  createdTime: string
  size?: string
  webViewLink?: string
}

export interface BillFile {
  id: string
  name: string
  dateStr: string      // YYYYMMDD from filename
  year: number
  month: number        // 1-12
  bankName: string     // e.g. KBANK, KTC, KRUNGSRI
  webViewLink?: string
  size?: string
}

const DRIVE_FOLDER_NAME = 'daily-incom-expense'
const BILL_PATTERN = /^Bill_(\d{4})(\d{2})(\d{2})_(.+)\.pdf$/i

// Find folder ID by name
async function findDriveFolder(accessToken: string, folderName: string): Promise<string | null> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

// List PDF bill files from the daily-incom-expense folder
export async function listBillFiles(accessToken: string): Promise<BillFile[]> {
  const folderId = await findDriveFolder(accessToken, DRIVE_FOLDER_NAME)
  if (!folderId) throw new Error(`ไม่พบ folder "${DRIVE_FOLDER_NAME}" ใน Google Drive`)

  const q = `'${folderId}' in parents and mimeType='application/pdf' and name contains 'Bill_' and trashed=false`
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,size,webViewLink)&orderBy=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!data.files) return []

  const bills: BillFile[] = []
  for (const f of data.files as DriveFile[]) {
    const m = f.name.match(BILL_PATTERN)
    if (!m) continue
    const [, yyyy, mm, dd, bankRaw] = m
    bills.push({
      id: f.id,
      name: f.name,
      dateStr: `${yyyy}${mm}${dd}`,
      year: parseInt(yyyy),
      month: parseInt(mm),
      bankName: bankRaw.toUpperCase(),
      webViewLink: f.webViewLink,
      size: f.size,
    })
  }
  return bills
}

export async function listDriveFiles(accessToken: string) {
  return listBillFiles(accessToken)
}

export async function downloadDriveFile(accessToken: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}: ไม่สามารถดาวน์โหลดไฟล์ได้`)
  return res.arrayBuffer()
}
