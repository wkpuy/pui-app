import Dexie, { type Table } from 'dexie'
import type {
  Profile, Investment, Dividend, HealthRecord, HealthDaily,
  RetirementPlan, FinanceRecord, EmergencyFund, ChatMessage,
  GoogleTokens, SyncLog, AppSettings, SalaryRecord, CondoMortgage, Installment,
  Subscription, TaxRecord, Medication, MedicationLog,
} from './types'

class AppDB extends Dexie {
  profile!: Table<Profile>
  investments!: Table<Investment>
  dividends!: Table<Dividend>
  healthRecords!: Table<HealthRecord>
  healthDaily!: Table<HealthDaily>
  retirementPlan!: Table<RetirementPlan>
  financeRecords!: Table<FinanceRecord>
  emergencyFund!: Table<EmergencyFund>
  chatMessages!: Table<ChatMessage>
  googleTokens!: Table<GoogleTokens>
  syncLog!: Table<SyncLog>
  settings!: Table<AppSettings>
  salaryRecords!: Table<SalaryRecord>
  condoMortgage!: Table<CondoMortgage>
  installments!: Table<Installment>
  subscriptions!: Table<Subscription>
  taxRecords!: Table<TaxRecord>
  medications!: Table<Medication>
  medicationLogs!: Table<MedicationLog>

  constructor() {
    super('PuiPersonalApp')
    this.version(1).stores({
      profile: '++id',
      investments: '++id, type, ticker',
      dividends: '++id, investmentId, date',
      healthRecords: '++id, date',
      healthDaily: '++id, date',
      retirementPlan: '++id',
      financeRecords: '++id, date, type, source',
      emergencyFund: '++id',
      chatMessages: '++id, timestamp',
      googleTokens: '++id',
      syncLog: '++id, source',
      settings: '++id',
    })
    this.version(2).stores({
      profile: '++id',
      investments: '++id, type, ticker',
      dividends: '++id, investmentId, date',
      healthRecords: '++id, date',
      healthDaily: '++id, date',
      retirementPlan: '++id',
      financeRecords: '++id, date, type, source',
      emergencyFund: '++id',
      chatMessages: '++id, timestamp',
      googleTokens: '++id',
      syncLog: '++id, source',
      settings: '++id',
      salaryRecords: '++id, year',
      condoMortgage: '++id',
      installments: '++id, startDate',
    })
    this.version(3).stores({
      profile: '++id',
      investments: '++id, type, ticker',
      dividends: '++id, investmentId, date',
      healthRecords: '++id, date',
      healthDaily: '++id, date',
      retirementPlan: '++id',
      financeRecords: '++id, date, type, source, rawRef',
      emergencyFund: '++id',
      chatMessages: '++id, timestamp',
      googleTokens: '++id',
      syncLog: '++id, source',
      settings: '++id',
      salaryRecords: '++id, year',
      condoMortgage: '++id',
      installments: '++id, startDate',
    })
    this.version(4).stores({
      profile: '++id',
      investments: '++id, type, ticker',
      dividends: '++id, investmentId, date',
      healthRecords: '++id, date',
      healthDaily: '++id, date',
      retirementPlan: '++id',
      financeRecords: '++id, date, type, source, rawRef',
      emergencyFund: '++id',
      chatMessages: '++id, timestamp',
      googleTokens: '++id',
      syncLog: '++id, source',
      settings: '++id',
      salaryRecords: '++id, year',
      condoMortgage: '++id',
      installments: '++id, startDate',
      subscriptions: '++id, nextRenewalDate, active',
    })
    this.version(5).stores({
      profile: '++id',
      investments: '++id, type, ticker',
      dividends: '++id, investmentId, date',
      healthRecords: '++id, date',
      healthDaily: '++id, date',
      retirementPlan: '++id',
      financeRecords: '++id, date, type, source, rawRef',
      emergencyFund: '++id',
      chatMessages: '++id, timestamp',
      googleTokens: '++id',
      syncLog: '++id, source',
      settings: '++id',
      salaryRecords: '++id, year',
      condoMortgage: '++id',
      installments: '++id, startDate',
      subscriptions: '++id, nextRenewalDate, active',
      taxRecords: '++id, year',
      medications: '++id, active',
      medicationLogs: '++id, medicationId, date, [medicationId+date]',
    })
  }
}

export const db = new AppDB()

db.on('ready', async () => {
  const count = await db.settings.count()
  if (count === 0) {
    await db.settings.add({
      defaultCurrency: 'THB',
      onboardingDone: false,
    })
  }
  // Auto-prune syncLog: keep only the 50 most recent rows
  pruneSyncLog()
})

/** Keep only the latest `keep` rows in syncLog. Called on db ready + after each sync write. */
export async function pruneSyncLog(keep = 50) {
  const total = await db.syncLog.count()
  if (total <= keep) return
  const oldest = await db.syncLog.orderBy('id').limit(total - keep).primaryKeys()
  if (oldest.length > 0) await db.syncLog.bulkDelete(oldest as number[])
}

/** Estimate rough size of each table (row count — not bytes, but useful for housekeeping UI) */
export async function getStorageStats() {
  const [profile, investments, dividends, healthRecords, healthDaily,
    financeRecords, chatMessages, syncLog, installments, subscriptions,
    taxRecords, medications, medicationLogs, salaryRecords] = await Promise.all([
    db.profile.count(), db.investments.count(), db.dividends.count(),
    db.healthRecords.count(), db.healthDaily.count(),
    db.financeRecords.count(), db.chatMessages.count(), db.syncLog.count(),
    db.installments.count(), db.subscriptions.count(),
    db.taxRecords.count(), db.medications.count(), db.medicationLogs.count(),
    db.salaryRecords.count(),
  ])
  return {
    profile, investments, dividends, healthRecords, healthDaily,
    financeRecords, chatMessages, syncLog, installments, subscriptions,
    taxRecords, medications, medicationLogs, salaryRecords,
    total: profile + investments + dividends + healthRecords + healthDaily +
      financeRecords + chatMessages + syncLog + installments + subscriptions +
      taxRecords + medications + medicationLogs + salaryRecords,
  }
}

export type {
  Profile, Investment, Dividend, HealthRecord, HealthDaily,
  RetirementPlan, FinanceRecord, EmergencyFund, ChatMessage,
  GoogleTokens, SyncLog, AppSettings, SalaryRecord, CondoMortgage, Installment,
  Subscription, TaxRecord, Medication, MedicationLog,
}
