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
  const data = await res.json()
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

// sinceDate: YYYY/MM/DD (Gmail format). If omitted → 48h back (for auto-sync).
export async function fetchGmailBankMessages(accessToken: string, sinceDate?: string) {
  const timeFilter = sinceDate ? `after:${sinceDate}` : `after:${toGmailDate(Date.now() - 48 * 3600 * 1000)}`
  const query = encodeURIComponent(`from:(kasikornbank.com OR bangkokbank.com OR kbank.co.th OR bbl.co.th OR scb.co.th) ${timeFilter}`)
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!data.messages) return []

  const details = await Promise.all(
    data.messages.slice(0, 60).map((m: any) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json())
    )
  )
  return details
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
  const body = bodyRaw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')

  const isKBank = from.includes('kasikornbank.com') || from.includes('kbank.co.th')
  const isBBL = from.includes('bangkokbank.com') || from.includes('bbl.co.th')

  let amount = 0
  let description = subject
  let txDate = ''

  if (isKBank) {
    // KBank: "จำนวนเงิน (บาท): 22.00"
    const amtMatch = body.match(/จำนวนเงิน\s*\(บาท\)\s*:\s*([\d,]+\.?\d*)/)
    amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0

    // Date: "วันที่ทำรายการ: 14/05/2026"
    const dateMatch = body.match(/วันที่ทำรายการ\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (dateMatch) txDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

    // Payee
    const payeeMatch = body.match(/เพื่อเข้าบัญชีบริษัท\s*:\s*(.+)/)
      ?? body.match(/ชื่อบัญชี\s*:\s*(.+)/)
    if (payeeMatch) description = payeeMatch[1].trim()

  } else if (isBBL) {
    // Bangkok Bank: "จำนวนเงิน (บาท)\t 6,770.00"
    const amtMatch = body.match(/จำนวนเงิน\s*\(บาท\)[^\d]*([\d,]+\.?\d*)/)
    amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0

    // Date from subject: "(08/05/2026 @ 17:03:53)"
    const dateMatch = subject.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (dateMatch) txDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

    // Payee
    const payeeMatch = body.match(/ชื่อบริษัท \/ ชื่อผู้ให้บริการ\s+(.+)/)
      ?? body.match(/ชื่อบัญชี\s+(.+)/)
    if (payeeMatch) description = payeeMatch[1].trim()
  }

  // Fallback: parse date from email header
  if (!txDate) {
    try { txDate = new Date(dateHeader).toISOString().slice(0, 10) } catch { txDate = '' }
  }

  return {
    date: txDate || new Date().toISOString().slice(0, 10),
    amount,
    type: 'expense' as 'income' | 'expense',
    description,
    source: isKBank ? 'kasikorn' : 'bangkok_bank',
    rawRef: message.id as string,
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
