import { useEffect } from 'react'
import { db, pruneSyncLog } from '../db'
import { fetchGmailBankMessages, parseBankEmail } from '../api/google'

export function useAutoSync() {
  useEffect(() => {
    if (sessionStorage.getItem('bank_auto_synced')) return
    sessionStorage.setItem('bank_auto_synced', '1')
    runBankAutoSync()
  }, [])
}

async function runBankAutoSync() {
  try {
    const tokens = await db.googleTokens.orderBy('id').last()
    if (!tokens?.accessToken) return

    // Check token expiry before calling API
    if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
      await db.syncLog.add({
        source: 'gmail',
        lastSyncAt: new Date().toISOString(),
        status: 'error',
        notes: 'Token หมดอายุ — กรุณา Sign In Google ใหม่ในหน้า Settings',
      })
      pruneSyncLog()
      return
    }

    const emails = await fetchGmailBankMessages(tokens.accessToken)
    let added = 0
    let skipped = 0
    for (const email of emails) {
      const parsed = parseBankEmail(email)
      if (!parsed.rawRef || parsed.amount <= 0) { skipped++; continue }
      const exists = await db.financeRecords.where('rawRef').equals(parsed.rawRef).count()
      if (exists === 0) {
        await db.financeRecords.add({
          ...parsed,
          type: parsed.type as 'income' | 'expense',
          category: parsed.type === 'income' ? 'โอนเข้า' : 'โอนออก',
          source: parsed.source as any,
        })
        added++
      }
    }
    await db.syncLog.add({
      source: 'gmail',
      lastSyncAt: new Date().toISOString(),
      status: 'success',
      notes: added > 0
        ? `auto: +${added} รายการใหม่${skipped > 0 ? ` (ข้าม ${skipped} รายการ parse ไม่ได้)` : ''}`
        : `auto: ไม่มีรายการใหม่ (อีเมล ${emails.length} ฉบับ, parse ไม่ได้ ${skipped} รายการ)`,
    })
    pruneSyncLog()
  } catch (e: any) {
    const msg: string = e?.message ?? String(e)
    const isTokenExpired = /token.?expired|401|unauthorized/i.test(msg)
    await db.syncLog.add({
      source: 'gmail',
      lastSyncAt: new Date().toISOString(),
      status: 'error',
      notes: isTokenExpired
        ? 'Token หมดอายุ — กรุณา Sign In Google ใหม่ในหน้า Settings'
        : `auto sync error: ${msg.slice(0, 200)}`,
    }).catch(() => {})
    pruneSyncLog().catch(() => {})
  }
}
