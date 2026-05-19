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

    const emails = await fetchGmailBankMessages(tokens.accessToken) // defaults to 48h
    let added = 0
    for (const email of emails) {
      const parsed = parseBankEmail(email)
      if (!parsed.rawRef || parsed.amount <= 0) continue
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
    if (added > 0) {
      await db.syncLog.add({
        source: 'gmail',
        lastSyncAt: new Date().toISOString(),
        status: 'success',
        notes: `auto-48h: +${added} รายการ`,
      })
      pruneSyncLog()
    }
  } catch {
    // Silent fail — don't interrupt the user's app experience
  }
}
