import { db, pruneSyncLog } from '../db'
import { fetchWhoopData, getValidTokens, loadWhoopTokens, saveWhoopTokens } from './whoop'

export interface WhoopSyncResult {
  ok: boolean
  message: string
  added: number
  updated: number
  total: number
}

export async function syncWhoopAndSave(days = 90): Promise<WhoopSyncResult> {
  const tokens = loadWhoopTokens()
  if (!tokens) {
    return { ok: false, message: 'ยังไม่ได้เชื่อมต่อ WHOOP', added: 0, updated: 0, total: 0 }
  }

  let valid: typeof tokens
  try {
    valid = await getValidTokens(tokens)
    saveWhoopTokens(valid)
  } catch (e: any) {
    return { ok: false, message: `Token หมดอายุ: ${e.message}`, added: 0, updated: 0, total: 0 }
  }

  let records: Awaited<ReturnType<typeof fetchWhoopData>>
  try {
    records = await fetchWhoopData(valid, days)
  } catch (e: any) {
    return { ok: false, message: `WHOOP API: ${e.message}`, added: 0, updated: 0, total: 0 }
  }

  let added = 0, updated = 0
  for (const r of records) {
    const existing = await db.healthDaily.where('date').equals(r.date).first()
    const payload = {
      date: r.date,
      recoveryScore: r.recoveryScore,
      hrv: r.hrv,
      restingHeartRate: r.restingHeartRate,
      sleepTotal: r.sleepTotal,
      sleepDeep: r.sleepDeep,
      sleepRem: r.sleepRem,
      sleepLight: r.sleepLight,
      sleepPerformance: r.sleepPerformance,
      respiratoryRate: r.respiratoryRate,
      strain: r.strain,
      caloriesBurned: r.caloriesBurned,
      bloodOxygen: r.bloodOxygen,
      vo2max: r.vo2max,  // actual value from WHOOP body measurement API
      source: 'whoop' as const,
    }
    if (existing) {
      await db.healthDaily.update(existing.id!, { ...payload, id: undefined })
      updated++
    } else {
      await db.healthDaily.add(payload)
      added++
    }
  }

  await db.syncLog.add({
    source: 'whoop',
    lastSyncAt: new Date().toISOString(),
    status: 'success',
    notes: `+${added} ใหม่, ${updated} อัปเดต`,
  })
  pruneSyncLog()

  if (records.length === 0) {
    return { ok: false, message: 'ไม่มีข้อมูลจาก WHOOP', added: 0, updated: 0, total: 0 }
  }
  if (added === 0 && updated === 0) {
    return { ok: true, message: `ข้อมูลเป็นปัจจุบันแล้ว (${records.length} วัน)`, added, updated, total: records.length }
  }
  return {
    ok: true,
    message: `+${added} วันใหม่${updated > 0 ? ` · อัปเดต ${updated}` : ''}`,
    added,
    updated,
    total: records.length,
  }
}
