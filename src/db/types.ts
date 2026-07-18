export type InvestmentType =
  | "thai_stock"
  | "foreign_stock"
  | "fund"
  | "insurance"
  | "savings"
  | "other";

export interface Profile {
  id?: number;
  nickname: string;
  fullName: string;
  dob: string; // YYYY-MM-DD
  gender: "male" | "female";
  heightCm: number;
}

export interface InsuranceDetails {
  company?: string;
  policyType?: "life" | "health" | "accident" | "savings_insurance" | "other";
  paymentFrequency?: "monthly" | "quarterly" | "annual" | "lumpsum";
  premiumAmount?: number;
  coverageAmount?: number;
  maturityDate?: string; // YYYY-MM-DD
}

export interface SavingsDetails {
  bankName?: string;
  accountType?: "regular" | "fixed_deposit" | "money_market";
  interestRate?: number;
  autoSyncGmail?: boolean;
}

export interface Investment {
  id?: number;
  type: InvestmentType;
  name: string;
  ticker?: string;
  costBasis: number; // total cost (costPerUnit × shares, or entered directly for insurance/savings)
  currentValue: number; // total current value (currentPricePerUnit × shares, or entered directly)
  costPerUnit?: number; // ราคาต้นทุนต่อหน่วย (for stock/fund)
  currentPricePerUnit?: number; // ราคาปัจจุบันต่อหน่วย (for stock/fund)
  shares?: number;
  hasDividend: boolean;
  currency: "THB" | "USD" | "OTHER";
  notes?: string;
  insuranceDetails?: InsuranceDetails;
  savingsDetails?: SavingsDetails;
  createdAt: string;
  updatedAt: string;
}

export interface Dividend {
  id?: number;
  investmentId: number;
  date: string; // YYYY-MM-DD
  amountPerShare: number;
  totalReceived: number;
  notes?: string;
}

export interface HealthRecord {
  id?: number;
  date: string; // YYYY-MM-DD
  // Basic vitals
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  // Blood sugar
  glucose?: number; // mg/dL fasting
  hba1c?: number; // %
  fastingInsulin?: number; // μU/mL
  homaIr?: number; // calculated: (glucose * insulin) / 405
  // Lipids
  ldl?: number;
  hdl?: number;
  triglycerides?: number;
  totalCholesterol?: number;
  apoB?: number; // mg/dL
  lpA?: number; // mg/dL
  // Kidney
  creatinine?: number;
  uricAcid?: number;
  egfr?: number;
  // Liver
  alt?: number; // U/L
  ast?: number; // U/L
  ggt?: number; // U/L
  // Inflammation / Heart
  hsCrp?: number; // mg/L
  homocysteine?: number; // µmol/L — brain+heart risk
  omega3Index?: number; // % — optimal >8
  cacScore?: number; // Coronary Artery Calcium score — 0 is optimal
  // Thyroid
  tsh?: number; // mIU/L
  // Hormones (longevity)
  dheaS?: number; // µg/dL — DHEA-S
  igf1?: number; // ng/mL — IGF-1
  cortisol?: number; // µg/dL — AM cortisol
  // Vitamins & minerals
  vitaminD?: number; // ng/mL
  vitaminB12?: number; // pg/mL
  vitaminB6?: number; // ng/mL
  vitaminB1?: number; // nmol/L
  magnesium?: number; // mg/dL
  ferritin?: number; // ng/mL
  // Body composition
  weightKg?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  waistCm?: number;
  boneDensityTScore?: number; // DEXA T-score
  // CBC
  hemoglobin?: number; // g/dL
  wbc?: number; // x10³/μL
  platelets?: number; // x10³/μL
  // Physical performance
  gripStrength?: number; // kg
  mocaScore?: number; // MoCA cognitive test /30
  // Female hormones
  estradiol?: number; // pg/mL
  progesterone?: number; // ng/mL
  fsh?: number; // mIU/mL
  lh?: number; // mIU/mL
  testosterone?: number; // ng/dL
  notes?: string;
}

export interface HealthDaily {
  id?: number;
  date: string; // YYYY-MM-DD
  weightKg?: number;
  steps?: number;
  sleepTotal?: number;
  sleepDeep?: number;
  sleepRem?: number;
  sleepLight?: number;
  waterMl?: number;
  caloriesBurned?: number;
  vo2max?: number;
  activeMinutes?: number;
  distanceKm?: number;
  // WHOOP fields
  recoveryScore?: number;
  hrv?: number;
  restingHeartRate?: number;
  sleepPerformance?: number;
  respiratoryRate?: number;
  strain?: number;
  bloodOxygen?: number;
  source?: string;
}

export interface RetirementPlan {
  id?: number;
  targetRetirementAge: number;
  lifeExpectancy: number;
  monthlyExpenseAtRetirement: number;
  currentAge?: number;
  expectedReturnRate: number;
  postRetirementReturnRate: number;
  inflationRate: number;
  currentTotalAssets: number;
  updatedAt: string;
}

export interface FinanceRecord {
  id?: number;
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  source:
    | "kasikorn"
    | "bangkok_bank"
    | "scb"
    | "credit_card"
    | "manual"
    | "other";
  rawRef?: string;
  cardName?: string; // e.g. 'KTC', 'KBANK', 'KRUNGSRI', 'UOB'
  installmentCurrent?: number; // งวดที่ n (จาก CC PDF)
  installmentTotal?: number; // งวดทั้งหมด (จาก CC PDF)
}

export interface Installment {
  id?: number;
  name: string;
  totalAmount: number;
  monthlyAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  startDate: string; // YYYY-MM-DD
  category: string;
  source: string;
  cardName?: string; // e.g. 'KTC', 'KBANK', 'KRUNGSRI', 'UOB'
  notes?: string;
}

export interface SalaryRecord {
  id?: number;
  year: number;
  baseSalary: number; // monthly
  bonus: number; // annual lump sum
  pvdEmployeeRate: number; // % of salary
  pvdEmployerRate: number; // % of salary
  notes?: string;
}

export interface CondoMortgage {
  id?: number;
  propertyName: string;
  totalPrice: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number; // % per year
  loanTermYears: number;
  startDate: string; // YYYY-MM-DD
  bankName: string;
  monthlyExtra: number; // extra payment per month
  notes?: string;
}

export interface EmergencyFund {
  id?: number;
  targetMonths: number;
  currentAmount: number;
  updatedAt: string;
}

// Thai personal income tax record (per ปีภาษี)
export interface TaxRecord {
  id?: number;
  year: number; // ปี พ.ศ. (เช่น 2567)
  // รายได้
  totalIncome: number; // เงินได้ทั้งปี (40(1) - เงินเดือน)
  bonus: number; // โบนัส
  otherIncome: number; // รายได้อื่น (freelance, dividend...)
  // ค่าใช้จ่าย/ลดหย่อนพื้นฐาน
  personalAllowance: number; // ส่วนตัว 60,000 (auto)
  spouseAllowance: number; // คู่สมรส 0/60,000
  childrenCount: number; // จำนวนบุตร (≤2561) → 30k คนแรก
  childrenAfter2561: number; // บุตรเกิดตั้งแต่ 2561 (60k/คนตั้งแต่คนที่ 2)
  parentsCount: number; // (legacy) จำนวนบิดามารดาที่อุปการะ (max 4)
  parentsSupport: number; // ยอดลดหย่อนบิดามารดา (≤180,000)
  // ประกัน
  lifeInsurance: number; // ประกันชีวิต (≤100,000)
  healthInsurance: number; // ประกันสุขภาพตน (≤25,000 รวม Life ≤100k)
  parentsHealthInsurance: number; // ประกันสุขภาพพ่อแม่ (≤15,000)
  pensionInsurance: number; // ประกันชีวิตแบบบำนาญ (≤200,000 หรือ 15% รายได้)
  socialSecurity: number; // ประกันสังคม (≤9,000 ที่ 750/เดือน)
  // กองทุน
  pvdContribution: number; // PVD พนักงานจ่าย (≤500,000 หรือ 15% รายได้)
  rmf: number; // RMF (≤500,000 หรือ 30% รายได้)
  ssf: number; // SSF (≤200,000 หรือ 30% รายได้)
  thaiEsg: number; // Thai ESG Fund (≤300,000 หรือ 30% รายได้)
  // อื่นๆ
  mortgageInterest: number; // ดอกเบี้ยกู้บ้าน (≤100,000)
  donation: number; // เงินบริจาคทั่วไป (≤10% หลังลดหย่อน)
  donationEducation: number; // บริจาค ศึกษา/สาธารณสุข (2x, ≤10% หลังลดหย่อน)
  donationPolitical: number; // บริจาคพรรคการเมือง (≤10,000)
  easyEReceipt: number; // Easy E-Receipt / ช้อปดีมีคืน (เปลี่ยนทุกปี)
  // ผลคำนวณ (cache)
  withholdingTax: number; // ภาษีที่ถูกหักไว้ ณ ที่จ่าย
  notes?: string;
  updatedAt: string;
}

// ยา/วิตามิน/อาหารเสริม
export interface Medication {
  id?: number;
  name: string; // เช่น "Vitamin D3"
  type: "medication" | "supplement" | "vitamin";
  dose: string;      // ปริมาณ: "1 เม็ด", "2 capsules"
  doseSize?: string; // ขนาด: "500 mg", "1000 IU", "10 mg"
  frequency: "daily" | "weekly" | "monthly" | "as_needed";
  timeOfDay?: string;   // "เช้า" | "กลางวัน" | "เย็น" | "ก่อนนอน"
  mealTiming?: string;  // "ก่อนอาหาร" | "หลังอาหาร" | "พร้อมอาหาร" | ""
  prescribedBy?: string; // หมอ / self
  startDate: string; // YYYY-MM-DD
  endDate?: string; // ถ้ามีกำหนดหยุด
  active: boolean;
  purpose?: string; // วัตถุประสงค์
  notes?: string;
}

// บันทึกการกินยาแต่ละวัน
export interface MedicationLog {
  id?: number;
  medicationId: number;
  date: string; // YYYY-MM-DD
  taken: boolean;
}

export interface Subscription {
  id?: number;
  name: string; // e.g. "Netflix", "iCloud 200GB"
  amount: number; // ค่าบริการแต่ละรอบ
  frequency: "monthly" | "quarterly" | "yearly";
  nextRenewalDate: string; // YYYY-MM-DD
  category: "streaming" | "cloud" | "software" | "fitness" | "other";
  paymentMethod?: string; // 'KTC', 'KBANK', 'bank_account', etc.
  active: boolean;
  notes?: string;
}

export interface RecurringIncome {
  id?: number;
  name: string; // e.g. "เงินเดือน", "โบนัส", "คืนภาษี"
  amount: number;
  category: string; // maps to income categories (เงินเดือน/โบนัส/ปันผล/...)
  frequency: "monthly" | "quarterly" | "yearly";
  dayOfMonth: number; // 1-31 — วันที่เงินเข้าของเดือนนั้น
  startDate: string; // YYYY-MM-DD — งวดแรก (กำหนดเดือน/ปีเริ่ม)
  active: boolean;
  autoPost: boolean; // ลงรายการเข้าหน้ารายรับ-รายจ่ายอัตโนมัติ
  lastPostedPeriodKey?: string; // งวดล่าสุดที่ลงแล้ว (กันลงซ้ำ / กันเด้งกลับหลังลบ)
  notes?: string;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface GoogleTokens {
  id?: number;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  userEmail: string;
}

export interface SyncLog {
  id?: number;
  source: "calendar" | "gmail" | "drive" | "whoop";
  lastSyncAt: string;
  status: "success" | "error";
  notes?: string;
}

export interface AppSettings {
  id?: number;
  geminiApiKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  retirementMonthlyBudget?: number;
  defaultCurrency: "THB";
  onboardingDone: boolean;
}

export interface NetWorthSnapshot {
  id?: number;
  date: string; // YYYY-MM (one per month)
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface LumenEntry {
  id?: number;
  date: string; // YYYY-MM-DD

  // 🌅 Morning (fasted — most important)
  morningScore?: number; // 1-5
  morningTime?: string; // HH:MM
  morningRemark?: string; // กินอะไรก่อนนอนคืนที่แล้ว

  // 💪 Workout (optional — show only if didWorkout=true)
  didWorkout?: boolean;
  workoutType?: 'cardio' | 'weight' | 'hiit' | 'yoga' | 'other';
  workoutMinutes?: number;
  preWorkoutScore?: number; // 1-5
  preWorkoutRemark?: string; // กินอะไรก่อนออก
  postWorkoutScore?: number; // 1-5
  postWorkoutRemark?: string; // สังเกตร่างกายหลังออก

  // 🍽️ Afternoon (~2hrs after lunch)
  afternoonScore?: number; // 1-5
  afternoonTime?: string; // HH:MM
  afternoonRemark?: string; // กินอะไรมื้อกลางวัน

  // 🌙 Night (before bed)
  nightScore?: number; // 1-5
  nightTime?: string; // HH:MM
  nightRemark?: string; // กินอะไรมื้อเย็น

  // Weight is synced from healthDaily — not stored here
}
