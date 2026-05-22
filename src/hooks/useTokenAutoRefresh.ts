import { useEffect } from 'react'
import { db } from '../db'
import { silentRefreshGoogleToken } from '../api/google'

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000  // refresh when < 10 min left
const CHECK_INTERVAL_MS    = 15 * 60 * 1000  // check every 15 min

let refreshInProgress = false  // guard against concurrent runs

async function attemptSilentRefresh() {
  if (refreshInProgress) return
  refreshInProgress = true
  try {
    const [row, settings] = await Promise.all([
      db.googleTokens.toArray().then(r => r[0]),
      db.settings.toArray().then(r => r[0]),
    ])
    if (!row?.accessToken || !settings?.googleClientId) return

    const timeLeft = row.expiresAt - Date.now()
    if (timeLeft > REFRESH_THRESHOLD_MS) return  // still has plenty of life

    const newToken = await silentRefreshGoogleToken(settings.googleClientId, row.scope ?? 'calendar gmail drive')
    if (newToken && row.id) {
      await db.googleTokens.update(row.id, {
        accessToken: newToken,
        expiresAt: Date.now() + 3600 * 1000,
      })
      console.log('[TokenRefresh] silent refresh ✅')
    } else {
      console.warn('[TokenRefresh] silent refresh failed — user may need to re-sign in')
    }
  } catch (e) {
    console.warn('[TokenRefresh] error', e)
  } finally {
    refreshInProgress = false
  }
}

export function useTokenAutoRefresh() {
  useEffect(() => {
    // Run once immediately on mount
    attemptSilentRefresh()

    // Run on a 15-minute interval
    const interval = setInterval(attemptSilentRefresh, CHECK_INTERVAL_MS)

    // Also run whenever the user returns to the app (tab/app focus)
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
