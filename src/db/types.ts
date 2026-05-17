export type InvestmentType = 'thai_stock' | 'foreign_stock' | 'fund' | 'insurance' | 'savings' | 'other'

export interface Profile {
  id?: number
  nickname: string
  fullName: string
  dob: string // YYYY-MM-DD
  gender: 'male' | 'female'
  heightCm: number
}

export interface InsuranceDetails {
  company?: string
  policyType?: 'life' | 'health' | 'accident' | 'savings_insurance' | 'other'
  paymentFrequency?: 'monthly' | 'quarterly' | 'annual' | 'lumpsum'
  premiumAmount?: number
  coverageAmount?: number
  maturityDate?: string // YYYY-MM-DD
}

export interface SavingsDetails {
  bankName?: string
  accountType?: 'regular' | 'fixed_deposit' | 'money_market'
  interestRate?: number
  autoSyncGmail?: boolean
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
  insuranceDetails?: InsuranceDetails
  savingsDetails?: SavingsDetails
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
  // Basic vitals
  systolic?: number
  diastolic?: number
  heartRate?: number
  // Blood sugar
  glucose?: number        // mg/dL fasting
  hba1c?: number          // %
  fastingInsulin?: number // μU/mL
  homaIr?: number         // calculated: (glucose * insulin) / 405
  // Lipids
  ldl?: number
  hdl?: number
  triglycerides?: number
  totalCholesterol?: number
  apoB?: number           // mg/dL
  lpA?: number            // mg/dL
  // Kidney
  creatinine?: number
  uricAcid?: number
  egfr?: number
  // Liver
  alt?: number            // U/L
  ast?: number            // U/L
  ggt?: number            // U/L
  // Inflammation / Heart
  hsCrp?: number          // mg/L
  homocysteine?: number   // µmol/L — brain+heart risk
  omega3Index?: number    // % — optimal >8
  cacScore?: number       // Coronary Artery Calcium score — 0 is optimal
  // Thyroid
  tsh?: number            // mIU/L
  // Hormones (longevity)
  dheaS?: number          // µg/dL — DHEA-S
  igf1?: number           // ng/mL — IGF-1
  cortisol?: number       // µg/dL — AM cortisol
  // Vitamins & minerals
  vitaminD?: number       // ng/mL
  vitaminB12?: number     // pg/mL
  vitaminB6?: number      // ng/mL
  vitaminB1?: number      // nmol/L
  magnesium?: number      // mg/dL
  ferritin?: number       // ng/mL
  // Body composition
  weightKg?: number
  bodyFatPct?: number
  muscleMassKg?: number
  waistCm?: number
  boneDensityTScore?: number  // DEXA T-score
  // CBC
  hemoglobin?: number     // g/dL
  wbc?: number            // x10³/μL
  platelets?: number      // x10³/μL
  // Physical performance
  gripStrength?: number   // kg
  mocaScore?: number      // MoCA cognitive test /30
  // Female hormones
  estradiol?: number      // pg/mL
  progesterone?: number   // ng/mL
  fsh?: number            // mIU/mL
  lh?: number             // mIU/mL
  testosterone?: number   // ng/dL
  notes?: string
}

export interface HealthDaily {
  id?: number
  date: string // YYYY-MM-DD
  weightKg?: number
  steps?: number
  sleepTotal?: number
  sleepDeep?: number
  sleepRem?: number
  sleepLight?: number
  waterMl?: number
  caloriesBurned?: number
  vo2max?: number
  activeMinutes?: number
  source?: string
}

export interface RetirementPlan {
  id?: number
  targetRetirementAge: number
  lifeExpectancy: number
  monthlyExpenseAtRetirement: number
  currentAge?: number
  expectedReturnRate: number
  postRetirementReturnRate: number
  inflationRate: number
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
  rawRef?: string
}

export interface Installment {
  id?: number
  name: string
  totalAmount: number
  monthlyAmount: number
  totalInstallments: number
  paidInstallments: number
  startDate: string // YYYY-MM-DD
  category: string
  source: string
  notes?: string
}

export interface SalaryRecord {
  id?: number
  year: number
  baseSalary: number         // monthly
  bonus: number              // annual lump sum
  pvdEmployeeRate: number    // % of salary
  pvdEmployerRate: number    // % of salary
  notes?: string
}

export interface CondoMortgage {
  id?: number
  propertyName: string
  totalPrice: number
  downPayment: number
  loanAmount: number
  interestRate: number       // % per year
  loanTermYears: number
  startDate: string          // YYYY-MM-DD
  bankName: string
  monthlyExtra: number       // extra payment per month
  notes?: string
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
