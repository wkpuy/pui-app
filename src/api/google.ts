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

export async function fetchCalendarEvents(accessToken: string, daysAhead = 30) {
  const now = new Date()
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return data.items || []
}

// Parse dividend/XD events from calendar
export function parseDividendEvents(events: any[]) {
  return events
    .filter((e: any) => {
      const title: string = e.summary || ''
      return title.includes('ปันผล') || title.includes('XD') || title.includes('xd')
    })
    .map((e: any) => ({
      title: e.summary,
      date: e.start?.date || e.start?.dateTime?.slice(0, 10),
      description: e.description || '',
    }))
}

export async function fetchGmailBankMessages(accessToken: string) {
  const query = encodeURIComponent('from:(kasikornbank.com OR bangkokbank.com OR kbank.co.th) subject:(โอนเงิน OR หักบัญชี OR รายการ) newer_than:30d')
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!data.messages) return []

  const details = await Promise.all(
    data.messages.slice(0, 20).map((m: any) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json())
    )
  )
  return details
}

export function parseBankEmail(message: any) {
  const subject = message.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || ''
  const date = message.payload?.headers?.find((h: any) => h.name === 'Date')?.value || ''
  const body = extractEmailBody(message.payload)

  // Try to find amount patterns like ฿1,234.56 or 1,234.56 บาท
  const amountMatch = body.match(/([0-9,]+\.?[0-9]*)\s*บาท|฿([0-9,]+\.?[0-9]*)/)
  const amount = amountMatch ? parseFloat((amountMatch[1] || amountMatch[2]).replace(/,/g, '')) : 0

  const isExpense = /หัก|ชำระ|โอนออก|ซื้อ/.test(subject + body)

  return {
    date: new Date(date).toISOString().slice(0, 10),
    amount,
    type: isExpense ? 'expense' : 'income',
    description: subject,
    source: subject.toLowerCase().includes('kasikorn') || subject.toLowerCase().includes('kbank')
      ? 'kasikorn' : 'bangkok_bank',
  }
}

function extractEmailBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }
  return ''
}

export async function listDriveFiles(accessToken: string, query = "mimeType='application/pdf' and name contains 'บัตรเครดิต'") {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,size)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return data.files || []
}
