const CLIENT_ID = '2a0f2623-a20c-4b15-985a-e89f7c1f37c4'
const CLIENT_SECRET = 'df46fd6543619fe9c776dc8ee389dd3be439c79a727f47dc535b46577d2f60fe'
const REDIRECT_URI = 'https://wkpuy.github.io/pui-app/'
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const API_BASE = 'https://api.prod.whoop.com/developer/v1'

const SCOPES = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline'

export interface WhoopTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function getWhoopAuthUrl(): string {
  const state = Math.random().toString(36).slice(2)
  localStorage.setItem('whoop_oauth_state', state)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state,
  })
  return `${AUTH_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<WhoopTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<WhoopTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

async function apiGet(path: string, tokens: WhoopTokens): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  if (!res.ok) throw new Error(`WHOOP API error: ${res.status} ${path}`)
  return res.json()
}

export interface WhoopDailyData {
  date: string
  recoveryScore?: number
  hrv?: number
  restingHeartRate?: number
  sleepTotal?: number
  sleepDeep?: number
  sleepRem?: number
  sleepLight?: number
  sleepPerformance?: number
  respiratoryRate?: number
  strain?: number
  caloriesBurned?: number
  bloodOxygen?: number
}

function millisToHours(ms: number): number {
  return Math.round((ms / 3600000) * 10) / 10
}

function toDateStr(isoStr: string): string {
  return isoStr.slice(0, 10)
}

export async function fetchWhoopData(tokens: WhoopTokens, days = 90): Promise<WhoopDailyData[]> {
  const start = new Date()
  start.setDate(start.getDate() - days)
  const startStr = start.toISOString()
  const limit = Math.min(days + 5, 100)

  const [recoveries, sleeps, cycles] = await Promise.all([
    apiGet(`/recovery/?start=${startStr}&limit=${limit}`, tokens),
    apiGet(`/activity/sleep/?start=${startStr}&limit=${limit}`, tokens),
    apiGet(`/cycle/?start=${startStr}&limit=${limit}`, tokens),
  ])

  const map = new Map<string, WhoopDailyData>()

  const ensure = (date: string) => {
    if (!map.has(date)) map.set(date, { date })
    return map.get(date)!
  }

  for (const r of recoveries?.records ?? []) {
    if (!r.created_at) continue
    const d = ensure(toDateStr(r.created_at))
    d.recoveryScore = r.score?.recovery_score
    d.hrv = r.score?.hrv_rmssd_milli ? Math.round(r.score.hrv_rmssd_milli) : undefined
    d.restingHeartRate = r.score?.resting_heart_rate
    d.bloodOxygen = r.score?.spo2_percentage
  }

  for (const s of sleeps?.records ?? []) {
    if (!s.start || s.nap) continue
    const d = ensure(toDateStr(s.start))
    if (s.score) {
      d.sleepPerformance = s.score.sleep_performance_percentage
      d.respiratoryRate = s.score.respiratory_rate
    }
    if (s.score?.stage_summary) {
      const ss = s.score.stage_summary
      d.sleepDeep = millisToHours(ss.total_slow_wave_sleep_time_milli ?? 0)
      d.sleepRem = millisToHours(ss.total_rem_sleep_time_milli ?? 0)
      d.sleepLight = millisToHours(ss.total_light_sleep_time_milli ?? 0)
      d.sleepTotal = millisToHours(
        (ss.total_slow_wave_sleep_time_milli ?? 0) +
        (ss.total_rem_sleep_time_milli ?? 0) +
        (ss.total_light_sleep_time_milli ?? 0)
      )
    }
  }

  for (const c of cycles?.records ?? []) {
    if (!c.start) continue
    const d = ensure(toDateStr(c.start))
    d.strain = c.score?.strain ? Math.round(c.score.strain * 10) / 10 : undefined
    d.caloriesBurned = c.score?.kilojoule
      ? Math.round(c.score.kilojoule * 0.239006)
      : undefined
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function saveWhoopTokens(tokens: WhoopTokens) {
  localStorage.setItem('whoop_tokens', JSON.stringify(tokens))
}

export function loadWhoopTokens(): WhoopTokens | null {
  try {
    const raw = localStorage.getItem('whoop_tokens')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearWhoopTokens() {
  localStorage.removeItem('whoop_tokens')
  localStorage.removeItem('whoop_oauth_state')
}

export function isTokenExpired(tokens: WhoopTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60000
}

export async function getValidTokens(tokens: WhoopTokens): Promise<WhoopTokens> {
  if (!isTokenExpired(tokens)) return tokens
  const refreshed = await refreshAccessToken(tokens.refreshToken)
  saveWhoopTokens(refreshed)
  return refreshed
}
