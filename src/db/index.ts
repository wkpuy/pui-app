import Dexie, { type Table } from 'dexie'
import type {
  Profile, Investment, Dividend, HealthRecord, HealthDaily,
  RetirementPlan, FinanceRecord, EmergencyFund, ChatMessage,
  GoogleTokens, SyncLog, AppSettings,
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
  }
}

export const db = new AppDB()

// Seed default settings if not exist
db.on('ready', async () => {
  const count = await db.settings.count()
  if (count === 0) {
    await db.settings.add({
      defaultCurrency: 'THB',
      onboardingDone: false,
    })
  }
})

export type { Profile, Investment, Dividend, HealthRecord, HealthDaily,
  RetirementPlan, FinanceRecord, EmergencyFund, ChatMessage,
  GoogleTokens, SyncLog, AppSettings }
