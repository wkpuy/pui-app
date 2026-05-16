export type InvestmentType = 'thai_stock' | 'foreign_stock' | 'fund' | 'insurance' | 'savings' | 'other'

export interface Profile {
  id?: number
  nickname: string
  fullName: string
  dob: string // YYYY-MM-DD
  gender: 'male' | 'female'
  heightCm: number
}

export interface Investment {
  id?: number
  type: InvestmentType
  name: string
  ticker?: string
  costBasis: number
  currentValue: number
  shares?: number
  hasDividend: boolean
  currency: 'THB' | 'USD' | 'OTHER'
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Dividend {
  id?: number
  investmentId: number
  date: string // YYYY-MM-DD
  amountPerShare: number
  totalReceived: number
  notes?: string
}

export interface HealthRecord {
  id?: number
  date: string // YYYY-MM-DD
  systolic?: number       // ความดันบน
  diastolic?: number      // ความดันล่าง
  heartRate?: number      // bpm
  glucose?: number        // น้ำตาล mg/dL
  ldl?: number            // ไขมัน LDL
  hdl?: number            // ไขมัน HDL
  triglycerides?: number  // ไตรกลีเซอไรด์
  hba1c?: number          // HbA1c %
  creatinine?: number     // ครีเอตินิน
  uricAcid?: number       // กรดยูริก
  notes?: string
}

export interface HealthDaily {
  id?: number
  date: string // YYYY-MM-DD
  weightKg?: number
  steps?: number
  sleepTotal?: number  // hours
  sleepDeep?: number   // hours
  sleepRem?: number    // hours
  sleepLight?: number  // hours
  waterMl?: number
  caloriesBurned?: number
  vo2max?: number
  activeMinutes?: number
  source?: string // 'apple_health' | 'whoop' | 'manual'
}

export interface RetirementPlan {
  id?: number
  targetRetirementAge: number
  monthlyExpenseAtRetirement: number
  currentAge?: number
  expectedReturnRate: number  // % per year
  inflationRate: number       // % per year
  currentTotalAssets: number
  updatedAt: string
}

export interface FinanceRecord {
  id?: number
  date: string // YYYY-MM-DD
  type: 'income' | 'expense'
  amount: number
  category: string
  description: string
  source: 'kasikorn' | 'bangkok_bank' | 'credit_card' | 'manual' | 'other'
  rawRef?: string // email/PDF reference
}

export interface EmergencyFund {
  id?: number
  targetMonths: number
  currentAmount: number
  updatedAt: string
}

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface GoogleTokens {
  id?: number
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scope: string
  userEmail: string
}

export interface SyncLog {
  id?: number
  source: 'calendar' | 'gmail' | 'drive' | 'apple_health'
  lastSyncAt: string
  status: 'success' | 'error'
  notes?: string
}

export interface AppSettings {
  id?: number
  geminiApiKey?: string
  googleClientId?: string
  retirementMonthlyBudget?: number
  defaultCurrency: 'THB'
  onboardingDone: boolean
}
