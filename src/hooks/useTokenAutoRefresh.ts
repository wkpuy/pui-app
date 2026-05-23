import { useEffect } from 'react'
import { db } from '../db'
import { refreshGoogleTokenViaWorker } from '../api/google'

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000  // refresh when < 10 min left
const CHECK_INTERVAL_MS    = 15 * 60 * 1000  // check every 15 min

let refreshInProgress = false

async function attemptSilentRefresh() {
  if (refreshInProgress) return
  refreshInProgress = true
  try {
    const [row, settings] = await Promise.all([
      db.googleTokens.toArray().then(r => r[0]),
      db.settings.toArray().then(r => r[0]),
    ])

    // Requires refresh_token + client credentials (new PKCE flow)
    if (!row?.refreshToken || !settings?.googleClientId || !settings?.googleClientSecret) return

    const timeLeft = row.expiresAt - Date.now()
    if (timeLeft > REFRESH_THRESHOLD_MS) return

    const newToken = await refreshGoogleTokenViaWorker(
      row.refreshToken,
      settings.googleClientId,
      settings.googleClientSecret
    )
    if (newToken && row.id) {
      await db.googleTokens.update(row.id, {
        accessToken: newToken,
        expiresAt: Date.now() + 3600 * 1000,
      })
      console.log('[TokenRefresh] auto-refreshed via worker ✅')
    } else {
      console.warn('[TokenRefresh] worker refresh failed — user may need to re-sign in')
    }
  } catch (e) {
    console.warn('[TokenRefresh] error', e)
  } finally {
    refreshInProgress = false
  }
}

export function useTokenAutoRefresh() {
  useEffect(() => {
    attemptSilentRefresh()
    const interval = setInterval(attemptSilentRefresh, CHECK_INTERVAL_MS)
    const onVisible = () => { if (!document.hidden) attemptSilentRefresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}
