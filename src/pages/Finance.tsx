import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar, Toast } from '../components/Card'
import Button, { IconButton, CloseButton } from '../components/Button'
import { formatCurrency } from '../utils/calculations'
import type { FinanceRecord, Installment, Subscription } from '../db/types'
import { listBillFiles } from '../api/google'
import type { BillFile, DriveFile } from '../api/google'
import type { CreditCardTransaction } from '../api/pdfParser'

const CATEGORIES_EXPENSE = [
  'อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'สุขภาพ', 'ท่องเที่ยว',
  'บ้าน', 'ประกัน', 'ลงทุน', 'ครอบครัว', 'Subscription', 'อื่นๆ',
]
const CATEGORIES_INCOME = ['เงินเดือน', 'โบนัส', 'ปันผล', 'ดอกเบี้ย', 'Freelance', 'อื่นๆ']

const CAT_ICONS: Record<string, string> = {
  อาหาร: '🍜', เดินทาง: '🚗', ช้อปปิ้ง: '🛍️', สุขภาพ: '💊', ท่องเที่ยว: '✈️',
  บ้าน: '🏠', ประกัน: '🛡️', ลงทุน: '📈', ครอบครัว: '👨‍👩‍👧', Subscription: '📱', อื่นๆ: '📦',
  เงินเดือน: '💼', โบนัส: '🎁', ปันผล: '💰', ดอกเบี้ย: '🏦', Freelance: '💻',
  โอนเข้า: '💸', โอนออก: '💸',
}

const CAT_COLORS: Record<string, string> = {
  อาหาร: 'bg-orange-100 text-orange-700',
  เดินทาง: 'bg-blue-100 text-blue-700',
  ช้อปปิ้ง: 'bg-pink-100 text-pink-700',
  สุขภาพ: 'bg-green-100 text-green-700',
  ท่องเที่ยว: 'bg-cyan-100 text-cyan-700',
  บ้าน: 'bg-amber-100 text-amber-700',
  ประกัน: 'bg-violet-100 text-violet-700',
  ลงทุน: 'bg-emerald-100 text-emerald-700',
  ครอบครัว: 'bg-rose-100 text-rose-700',
  Subscription: 'bg-purple-100 text-purple-700',
  อื่นๆ: 'bg-gray-100 text-gray-500',
  เงินเดือน: 'bg-emerald-100 text-emerald-700',
  โบนัส: 'bg-yellow-100 text-yellow-700',
  ปันผล: 'bg-lime-100 text-lime-700',
  ดอกเบี้ย: 'bg-teal-100 text-teal-700',
  Freelance: 'bg-indigo-100 text-indigo-700',
  โอนเข้า: 'bg-sky-100 text-sky-700',
  โอนออก: 'bg-slate-100 text-slate-600',
}

type Tab = 'overview' | 'records' | 'yearly' | 'installments' | 'subscriptions' | 'budget'

// ── Budget config (localStorage) ──────────────────────────────────────────────
interface BudgetConfig {
  internet: number          // ค่าเน็ต/เดือน
  utilities: number         // ค่าน้ำ+ไฟ/เดือน
  condoFee: number          // ค่าส่วนกลาง/เดือน
  insurance: number         // ค่าประกัน/เดือน
  subscription: number      // Subscription/เดือน
  familyBudget: number      // ครอบครัว เป้า/เดือน
  foodBudget: number        // อาหาร เป้า/เดือน
  shoppingBudget: number    // ช็อปปิ้ง เป้า/เดือน
  otherBudget: number       // อื่นๆ เป้า/เดือน
}
const BUDGET_DEFAULT: BudgetConfig = {
  internet: 0, utilities: 0, condoFee: 0, insurance: 0, subscription: 0,
  familyBudget: 0, foodBudget: 0, shoppingBudget: 0, otherBudget: 0,
}
function loadBudget(): BudgetConfig {
  try { return { ...BUDGET_DEFAULT, ...JSON.parse(localStorage.getItem('monthly_budget_v1') ?? '{}') } }
  catch { return BUDGET_DEFAULT }
}
function saveBudget(c: BudgetConfig) { localStorage.setItem('monthly_budget_v1', JSON.stringify(c)) }

export default function Finance() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<FinanceRecord | null>(null)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const records = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().toArray())
  const installments = useLiveQuery(() => db.installments.orderBy('startDate').reverse().toArray())

  const monthRecords = records?.filter(r => r.date.startsWith(month)) ?? []
  const income = monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const expense = monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const net = income - expense

  const expenseByCategory = monthRecords
    .filter(r => r.type === 'expense')
    .reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + r.amount; return acc }, {} as Record<string, number>)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="รายรับ-รายจ่าย" gradient="from-emerald-500 to-teal-600" rightAction={{ label: '＋ เพิ่ม', onClick: () => { setEditRecord(null); setShowForm(true) } }} />

      {/* Month selector */}
      <div className="bg-white px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-[14px] font-semibold text-gray-700 border-none outline-none bg-transparent" />
        <div className="flex gap-2">
          <button onClick={() => navigate('/salary')}
            className="text-[12px] font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg active:scale-95">💼 เงินเดือน</button>
          <button onClick={() => navigate('/condo')}
            className="text-[12px] font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95">🏠 สินเชื่อ</button>
          <button onClick={() => navigate('/tax')}
            className="text-[12px] font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg active:scale-95">🧾 ภาษี</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative bg-white border-b border-gray-100 flex items-center">
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden flex-1">
          {([['overview', 'ภาพรวม'], ['records', 'รายการ'], ['yearly', 'รายปี'], ['installments', 'ผ่อน'], ['subscriptions', 'Subs'], ['budget', 'งบเดือน']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-3 py-3 text-[12px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>
        {(tab === 'overview' || tab === 'records' || tab === 'installments') &&
          (monthRecords.length > 0 || (installments ?? []).some(i => i.source === 'credit_card')) && (
          <button
            onClick={async () => {
              const ccInst = await db.installments.where('source').equals('credit_card').toArray()
              const msg = [
                monthRecords.length > 0 ? `รายการ ${monthRecords.length} รายการของเดือนนี้` : '',
                ccInst.length > 0 ? `แผนผ่อน CC ${ccInst.length} รายการ` : '',
              ].filter(Boolean).join(' + ')
              if (!confirm(`ลบ ${msg}?\nไม่สามารถกู้คืนได้`)) return
              if (monthRecords.length > 0) await db.financeRecords.bulkDelete(monthRecords.map(r => r.id!))
              if (ccInst.length > 0) await db.installments.bulkDelete(ccInst.map(i => i.id!))
            }}
            className="flex-shrink-0 px-3 py-3 text-red-400 text-[16px] border-b-2 border-transparent">
            🗑️
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab
            income={income} expense={expense} net={net}
            expenseByCategory={expenseByCategory}
            monthRecords={monthRecords}
            month={month}
            installments={installments ?? []}
          />
        )}
        {tab === 'records' && (
          <RecordsTab
            records={monthRecords}
            onEdit={(r) => { setEditRecord(r); setShowForm(true) }}
          />
        )}
        {tab === 'yearly' && <YearlyTab records={records ?? []} />}
        {tab === 'installments' && <InstallmentsTab installments={installments ?? []} />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'budget' && <BudgetTab month={month} />}
      </div>

      {showForm && (
        <FinanceForm
          editRecord={editRecord}
          onClose={() => { setShowForm(false); setEditRecord(null) }}
        />
      )}
    </div>
  )
}

interface ImportState {
  file: { id: string; name: string; bankName: string; dateStr?: string; webViewLink?: string }
  txns: Array<CreditCardTransaction & { category: string }>
  selected: boolean[]
}

function detectCat(description: string, type?: 'income' | 'expense'): string {
  const d = description.toUpperCase()
  const t = description // keep Thai original
  // Thai utility / telco / household
  if (/การไฟฟ้า|MEA|PEA|กฟผ|กฟน|กฟภ/.test(t)) return 'บ้าน'
  if (/การประปา|MWA|ประปา/.test(t)) return 'บ้าน'
  if (/ทรู|TRUE|AIS|DTAC|NT |3BB|TOT|โทรคมนาคม/.test(t.toUpperCase())) return 'Subscription'
  if (/ปตท\.|PTT|บางจาก|BANGCHAK|เชลล์|SHELL|คาลเท็กซ์|CALTEX|ESSO|เอสโซ่/.test(t.toUpperCase())) return 'เดินทาง'
  if (/AIA|FWD|กรุงไทยแอกซ่า|เมืองไทยประกัน|ไทยประกัน|วิริยะ|ทิพยประกัน|ประกันชีวิต|ประกันภัย|INSURANCE|ASSURANCE/.test(t.toUpperCase())) return 'ประกัน'
  // Food delivery / restaurants
  if (/GRAB|แกร็บ|ไลน์แมน|LINEMAN|FOODPANDA|ฟู๊ดแพนด้า|ฟู้ดแพนด้า|ROBINHOOD/.test(t.toUpperCase())) return 'อาหาร'
  if (/FOOD|MEKIKI|SUKISHI|AFTER YOU|CAFE|COFFEE|KFC|PIZZA|BQ|PZD|MK |เอ็มเค|ชาบู|สเต๊ก|ก๋วยเตี๋ยว|ร้านอาหาร/.test(t.toUpperCase())) return 'อาหาร'
  // Transport
  if (/MRT|BTS|BEM|TAXI|BOLT|TRANSPORT|รถไฟฟ้า|แท็กซี่|มอเตอร์เวย์|EXAT|ทางด่วน/.test(t.toUpperCase())) return 'เดินทาง'
  // Health
  if (/HOSPITAL|CLINIC|PHARMACY|MEDICAL|SIRIRAJ|BANGPO|SAMITIVEJ|RAJDHEV|โรงพยาบาล|คลินิก|ร้านยา|ยา|รพ\.|รพ /.test(t.toUpperCase())) return 'สุขภาพ'
  // Shopping
  if (/SHOPEE|LAZADA|CENTRAL|LOTUS|TOPS|UNIQLO|AMAZON|7-ELEVEN|เซเว่น|โลตัส|แม็คโคร|บิ๊กซี|ท็อปส์|เทสโก้|ช้อปปี้|ลาซาด้า/.test(t.toUpperCase())) return 'ช้อปปิ้ง'
  // Subscriptions
  if (/APPLE|NETFLIX|SPOTIFY|ANTHROPIC|GOOGLE|YOUTUBE|WINDSURF|LUMEN|COWAY|2C2P.*SUBSCRIPTION|DISNEY|HBO|VIU|PRIME/.test(d)) return 'Subscription'
  // Wallet topup / financial transfers
  if (/ทรูมันนี่|TRUEMONEY|TRUE MONEY|RABBIT LINE|LINE PAY|SHOPEEPAY|WALLET/.test(t.toUpperCase())) return 'อื่นๆ'
  // Person-to-person transfer (Thai person prefix) → generic transfer
  if (/^(น\.ส\.|นาย|นาง|MR\.|MS\.|MRS\.)/i.test(t.trim())) return type === 'income' ? 'โอนเข้า' : 'อื่นๆ'
  // Default
  return type === 'income' ? 'โอนเข้า' : 'อื่นๆ'
}

function OverviewTab({ income, expense, net, expenseByCategory, monthRecords, month, installments }: {
  income: number; expense: number; net: number; expenseByCategory: Record<string, number>; monthRecords: FinanceRecord[]; month: string; installments: Installment[]
}) {
  const tokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))
  const [showDataSources, setShowDataSources] = useState(false)
  const [bills, setBills] = useState<BillFile[]>([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [billsError, setBillsError] = useState<string | null>(null)
  const [billsSynced, setBillsSynced] = useState(false)
  const [emailsLoading, setEmailsLoading] = useState(false)

  // PDF import state
  const [importState, setImportState] = useState<ImportState | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [syncDebug, setSyncDebug] = useState<{ subject: string; from: string; body: string; amount: number }[]>([])

  // Manual PDF upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualBank, setManualBank] = useState('KTC')
  const [manualParsing, setManualParsing] = useState(false)

  // Drive browser
  const [showDriveBrowser, setShowDriveBrowser] = useState(false)
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveSearch, setDriveSearch] = useState('')
  const [driveError, setDriveError] = useState<string | null>(null)

  // Track already-synced Drive file IDs via rawRef
  const syncedFileIds = useLiveQuery(async () => {
    const records = await db.financeRecords.filter(r => !!r.rawRef && (r.rawRef as string).length > 10).toArray()
    return new Set(records.map(r => r.rawRef as string))
  }, [], new Set<string>())

  // Selected month's bills
  const [selectedYear, selectedMonthNum] = month.split('-').map(Number)
  const monthBills = bills.filter(b => b.year === selectedYear && b.month === selectedMonthNum)
  const allBillsByMonth = bills.reduce((acc, b) => {
    const key = `${b.year}-${String(b.month).padStart(2, '0')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {} as Record<string, BillFile[]>)

  const BANK_LABELS: Record<string, { label: string; color: string }> = {
    KBANK:    { label: 'กสิกร', color: 'bg-green-100 text-green-700' },
    KTC:      { label: 'KTC', color: 'bg-blue-100 text-blue-700' },
    KRUNGSRI: { label: 'กรุงศรี', color: 'bg-yellow-100 text-yellow-700' },
    UOB:      { label: 'ยูโอบี', color: 'bg-red-100 text-red-700' },
    SCB:      { label: 'ไทยพาณิชย์', color: 'bg-purple-100 text-purple-700' },
    BBL:      { label: 'กรุงเทพ', color: 'bg-indigo-100 text-indigo-700' },
    BAY:      { label: 'กรุงศรี', color: 'bg-yellow-100 text-yellow-700' },
    CITIBANK: { label: 'Citi', color: 'bg-red-100 text-red-700' },
  }

  async function syncBills() {
    if (!tokens?.accessToken) return
    setBillsLoading(true)
    setBillsError(null)
    try {
      const result = await listBillFiles(tokens.accessToken)
      setBills(result)
      setBillsSynced(true)
      setToast({ text: `โหลด PDF สำเร็จ ${result.length} ไฟล์`, type: 'success' })
    } catch (e: any) {
      const msg = e.message ?? 'ไม่สามารถโหลดไฟล์จาก Drive ได้'
      setBillsError(msg)
      setToast({ text: msg, type: 'error' })
    } finally {
      setBillsLoading(false)
    }
  }

  async function recategorize() {
    // Re-run detectCat on existing bank-sourced records with generic categories
    const all = await db.financeRecords.toArray()
    const targets = all.filter(r =>
      (r.source === 'kasikorn' || r.source === 'bangkok_bank') &&
      ['โอนเข้า', 'โอนออก', 'อื่นๆ'].includes(r.category) &&
      r.description
    )
    let updated = 0
    for (const r of targets) {
      const newCat = detectCat(r.description ?? '', r.type)
      if (newCat !== r.category) {
        await db.financeRecords.update(r.id!, { category: newCat })
        updated++
      }
    }
    return updated
  }

  async function syncEmails() {
    if (!tokens?.accessToken) return
    setEmailsLoading(true)
    try {
      // Re-categorize existing records first (so old records get the new auto-detect)
      const recat = await recategorize()
      const { fetchGmailBankMessages, parseBankEmail } = await import('../api/google')
      const sinceDate = month.replace('-', '/') + '/01'
      const messages = await fetchGmailBankMessages(tokens.accessToken, sinceDate)
      let added = 0, skipped = 0
      const unparsedFroms: string[] = []
      const debugFailed: { subject: string; from: string; body: string; amount: number }[] = []
      for (const msg of messages) {
        const txn: any = parseBankEmail(msg)
        if (!txn.rawRef || txn.amount <= 0) {
          if (txn.fromHeader) {
            const domain = txn.fromHeader.match(/@([^\s>]+)/)?.[1] ?? txn.fromHeader
            unparsedFroms.push(domain)
          }
          const headers = msg.payload?.headers || []
          const subj = headers.find((h: any) => h.name === 'Subject')?.value ?? ''
          const from = headers.find((h: any) => h.name === 'From')?.value ?? ''
          debugFailed.push({ subject: subj, from, body: txn.bodySnippet ?? '', amount: txn.amount ?? 0 })
          continue
        }
        const exists = await db.financeRecords.where('rawRef').equals(txn.rawRef).count()
        if (exists > 0) { skipped++; continue }
        await db.financeRecords.add({
          date: txn.date,
          amount: txn.amount,
          type: txn.type as 'income' | 'expense',
          category: detectCat(txn.description ?? '', txn.type as 'income' | 'expense'),
          description: txn.description,
          source: txn.source as any,
          rawRef: txn.rawRef,
        })
        added++
      }
      setSyncDebug(debugFailed)
      const fromsNote = unparsedFroms.length > 0 ? ` · จาก: ${[...new Set(unparsedFroms)].slice(0, 2).join(', ')}` : ''
      const recatNote = recat > 0 ? ` · จัดหมวดใหม่ ${recat}` : ''
      const detail = `(พบ ${messages.length} อีเมล${unparsedFroms.length > 0 ? ` · อ่านยอดไม่ได้ ${unparsedFroms.length}` : ''}${skipped > 0 ? ` · ซ้ำ ${skipped}` : ''}${fromsNote})`
      setToast({
        text: added > 0
          ? `เพิ่ม ${added} รายการ${recatNote} ${detail}`
          : messages.length === 0
            ? `ไม่พบอีเมลธนาคารใน 48 ชม. ที่ผ่านมา${recatNote}`
            : `ไม่มีรายการใหม่${recatNote} ${detail}`,
        type: added > 0 || recat > 0 ? 'success' : 'error',
      })
    } catch (e: any) {
      setToast({ text: 'อ่าน Gmail ไม่ได้ — ตรวจสอบการเชื่อมต่อ', type: 'error' })
    } finally {
      setEmailsLoading(false)
    }
  }

  async function importPdf(bill: BillFile) {
    if (!tokens?.accessToken) return
    setImporting(bill.id)
    try {
      const [{ downloadDriveFile }, { parseBillPdf }] = await Promise.all([
        import('../api/google'),
        import('../api/pdfParser'),
      ])
      const buffer = await downloadDriveFile(tokens.accessToken, bill.id)
      const txns = await parseBillPdf(buffer, bill.bankName)
      const txnsWithCat = txns.map(t => ({ ...t, category: detectCat(t.description) }))
      setImportState({
        file: bill,
        txns: txnsWithCat,
        selected: new Array(txnsWithCat.length).fill(true),
      })
    } catch (e: any) {
      setToast({ text: 'อ่าน PDF ไม่ได้ — ลองเลือกไฟล์อีกครั้ง', type: 'error' })
    } finally {
      setImporting(null)
    }
  }

  async function openDriveBrowser() {
    if (!tokens?.accessToken) return
    setShowDriveBrowser(true)
    setDriveError(null)
    setDriveSearch('')
    setDriveLoading(true)
    try {
      const { browseDrivePdfs } = await import('../api/google')
      const files = await browseDrivePdfs(tokens.accessToken)
      setDriveFiles(files)
    } catch (e: any) {
      setDriveError(e.message ?? 'โหลด Drive ไม่สำเร็จ')
    } finally {
      setDriveLoading(false)
    }
  }

  async function searchDrive(name: string) {
    if (!tokens?.accessToken) return
    setDriveLoading(true)
    setDriveError(null)
    try {
      const { browseDrivePdfs } = await import('../api/google')
      const files = await browseDrivePdfs(tokens.accessToken, name)
      setDriveFiles(files)
    } catch (e: any) {
      setDriveError(e.message ?? 'ค้นหาไม่สำเร็จ')
    } finally {
      setDriveLoading(false)
    }
  }

  async function importFromDrive(file: DriveFile) {
    if (!tokens?.accessToken) return
    setShowDriveBrowser(false)
    setManualParsing(true)
    let step = 'init'
    try {
      step = 'load-module'
      const [{ downloadDriveFile }, { parseBillPdf }] = await Promise.all([
        import('../api/google'),
        import('../api/pdfParser'),
      ])
      step = 'download'
      const buffer = await downloadDriveFile(tokens.accessToken, file.id)
      step = 'parse-pdf'
      const txns = await parseBillPdf(buffer, manualBank)
      step = 'build-state'
      const txnsWithCat = txns.map(t => ({ ...t, category: detectCat(t.description) }))
      setImportState({
        file: { id: `drive_${file.id}`, name: file.name, bankName: manualBank, webViewLink: file.webViewLink },
        txns: txnsWithCat,
        selected: new Array(txnsWithCat.length).fill(true),
      })
    } catch (e: any) {
      console.error('Drive PDF import failed at step:', step, e)
      setToast({ text: 'นำเข้าข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง', type: 'error' })
    } finally {
      setManualParsing(false)
    }
  }

  async function importPdfFile(file: File) {
    setManualParsing(true)
    let step = 'init'
    try {
      step = 'load-module'
      const mod = await import('../api/pdfParser')
      if (typeof mod.parseBillPdf !== 'function') {
        throw new Error(`parseBillPdf is ${typeof mod.parseBillPdf}, exports: ${Object.keys(mod).join(',')}`)
      }
      step = 'read-file'
      const buffer = await file.arrayBuffer()
      step = 'parse-pdf'
      const txns = await mod.parseBillPdf(buffer, manualBank)
      step = 'build-state'
      const txnsWithCat = txns.map(t => ({ ...t, category: detectCat(t.description) }))
      const fileId = `manual_${manualBank}_${file.name}`
      setImportState({
        file: { id: fileId, name: file.name, bankName: manualBank },
        txns: txnsWithCat,
        selected: new Array(txnsWithCat.length).fill(true),
      })
    } catch (e: any) {
      console.error('PDF import failed at step:', step, e)
      setToast({ text: 'นำเข้า PDF ไม่สำเร็จ — ลองใหม่อีกครั้ง', type: 'error' })
    } finally {
      setManualParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function saveImport() {
    if (!importState) return
    const toSave = importState.txns.filter((_, i) => importState.selected[i])
    if (toSave.length === 0) return
    const fallbackDate = new Date().toISOString().slice(0, 10)
    const fileId = importState.file.id
    const bankName = importState.file.bankName
    try {
      let added = 0
      let skipped = 0

      // Single transaction covering both financeRecords + installments
      await db.transaction('rw', [db.financeRecords, db.installments], async () => {
        // Build dedup set inside the transaction to get a consistent snapshot
        const allCCRecords = await db.financeRecords.where('source').equals('credit_card').toArray()
        const existingKeys = new Set(allCCRecords.map(r => `${r.date}|${r.amount}|${r.description}`))

        for (const txn of toSave) {
          const date = txn.transDate || fallbackDate
          const amount = Math.abs(txn.amount)
          const description = txn.description || '(ไม่ระบุ)'
          const key = `${date}|${amount}|${description}`
          if (existingKeys.has(key)) { skipped++; continue }
          await db.financeRecords.add({
            date,
            amount,
            type: txn.amount < 0 ? 'income' : 'expense',
            category: txn.amount < 0 ? 'อื่นๆ' : (txn.category || 'อื่นๆ'),
            description,
            source: 'credit_card',
            rawRef: fileId,
            cardName: bankName,
            ...(txn.installmentInfo ? {
              installmentCurrent: txn.installmentInfo.current,
              installmentTotal: txn.installmentInfo.total,
            } : {}),
          })
          existingKeys.add(key)
          added++
        }

      })

      setImportState(null)
      setToast({
        text: added > 0
          ? `บันทึก ${added} รายการ${skipped > 0 ? ` (ข้าม ${skipped} ซ้ำ)` : ''}`
          : `ทั้งหมดเป็นรายการซ้ำ (${skipped})`,
        type: added > 0 ? 'success' : 'error',
      })
    } catch (e: any) {
      console.error('saveImport error:', e)
      setToast({ text: 'บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง', type: 'error' })
    }
  }

  const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

  return (
    <>
      <Toast message={toast?.text ?? null} type={toast?.type} onDone={() => setToast(null)} />
      <div className="px-4 pt-3 grid grid-cols-3 gap-2">
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รายรับ</div>
          <div className="text-[15px] font-bold text-green-600">{formatCurrency(income)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รายจ่าย</div>
          <div className="text-[15px] font-bold text-red-500">{formatCurrency(expense)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">คงเหลือ</div>
          <div className={`text-[15px] font-bold ${net >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatCurrency(net)}</div>
        </Card>
      </div>

      {/* Credit card spending summary */}
      {(() => {
        const cardExpense = monthRecords
          .filter(r => r.type === 'expense' && r.source === 'credit_card' && r.cardName)
          .reduce((acc, r) => { acc[r.cardName!] = (acc[r.cardName!] || 0) + r.amount; return acc }, {} as Record<string, number>)
        const cards = Object.entries(cardExpense).sort((a, b) => b[1] - a[1])
        if (cards.length === 0) return null
        const cardTotal = cards.reduce((s, [, v]) => s + v, 0)
        return (
          <>
            <SectionLabel>ยอดใช้จ่ายบัตรเครดิต</SectionLabel>
            <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
              {cards.map(([card, amt], idx) => (
                <div key={card} className={`px-4 py-3 ${idx < cards.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-medium text-gray-700">
                      💳 {BANK_LABELS[card]?.label ?? card}
                      <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${BANK_LABELS[card]?.color ?? 'bg-gray-100 text-gray-600'}`}>{card}</span>
                    </span>
                    <span className="text-[14px] font-bold text-gray-900">{formatCurrency(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={cardTotal} color="bg-purple-400" />
                </div>
              ))}
              <div className="px-4 py-2.5 bg-gray-50 flex justify-between">
                <span className="text-[12px] font-semibold text-gray-500">รวมทุกบัตร</span>
                <span className="text-[13px] font-bold text-purple-700">{formatCurrency(cardTotal)}</span>
              </div>
            </div>
          </>
        )
      })()}

      {/* Future installment payment plan */}
      {(() => {
        const active = installments.filter(i => i.paidInstallments < i.totalInstallments)
        if (active.length === 0) return null
        const baseDate = new Date(month + '-01')
        const baseYear = baseDate.getFullYear()
        const baseMonth = baseDate.getMonth()
        const months: { key: string; label: string; total: number; items: { inst: Installment; remaining: number }[] }[] = []
        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
        for (let offset = 0; offset < 12; offset++) {
          const y = baseYear + Math.floor((baseMonth + offset) / 12)
          const m = (baseMonth + offset) % 12
          const key = `${y}-${String(m + 1).padStart(2, '0')}`
          const items: { inst: Installment; remaining: number }[] = []
          let total = 0
          for (const inst of active) {
            const s = new Date(inst.startDate)
            const monthDiff = (y - s.getFullYear()) * 12 + (m - s.getMonth())
            const dueInstallmentNum = monthDiff + 1
            if (dueInstallmentNum >= 1 && dueInstallmentNum <= inst.totalInstallments && dueInstallmentNum > inst.paidInstallments) {
              total += inst.monthlyAmount
              items.push({ inst, remaining: inst.totalInstallments - dueInstallmentNum + 1 })
            }
          }
          if (total > 0) months.push({ key, label: `${thaiMonths[m]} ${y + 543}`, total, items })
          if (months.length >= 6 && offset >= 5) break
        }
        if (months.length === 0) return null
        const grandTotal = months.reduce((s, m) => s + m.total, 0)
        return (
          <>
            <SectionLabel>📅 แผนผ่อนล่วงหน้า</SectionLabel>
            <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-amber-50 flex justify-between border-b border-amber-100">
                <span className="text-[12px] font-semibold text-amber-700">ยอดผ่อนรวม {months.length} เดือนข้างหน้า</span>
                <span className="text-[13px] font-bold text-amber-900">{formatCurrency(grandTotal)}</span>
              </div>
              {months.map((mo, idx) => (
                <details key={mo.key} className={idx < months.length - 1 ? 'border-b border-gray-50' : ''}>
                  <summary className="px-4 py-3 flex items-center justify-between cursor-pointer list-none">
                    <span className="text-[13px] font-semibold text-gray-700">{mo.label}</span>
                    <span className="text-[13px] font-bold text-red-500">{formatCurrency(mo.total)}</span>
                  </summary>
                  <div className="bg-gray-50 px-4 py-2">
                    {mo.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-[12px]">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-700 truncate">{it.inst.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {it.inst.cardName && <span className="mr-1.5">💳 {it.inst.cardName}</span>}
                            เหลือ {it.remaining}/{it.inst.totalInstallments} งวด
                          </div>
                        </div>
                        <div className="text-[12px] font-bold text-gray-800 ml-2">{formatCurrency(it.inst.monthlyAmount)}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </>
        )
      })()}

      {Object.keys(expenseByCategory).length > 0 && (
        <>
          <SectionLabel>หมวดรายจ่าย</SectionLabel>
          <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
            {Object.entries(expenseByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt], idx, arr) => {
                const pct = expense > 0 ? (amt / expense) * 100 : 0
                const chipColor = CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-500'
                // extract bg color for progress bar (convert chip class)
                const barColor = chipColor.includes('orange') ? 'bg-orange-400'
                  : chipColor.includes('blue') ? 'bg-blue-400'
                  : chipColor.includes('pink') ? 'bg-pink-400'
                  : chipColor.includes('green') ? 'bg-green-400'
                  : chipColor.includes('cyan') ? 'bg-cyan-400'
                  : chipColor.includes('amber') ? 'bg-amber-400'
                  : chipColor.includes('violet') ? 'bg-violet-400'
                  : chipColor.includes('emerald') ? 'bg-emerald-400'
                  : chipColor.includes('rose') ? 'bg-rose-400'
                  : chipColor.includes('purple') ? 'bg-purple-400'
                  : 'bg-gray-400'
                return (
                  <div key={cat} className={`px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${chipColor}`}>
                          {CAT_ICONS[cat] ?? '📦'} {cat}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">{pct.toFixed(0)}%</span>
                        <span className="text-[14px] font-bold text-gray-900">{formatCurrency(amt)}</span>
                      </div>
                    </div>
                    <ProgressBar value={amt} max={expense} color={barColor} />
                  </div>
                )
              })}
          </div>
        </>
      )}

      {/* ── Data Sources (collapsible) ── */}
      <div className="mx-4 mb-4">
        <button
          onClick={() => setShowDataSources(v => !v)}
          className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🔗</span>
            <span className="text-[13px] font-semibold text-gray-700">แหล่งข้อมูล (Sync / นำเข้า)</span>
          </div>
          <span className={`text-gray-400 transition-transform duration-200 ${showDataSources ? 'rotate-180' : ''}`}>▾</span>
        </button>
      </div>

      {showDataSources && (
        <>
      {/* Gmail sync section */}
      <div className="mx-4 mb-4">
        <Card className="!bg-blue-50">
          <div className="text-[13px] font-semibold text-blue-700 mb-2">📧 Sync จาก Gmail</div>
          <div className="text-[12px] text-blue-600 mb-3">อ่านอีเมลโอนเงิน กสิกร/กรุงเทพ อัตโนมัติ</div>
          {!tokens?.accessToken ? (
            <div className="text-[12px] text-blue-500 mb-2">ต้องต่อ Google ก่อน (Settings)</div>
          ) : (
            <button
              onClick={syncEmails}
              disabled={emailsLoading}
              className="bg-blue-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 w-full disabled:opacity-60"
            >
              {emailsLoading ? '⏳ กำลัง Sync...' : '📧 Sync ธนาคาร'}
            </button>
          )}
        </Card>
      </div>

      {/* Debug panel — failed emails */}
      {syncDebug.length > 0 && (
        <div className="mx-4 mb-4">
          <div className="text-[12px] font-bold text-red-500 mb-2">🔍 อีเมลที่อ่านไม่ได้ ({syncDebug.length} รายการ)</div>
          {syncDebug.map((d, i) => (
            <div key={i} className="bg-red-50 rounded-xl p-3 mb-2 text-[11px]">
              <div className="font-bold text-red-700 mb-1 break-all">{d.subject || '(ไม่มี subject)'}</div>
              <div className="text-red-400 mb-1">{d.from}</div>
              <div className="text-gray-500 font-mono break-all whitespace-pre-wrap">{d.body || '(body ว่าง)'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Credit card PDF section */}
      <div className="mx-4 mb-4">
        <Card className="!bg-purple-50">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[13px] font-semibold text-purple-700">📄 บัตรเครดิต PDF</div>
            {billsSynced && (
              <span className="text-[11px] text-purple-500">{bills.length} ไฟล์</span>
            )}
          </div>
          <div className="text-[12px] text-purple-600 mb-2.5">
            folder: <code className="bg-purple-100 px-1 rounded text-[11px]">daily-incom-expense</code>
            <br />รูปแบบไฟล์: Bill_yyyymmdd_bankname.pdf
          </div>

          {!tokens?.accessToken ? (
            <div className="text-[12px] text-purple-500 mb-2">ต้องต่อ Google ก่อน (Settings)</div>
          ) : (
            <button
              onClick={syncBills}
              disabled={billsLoading}
              className="bg-purple-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 w-full disabled:opacity-60"
            >
              {billsLoading ? '⏳ กำลังโหลด Bill...' : '🔄 Sync บิลบัตรเครดิต'}
            </button>
          )}

          {billsError && (
            <div className="mt-2 text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{billsError}</div>
          )}

          {/* Bills for current month */}
          {billsSynced && monthBills.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] font-semibold text-purple-600 mb-1.5">
                บิลเดือน {THAI_MONTHS[selectedMonthNum - 1]} {selectedYear}
              </div>
              <div className="flex flex-col gap-2">
                {monthBills.map(bill => {
                  const bankInfo = BANK_LABELS[bill.bankName] ?? { label: bill.bankName, color: 'bg-gray-100 text-gray-600' }
                  const dateDisplay = `${bill.dateStr.slice(6, 8)}/${bill.dateStr.slice(4, 6)}/${bill.dateStr.slice(0, 4)}`
                  const isImporting = importing === bill.id
                  const alreadySynced = syncedFileIds?.has(bill.id) ?? false
                  return (
                    <div key={bill.id} className="bg-white rounded-xl px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📄</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${bankInfo.color}`}>{bankInfo.label}</span>
                              <span className="text-[12px] text-gray-500">{dateDisplay}</span>
                              {alreadySynced && (
                                <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">✓ นำเข้าแล้ว</span>
                              )}
                            </div>
                            {bill.size && (
                              <div className="text-[10px] text-gray-400">{(parseInt(bill.size) / 1024).toFixed(0)} KB</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => importPdf(bill)}
                            disabled={isImporting}
                            className="text-[12px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg active:scale-95 disabled:opacity-50"
                          >
                            {isImporting ? '⏳' : alreadySynced ? '📥 นำเข้าซ้ำ' : '📥 นำเข้า'}
                          </button>
                          {bill.webViewLink && (
                            <a href={bill.webViewLink} target="_blank" rel="noopener noreferrer"
                              className="text-[12px] font-semibold text-purple-600 bg-purple-50 px-2.5 py-1.5 rounded-lg active:scale-95">
                              เปิด
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bills grouped by month when no match */}
          {billsSynced && monthBills.length === 0 && bills.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] text-purple-500 mb-2">ไม่มีบิลเดือนนี้ — บิลทั้งหมด:</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(allBillsByMonth)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 6)
                  .map(([monthKey, mBills]) => {
                    const [y, m] = monthKey.split('-').map(Number)
                    return (
                      <div key={monthKey} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                        <span className="text-[12px] font-semibold text-gray-700">
                          {THAI_MONTHS[m - 1]} {y} ({mBills.length} ไฟล์)
                        </span>
                        <div className="flex gap-1">
                          {mBills.map(b => {
                            const bInfo = BANK_LABELS[b.bankName] ?? { label: b.bankName, color: 'bg-gray-100 text-gray-600' }
                            return (
                              <a key={b.id} href={b.webViewLink} target="_blank" rel="noopener noreferrer"
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bInfo.color}`}>
                                {bInfo.label}
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {billsSynced && bills.length === 0 && (
            <div className="mt-2 text-[12px] text-purple-500">ไม่พบไฟล์ Bill_*.pdf ใน folder</div>
          )}
        </Card>
      </div>

      {/* Manual PDF upload */}
      <div className="mx-4 mb-4">
        <Card className="!bg-orange-50">
          <div className="text-[13px] font-semibold text-orange-700 mb-1">📄 นำเข้า PDF บัตรเครดิต</div>
          <div className="text-[12px] text-orange-600 mb-2.5">เลือกธนาคาร แล้วเลือกไฟล์ PDF</div>

          {/* Bank selector */}
          <select
            value={manualBank}
            onChange={e => setManualBank(e.target.value)}
            className="w-full border border-orange-200 bg-white rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 outline-none mb-2"
          >
            <option value="KTC">KTC</option>
            <option value="KBANK">กสิกร (KBANK)</option>
            <option value="KRUNGSRI">กรุงศรี (KRUNGSRI)</option>
            <option value="UOB">ยูโอบี (UOB)</option>
          </select>

          {/* Two source buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={manualParsing}
              className="flex-1 bg-orange-500 text-white text-[13px] font-semibold px-3 py-2.5 rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {manualParsing ? '⏳' : '📱'} จากเครื่อง
            </button>
            <button
              onClick={openDriveBrowser}
              disabled={manualParsing || !tokens?.accessToken}
              className="flex-1 bg-green-600 text-white text-[13px] font-semibold px-3 py-2.5 rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {manualParsing ? '⏳' : '☁️'} Google Drive
            </button>
          </div>
          {!tokens?.accessToken && (
            <div className="mt-1.5 text-[11px] text-orange-400">ต่อ Google ก่อนถึงจะเลือกจาก Drive ได้</div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importPdfFile(f) }}
          />
          <div className="text-[11px] text-orange-400 mt-1.5">รองรับ KTC · KBANK · กรุงศรี · UOB</div>
        </Card>
      </div>
        </>
      )}

      {/* Drive Browser Modal */}
      {showDriveBrowser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[16px] font-bold text-gray-900">☁️ เลือกไฟล์จาก Google Drive</div>
                <CloseButton onClick={() => setShowDriveBrowser(false)} />
              </div>
              {/* Bank reminder */}
              <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2 mb-3">
                <span className="text-[12px] text-orange-600">ธนาคาร:</span>
                <select
                  value={manualBank}
                  onChange={e => setManualBank(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] font-bold text-orange-700 outline-none"
                >
                  <option value="KTC">KTC</option>
                  <option value="KBANK">กสิกร (KBANK)</option>
                  <option value="KRUNGSRI">กรุงศรี (KRUNGSRI)</option>
                  <option value="UOB">ยูโอบี (UOB)</option>
                </select>
              </div>
              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={driveSearch}
                  onChange={e => setDriveSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchDrive(driveSearch)}
                  placeholder="ค้นหาชื่อไฟล์..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none"
                />
                <button
                  onClick={() => searchDrive(driveSearch)}
                  disabled={driveLoading}
                  className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-60"
                >
                  {driveLoading ? '⏳' : '🔍'}
                </button>
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
              {driveLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">⏳</div>
                  <div className="text-[13px]">กำลังโหลด...</div>
                </div>
              )}
              {driveError && (
                <div className="mx-4 mt-4 bg-red-50 rounded-xl p-3 text-[13px] text-red-600">❌ {driveError}</div>
              )}
              {!driveLoading && !driveError && driveFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📂</div>
                  <div className="text-[13px]">ไม่พบไฟล์ PDF</div>
                </div>
              )}
              {!driveLoading && driveFiles.map(file => (
                <button
                  key={file.id}
                  onClick={() => importFromDrive(file)}
                  className="w-full px-4 py-3.5 border-b border-gray-50 flex items-center gap-3 active:bg-indigo-50 text-left"
                >
                  <span className="text-2xl flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{file.name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 flex gap-2">
                      {file.size && <span>{(parseInt(file.size) / 1024).toFixed(0)} KB</span>}
                      {file.createdTime && <span>{new Date(file.createdTime).toLocaleDateString('th-TH')}</span>}
                    </div>
                  </div>
                  <span className="text-indigo-500 text-[12px] font-bold flex-shrink-0">เลือก →</span>
                </button>
              ))}
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}

      {/* PDF Import Modal */}
      {importState && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="text-[16px] font-bold text-gray-900">นำเข้ารายการ</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {importState.file.bankName} · {importState.file.dateStr ? `${importState.file.dateStr.slice(6, 8)}/${importState.file.dateStr.slice(4, 6)}/${importState.file.dateStr.slice(0, 4)}` : importState.file.name}
                </div>
              </div>
              <CloseButton onClick={() => setImportState(null)} />
            </div>

            {importState.txns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="text-4xl mb-2">🔍</div>
                <div className="text-[13px]">ไม่พบรายการในไฟล์นี้</div>
                <div className="text-[11px] mt-1 text-gray-300">รูปแบบ PDF อาจไม่ตรงกับที่รองรับ</div>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100 flex-shrink-0 bg-gray-50">
                  <div className="text-[13px] text-gray-600 font-medium">
                    {importState.selected.filter(Boolean).length} / {importState.txns.length} รายการ
                  </div>
                  <button
                    onClick={() => {
                      const allSelected = importState.selected.every(Boolean)
                      setImportState(s => s ? { ...s, selected: s.selected.map(() => !allSelected) } : s)
                    }}
                    className="text-[12px] text-indigo-600 font-semibold"
                  >
                    {importState.selected.every(Boolean) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {importState.txns.map((txn, i) => (
                    <label key={i} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer ${importState.selected[i] ? '' : 'opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={importState.selected[i]}
                        onChange={() => setImportState(s => {
                          if (!s) return s
                          const sel = [...s.selected]
                          sel[i] = !sel[i]
                          return { ...s, selected: sel }
                        })}
                        className="mt-0.5 w-4 h-4 accent-indigo-600 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-800 leading-snug">{txn.description}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-gray-400">{txn.transDate}</span>
                          <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 rounded-full">{txn.category}</span>
                          {txn.installmentInfo && (
                            <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 rounded-full">
                              งวด {txn.installmentInfo.current}/{txn.installmentInfo.total}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`text-[14px] font-bold flex-shrink-0 ${txn.amount < 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {txn.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(txn.amount))}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                  <button
                    onClick={saveImport}
                    disabled={importState.selected.every(v => !v)}
                    className="w-full bg-indigo-600 text-white font-bold text-[15px] py-3.5 rounded-2xl active:scale-[0.98] disabled:opacity-40"
                  >
                    บันทึก {importState.selected.filter(Boolean).length} รายการ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function RecordsTab({ records, onEdit }: { records: FinanceRecord[]; onEdit: (r: FinanceRecord) => void }) {
  return (
    <div className="px-4 pt-3 flex flex-col gap-2 pb-4">
      {records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-medium text-gray-500 mb-1">ยังไม่มีรายการในเดือนนี้</div>
        </div>
      ) : records.map(r => {
        const catColor = CAT_COLORS[r.category] ?? (r.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')
        return (
          <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
            {/* Icon bubble — color by category */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${catColor}`}>
              {CAT_ICONS[r.category] ?? (r.type === 'income' ? '💚' : '📦')}
            </div>
            {/* Description + category chip + date */}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-gray-900 truncate">{r.description || r.category}</div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${catColor}`}>{r.category}</span>
                <span className="text-[11px] text-gray-400">{r.date}</span>
                {r.cardName && <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded">{r.cardName}</span>}
              </div>
            </div>
            {/* Amount + actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className={`text-[15px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
              </div>
              <IconButton onClick={() => onEdit(r)}>✏️</IconButton>
              <IconButton tone="destructive" onClick={() => { if (confirm('ลบรายการนี้?\nไม่สามารถกู้คืนได้')) db.financeRecords.delete(r.id!) }}>🗑️</IconButton>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function YearlyTab({ records }: { records: FinanceRecord[] }) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [drillMonth, setDrillMonth] = useState<string | null>(null)

  const years = [...new Set(records.map(r => parseInt(r.date.slice(0, 4))))].sort((a, b) => b - a)

  const yearRecords = records.filter(r => r.date.startsWith(selectedYear.toString()))
  const monthSummary = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    const key = `${selectedYear}-${m}`
    const mrs = yearRecords.filter(r => r.date.startsWith(key))
    return {
      month: key,
      label: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][i],
      income: mrs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0),
      expense: mrs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
      records: mrs,
    }
  })

  const totalIncome = yearRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = yearRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)

  const drillData = drillMonth ? monthSummary.find(m => m.month === drillMonth) : null

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Year selector */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {(years.length > 0 ? years : [currentYear]).map(y => (
          <button key={y} onClick={() => { setSelectedYear(y); setDrillMonth(null) }}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-semibold ${selectedYear === y ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'}`}>
            {y}
          </button>
        ))}
      </div>

      {/* Year total */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">รายรับ/ปี</div>
          <div className="text-[14px] font-bold text-green-600">{formatCurrency(totalIncome, 0)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">รายจ่าย/ปี</div>
          <div className="text-[14px] font-bold text-red-500">{formatCurrency(totalExpense, 0)}</div>
        </Card>
        <Card className="!p-3 text-center">
          <div className="text-[11px] text-gray-400">เก็บได้/ปี</div>
          <div className={`text-[14px] font-bold ${totalIncome - totalExpense >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
            {formatCurrency(totalIncome - totalExpense, 0)}
          </div>
        </Card>
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="text-[13px] font-bold text-gray-600 mb-3">รายเดือน</div>
        <div className="flex gap-1 items-end h-20">
          {monthSummary.map(m => {
            const maxVal = Math.max(...monthSummary.map(x => Math.max(x.income, x.expense)), 1)
            const expH = Math.round((m.expense / maxVal) * 72)
            const incH = Math.round((m.income / maxVal) * 72)
            return (
              <button key={m.month} onClick={() => setDrillMonth(drillMonth === m.month ? null : m.month)}
                className={`flex-1 flex flex-col items-center gap-0.5 ${drillMonth === m.month ? 'opacity-100' : 'opacity-80'}`}
              >
                <div className="w-full flex gap-0.5 items-end justify-center h-16">
                  <div style={{ height: incH || 2 }} className="flex-1 bg-green-400 rounded-t-sm" />
                  <div style={{ height: expH || 2 }} className="flex-1 bg-red-400 rounded-t-sm" />
                </div>
                <div className={`text-[9px] ${drillMonth === m.month ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>{m.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Drill-down month detail */}
      {drillData && (
        <div className="mb-4">
          <div className="text-[13px] font-bold text-gray-600 mb-2 px-1">{drillData.label} — {drillData.records.length} รายการ</div>
          <div className="flex flex-col gap-2">
            {drillData.records.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{CAT_ICONS[r.category] ?? '📦'}</span>
                  <div>
                    <div className="text-[13px] font-semibold text-gray-800">{r.description || r.category}</div>
                    <div className="text-[11px] text-gray-400">{r.date}</div>
                  </div>
                </div>
                <div className={`text-[14px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// helper: strip "XX/YY" installment notation from CC description
function cleanInstName(desc: string) {
  return desc
    .replace(/^\d{2,3}\/\d{2,3}\s+/, '')
    .replace(/\s*:?\s*\d{2,3}\/\d{2,3}\s*$/, '')
    .replace(/\s+INT\d+\.?\d*%/i, '')
    .trim() || desc
}

interface InstPrefill {
  name: string
  monthlyAmount: string
  totalInstallments: string
  paidInstallments: string
  startDate: string
  cardName?: string
}

// Parse installment notation from CC description: "02/10 NAME" or "NAME 02/10"
function parseInstFromDesc(desc: string): { current: number; total: number } | null {
  const m = desc.match(/^(\d{2,3})\/(\d{2,3})\s/) || desc.match(/\s(\d{2,3})\/(\d{2,3})$/) || desc.match(/:?\s*(\d{2,3})\/(\d{2,3})/)
  if (!m) return null
  const current = parseInt(m[1])
  const total = parseInt(m[2])
  if (current < 1 || total < 2 || current > total || total > 120) return null
  return { current, total }
}

function InstallmentsTab({ installments }: { installments: Installment[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Installment | null>(null)
  const [prefill, setPrefill] = useState<InstPrefill | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  async function backfillCCInstallments() {
    setScanning(true)
    setScanResult(null)
    try {
      const ccRecords = await db.financeRecords.where('source').equals('credit_card')
        .filter(r => !r.installmentTotal)
        .toArray()
      let updated = 0
      for (const r of ccRecords) {
        const parsed = parseInstFromDesc(r.description ?? '')
        if (!parsed) continue
        await db.financeRecords.update(r.id!, {
          installmentCurrent: parsed.current,
          installmentTotal: parsed.total,
        })
        updated++
      }
      setScanResult(updated > 0 ? `พบ ${updated} รายการผ่อน` : 'ไม่พบรายการใหม่')
    } finally {
      setScanning(false)
    }
  }

  // CC financeRecords that carry installment info (imported from PDF)
  const ccInstRecords = useLiveQuery(() =>
    db.financeRecords.where('source').equals('credit_card')
      .filter(r => !!r.installmentTotal && (r.installmentTotal ?? 0) > 1)
      .toArray()
  , [])

  // Group by (cleanName | totalInstallments), keep highest installmentCurrent per group
  const pendingCCItems: (InstPrefill & { key: string })[] = (() => {
    if (!ccInstRecords) return []
    const grouped = new Map<string, FinanceRecord>()
    for (const r of ccInstRecords) {
      const name = cleanInstName(r.description)
      const key = `${name}|${r.installmentTotal}`
      const cur = grouped.get(key)
      if (!cur || (r.installmentCurrent ?? 0) > (cur.installmentCurrent ?? 0)) grouped.set(key, r)
    }
    // Filter out records that already have a matching plan in db.installments
    const result: (InstPrefill & { key: string })[] = []
    for (const [key, r] of grouped) {
      const name = cleanInstName(r.description)
      const alreadyLinked = installments.some(i =>
        i.totalInstallments === r.installmentTotal &&
        i.name.slice(0, 10) === name.slice(0, 10)
      )
      if (alreadyLinked) continue
      const current = r.installmentCurrent ?? 1
      const billing = new Date()
      billing.setDate(1)
      billing.setMonth(billing.getMonth() - (current - 1))
      const startDate = billing.toISOString().slice(0, 10)
      result.push({
        key,
        name,
        monthlyAmount: r.amount.toString(),
        totalInstallments: (r.installmentTotal ?? 1).toString(),
        paidInstallments: current.toString(),
        startDate,
        cardName: r.cardName,
      })
    }
    return result
  })()

  const activeInstallments = installments.filter(i => i.paidInstallments < i.totalInstallments)
  const totalMonthly = activeInstallments.reduce((s, i) => s + i.monthlyAmount, 0)

  const CARD_COLORS: Record<string, string> = {
    KTC: 'bg-blue-100 text-blue-700', KBANK: 'bg-green-100 text-green-700',
    KRUNGSRI: 'bg-yellow-100 text-yellow-700', UOB: 'bg-red-100 text-red-700',
  }

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] text-gray-500">ผ่อนต่อเดือนรวม</div>
          <div className="text-2xl font-bold text-red-500">{formatCurrency(totalMonthly)}</div>
        </div>
        <button onClick={() => { setEditItem(null); setPrefill(null); setShowForm(true) }}
          className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95">
          ＋ เพิ่ม
        </button>
      </div>

      {/* ── Scan button for old CC records ── */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={backfillCCInstallments}
          disabled={scanning}
          className="flex-1 bg-purple-50 border border-purple-200 text-purple-700 text-[12px] font-semibold px-3 py-2 rounded-xl active:scale-95 disabled:opacity-50"
        >
          {scanning ? '⏳ กำลังสแกน...' : '🔍 สแกนรายการผ่อน CC เก่า'}
        </button>
        {scanResult && <span className="text-[12px] text-purple-600 font-semibold">{scanResult}</span>}
      </div>

      {/* ── CC นำเข้า (pending plans from PDF import) ── */}
      {pendingCCItems.length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] font-bold text-purple-700 mb-2">💳 รายการผ่อน CC (นำเข้าแล้ว — รอสร้างแผน)</div>
          <div className="flex flex-col gap-2">
            {pendingCCItems.map(item => (
              <div key={item.key} className="bg-purple-50 border border-purple-100 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">{item.name}</div>
                  <div className="text-[11px] text-gray-400">
                    งวดที่ {item.paidInstallments}/{item.totalInstallments} · {formatCurrency(parseFloat(item.monthlyAmount))}/เดือน
                    {item.cardName && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${CARD_COLORS[item.cardName] ?? 'bg-gray-100 text-gray-600'}`}>💳 {item.cardName}</span>}
                  </div>
                </div>
                <button
                  onClick={() => { setEditItem(null); setPrefill(item); setShowForm(true) }}
                  className="flex-shrink-0 bg-purple-600 text-white text-[12px] font-semibold px-3 py-2 rounded-xl active:scale-95"
                >
                  สร้างแผนผ่อน
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Installment plans ── */}
      {installments.length === 0 && pendingCCItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💳</div>
          <div className="font-medium text-gray-500 mb-1">ยังไม่มีรายการผ่อนชำระ</div>
          <div className="text-[13px]">Import PDF แล้วกด "สร้างแผนผ่อน" หรือกด ＋ เพิ่มเอง</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {installments.map(inst => {
            const remaining = inst.totalInstallments - inst.paidInstallments
            const pct = (inst.paidInstallments / inst.totalInstallments) * 100
            const isDone = remaining <= 0
            return (
              <div key={inst.id} className={`bg-white rounded-2xl p-4 shadow-sm ${isDone ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="text-[14px] font-semibold text-gray-900">{inst.name}</div>
                      {inst.cardName && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CARD_COLORS[inst.cardName] ?? 'bg-gray-100 text-gray-600'}`}>
                          💳 {inst.cardName}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-400">{inst.category} · เริ่ม {inst.startDate.slice(0, 7)}</div>
                  </div>
                  <div className="flex gap-1">
                    <IconButton onClick={() => { setEditItem(inst); setPrefill(null); setShowForm(true) }}>✏️</IconButton>
                    <IconButton tone="destructive" onClick={() => { if (confirm('ลบรายการผ่อนนี้?\nไม่สามารถกู้คืนได้')) db.installments.delete(inst.id!) }}>🗑️</IconButton>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] text-gray-600">{isDone ? '✅ ปิดแล้ว' : `เหลือ ${remaining} งวด`}</span>
                  <span className="text-[14px] font-bold text-indigo-600">{formatCurrency(inst.monthlyAmount)}/เดือน</span>
                </div>
                <ProgressBar value={pct} max={100} color={isDone ? 'bg-green-500' : 'bg-indigo-500'} />
                <div className="text-[11px] text-gray-400 mt-1">
                  {inst.paidInstallments}/{inst.totalInstallments} งวด · รวม {formatCurrency(inst.totalAmount)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <InstallmentForm
          editItem={editItem}
          prefill={prefill}
          onClose={() => { setShowForm(false); setEditItem(null); setPrefill(null) }}
        />
      )}
    </div>
  )
}

function InstallmentForm({ editItem, prefill, onClose }: {
  editItem: Installment | null
  prefill?: InstPrefill | null
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: editItem?.name ?? prefill?.name ?? '',
    totalAmount: editItem?.totalAmount?.toString() ?? '',
    monthlyAmount: editItem?.monthlyAmount?.toString() ?? prefill?.monthlyAmount ?? '',
    totalInstallments: editItem?.totalInstallments?.toString() ?? prefill?.totalInstallments ?? '',
    paidInstallments: editItem?.paidInstallments?.toString() ?? prefill?.paidInstallments ?? '0',
    startDate: editItem?.startDate ?? prefill?.startDate ?? new Date().toISOString().slice(0, 10),
    category: editItem?.category ?? 'ช้อปปิ้ง',
    source: editItem?.source ?? 'credit_card',
  })

  async function save() {
    if (!form.name || !form.monthlyAmount) return
    const monthly = parseFloat(form.monthlyAmount)
    const total = parseInt(form.totalInstallments) || 1
    const data = {
      name: form.name,
      totalAmount: parseFloat(form.totalAmount) || monthly * total,
      monthlyAmount: monthly,
      totalInstallments: total,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate,
      category: form.category,
      source: form.source,
      ...(prefill?.cardName ? { cardName: prefill.cardName } : {}),
    }
    if (editItem?.id) await db.installments.update(editItem.id, data)
    else await db.installments.add(data)
    onClose()
  }

  const title = editItem ? 'แก้ไขรายการผ่อน' : prefill ? 'สร้างแผนผ่อน' : 'เพิ่มรายการผ่อน'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        {prefill && (
          <div className="text-[12px] text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
            ข้อมูลดึงจาก CC import · ตรวจสอบและแก้ไขก่อนบันทึก
          </div>
        )}
        <input placeholder="ชื่อรายการ (เช่น iPhone 16, Netflix)" value={form.name}
          onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ยอดรวม (บาท)</div>
            <input type="number" value={form.totalAmount}
              onChange={e => setForm(v => ({ ...v, totalAmount: e.target.value }))}
              placeholder={form.monthlyAmount && form.totalInstallments ? (parseFloat(form.monthlyAmount) * parseInt(form.totalInstallments)).toString() : '0'}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ต่อเดือน (บาท)</div>
            <input type="number" value={form.monthlyAmount}
              onChange={e => setForm(v => ({ ...v, monthlyAmount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">จำนวนงวดทั้งหมด</div>
            <input type="number" value={form.totalInstallments}
              onChange={e => setForm(v => ({ ...v, totalInstallments: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ชำระไปแล้ว (งวด)</div>
            <input type="number" value={form.paidInstallments}
              onChange={e => setForm(v => ({ ...v, paidInstallments: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">วันที่เริ่ม (งวดที่ 1)</div>
          <input type="date" value={form.startDate}
            onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>
        <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {CATEGORIES_EXPENSE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button onClick={save}>บันทึก</Button>
      </div>
    </div>
  )
}

// ── Subscriptions ───────────────────────────────────────────────────────────
const SUB_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  streaming: { label: 'Streaming', icon: '🎬', color: 'bg-red-100 text-red-700' },
  cloud:     { label: 'Cloud',     icon: '☁️', color: 'bg-blue-100 text-blue-700' },
  software:  { label: 'Software',  icon: '💻', color: 'bg-purple-100 text-purple-700' },
  fitness:   { label: 'Fitness',   icon: '💪', color: 'bg-green-100 text-green-700' },
  other:     { label: 'อื่นๆ',      icon: '📦', color: 'bg-gray-100 text-gray-700' },
}

function SubscriptionsTab() {
  const subs = useLiveQuery(() => db.subscriptions.orderBy('nextRenewalDate').toArray())
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Subscription | null>(null)

  const active = (subs ?? []).filter(s => s.active)
  // Normalize to monthly equivalent
  function monthlyEq(s: Subscription) {
    return s.frequency === 'monthly' ? s.amount
      : s.frequency === 'quarterly' ? s.amount / 3
      : s.amount / 12
  }
  function annualEq(s: Subscription) {
    return s.frequency === 'monthly' ? s.amount * 12
      : s.frequency === 'quarterly' ? s.amount * 4
      : s.amount
  }
  const totalMonthly = active.reduce((s, x) => s + monthlyEq(x), 0)
  const totalAnnual = active.reduce((s, x) => s + annualEq(x), 0)
  const totalQuiet = (subs ?? []).filter(s => !s.active).length

  const today = new Date()
  function daysUntil(dateStr: string) {
    const d = new Date(dateStr)
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 3600 * 24))
  }

  // Group by category for breakdown
  const byCat = active.reduce((acc, s) => {
    const m = monthlyEq(s)
    acc[s.category] = (acc[s.category] || 0) + m
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="flex gap-2 mb-3">
        <Card className="!p-3 flex-1 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รวม/เดือน</div>
          <div className="text-[16px] font-bold text-gray-900">{formatCurrency(totalMonthly, 0)}</div>
        </Card>
        <Card className="!p-3 flex-1 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">รวม/ปี</div>
          <div className="text-[16px] font-bold text-purple-600">{formatCurrency(totalAnnual, 0)}</div>
        </Card>
        <Card className="!p-3 flex-1 text-center">
          <div className="text-[11px] text-gray-400 font-semibold">ใช้งาน</div>
          <div className="text-[16px] font-bold text-gray-900">{active.length}{totalQuiet > 0 && <span className="text-[11px] text-gray-400"> +{totalQuiet}</span>}</div>
        </Card>
      </div>

      {Object.keys(byCat).length > 0 && (
        <Card className="mb-3">
          <SectionLabel>หมวดหมู่ (ค่าเฉลี่ย/เดือน)</SectionLabel>
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
            const meta = SUB_CATEGORIES[cat] ?? SUB_CATEGORIES.other
            return (
              <div key={cat} className="flex items-center justify-between py-1.5 text-[13px]">
                <span className="text-gray-700">{meta.icon} {meta.label}</span>
                <span className="font-semibold text-gray-900">{formatCurrency(amt, 0)}</span>
              </div>
            )
          })}
        </Card>
      )}

      <button
        onClick={() => { setEditItem(null); setShowForm(true) }}
        className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl active:scale-95 w-full mb-3"
      >
        ＋ เพิ่ม Subscription
      </button>

      {(subs ?? []).length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-[14px]">
          <div className="text-4xl mb-3">📱</div>
          <div className="font-medium text-gray-500 mb-1">ยังไม่มี Subscription</div>
          <div className="text-[13px]">กดปุ่ม ＋ เพื่อเพิ่มรายการ</div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {(subs ?? []).map((s, idx, arr) => {
            const meta = SUB_CATEGORIES[s.category] ?? SUB_CATEGORIES.other
            const days = daysUntil(s.nextRenewalDate)
            const dayLabel = days < 0 ? `เลย ${-days} วัน` : days === 0 ? 'วันนี้!' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
            const urgent = days <= 3 && days >= 0 && s.active
            const overdue = days < 0 && s.active
            return (
              <button key={s.id}
                onClick={() => { setEditItem(s); setShowForm(true) }}
                className={`w-full px-4 py-3 text-left active:bg-gray-50 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''} ${!s.active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg flex-shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-[14px] truncate">{s.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {s.frequency === 'monthly' ? 'รายเดือน' : s.frequency === 'quarterly' ? 'ราย 3 เดือน' : 'รายปี'}
                        {s.paymentMethod && ` · ${s.paymentMethod}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-[14px] font-bold text-gray-900">{formatCurrency(s.amount, 0)}</div>
                    <div className={`text-[10px] font-semibold ${overdue ? 'text-red-500' : urgent ? 'text-amber-600' : 'text-gray-400'}`}>
                      {s.active ? dayLabel : 'ยกเลิก'}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showForm && <SubscriptionForm editItem={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

function SubscriptionForm({ editItem, onClose }: { editItem: Subscription | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editItem?.name ?? '',
    amount: editItem?.amount?.toString() ?? '',
    frequency: editItem?.frequency ?? 'monthly' as Subscription['frequency'],
    nextRenewalDate: editItem?.nextRenewalDate ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    category: editItem?.category ?? 'streaming' as Subscription['category'],
    paymentMethod: editItem?.paymentMethod ?? '',
    active: editItem?.active ?? true,
    notes: editItem?.notes ?? '',
  })

  async function save() {
    const data: Omit<Subscription, 'id'> = {
      name: form.name.trim(),
      amount: parseFloat(form.amount) || 0,
      frequency: form.frequency,
      nextRenewalDate: form.nextRenewalDate,
      category: form.category,
      paymentMethod: form.paymentMethod || undefined,
      active: form.active,
      notes: form.notes || undefined,
    }
    if (!data.name || data.amount <= 0) return
    if (editItem?.id) await db.subscriptions.update(editItem.id, data)
    else await db.subscriptions.add(data)
    onClose()
  }
  async function remove() {
    if (editItem?.id && confirm('ลบ Subscription นี้?\nไม่สามารถกู้คืนได้')) {
      await db.subscriptions.delete(editItem.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'เพิ่ม'} Subscription</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ชื่อ</div>
          <input placeholder="Netflix, iCloud, Spotify..." value={form.name}
            onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">ค่าบริการ</div>
            <input type="number" placeholder="299" value={form.amount}
              onChange={e => setForm(v => ({ ...v, amount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">รอบจ่าย</div>
            <select value={form.frequency}
              onChange={e => setForm(v => ({ ...v, frequency: e.target.value as Subscription['frequency'] }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full bg-white">
              <option value="monthly">รายเดือน</option>
              <option value="quarterly">ราย 3 เดือน</option>
              <option value="yearly">รายปี</option>
            </select>
          </div>
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ต่ออายุครั้งถัดไป</div>
          <input type="date" value={form.nextRenewalDate}
            onChange={e => setForm(v => ({ ...v, nextRenewalDate: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">หมวดหมู่</div>
          <select value={form.category}
            onChange={e => setForm(v => ({ ...v, category: e.target.value as Subscription['category'] }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full bg-white">
            {Object.entries(SUB_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">วิธีจ่าย (ไม่บังคับ)</div>
          <input placeholder="KTC, KBANK, ตัดบัญชี..." value={form.paymentMethod}
            onChange={e => setForm(v => ({ ...v, paymentMethod: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
        </div>

        <label className="flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={form.active} onChange={e => setForm(v => ({ ...v, active: e.target.checked }))} />
          ยังใช้งานอยู่
        </label>

        <div className="flex gap-2 mt-2">
          {editItem && (
            <button onClick={remove} className="bg-red-50 text-red-600 font-semibold px-4 py-3 rounded-xl text-sm">ลบ</button>
          )}
          <button onClick={save}
            className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl active:scale-95 text-sm">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}


function FinanceForm({ editRecord, onClose }: { editRecord: FinanceRecord | null; onClose: () => void }) {
  const [form, setForm] = useState({
    date: editRecord?.date ?? new Date().toISOString().slice(0, 10),
    type: (editRecord?.type ?? 'expense') as 'income' | 'expense',
    amount: editRecord?.amount?.toString() ?? '',
    category: editRecord?.category ?? 'อาหาร',
    description: editRecord?.description ?? '',
    source: editRecord?.source ?? 'manual',
  })

  async function save() {
    if (!form.amount) return
    const data = {
      date: form.date, type: form.type,
      amount: parseFloat(form.amount),
      category: form.category,
      description: form.description,
      source: form.source as FinanceRecord['source'],
    }
    if (editRecord?.id) await db.financeRecords.update(editRecord.id, data)
    else await db.financeRecords.add(data)
    onClose()
  }

  const cats = form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editRecord ? 'แก้ไข' : 'เพิ่ม'}รายการ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="flex gap-2">
          {(['expense', 'income'] as const).map(t => (
            <button key={t} onClick={() => setForm(v => ({ ...v, type: t, category: t === 'income' ? 'เงินเดือน' : 'อาหาร' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${form.type === t ? (t === 'income' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600') : 'border-gray-100 text-gray-400'}`}>
              {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
            </button>
          ))}
        </div>
        <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <input type="number" placeholder="จำนวนเงิน (บาท)" value={form.amount}
          onChange={e => setForm(v => ({ ...v, amount: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {cats.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        <input placeholder="รายละเอียด (ไม่บังคับ)" value={form.description}
          onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <Button onClick={save}>
          {editRecord ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}

// ── Budget Tab ────────────────────────────────────────────────────────────────
function BudgetTab({ month }: { month: string }) {
  const [config, setConfig] = useState<BudgetConfig>(loadBudget)
  const [showEdit, setShowEdit] = useState(false)

  const year = parseInt(month.slice(0, 4))
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`

  const salaryRecords = useLiveQuery(() => db.salaryRecords.orderBy('year').toArray())
  const taxRecords = useLiveQuery(() => db.taxRecords.orderBy('year').toArray())
  const monthRecords = useLiveQuery(
    () => db.financeRecords.where('date').between(monthStart, monthEnd, true, true).filter(r => r.type === 'expense').toArray(),
    [monthStart, monthEnd]
  )

  const salary = salaryRecords?.find(s => s.year === year)
  const baseSalary = salary?.baseSalary ?? 0
  const pvd = salary ? Math.round(baseSalary * (salary.pvdEmployeeRate / 100)) : 0
  const SS = 750
  const taxRec = taxRecords?.find(t => t.year === year + 543)
  const withholdingMonthly = taxRec ? Math.round((taxRec.withholdingTax ?? 0) / 12) : 0
  const netTakeHome = baseSalary - SS - pvd - withholdingMonthly

  const condoMonthly = config.condoFee
  const insuranceMonthly = config.insurance
  const subTotal = config.subscription

  const actual = (monthRecords ?? []).reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount; return acc
  }, {} as Record<string, number>)

  const aFood     = actual['อาหาร']     ?? 0
  const aShopping = actual['ช้อปปิ้ง'] ?? 0
  const aFamily   = actual['ครอบครัว'] ?? 0
  const aOther    = actual['อื่นๆ']    ?? 0

  const totalFixed   = config.internet + config.utilities + condoMonthly + insuranceMonthly + subTotal
  const budgetTotal  = totalFixed + config.familyBudget + config.foodBudget + config.shoppingBudget + config.otherBudget
  const actualTotal  = totalFixed + aFamily + aFood + aShopping + aOther
  const budgetRemain = netTakeHome - budgetTotal
  const actualRemain = netTakeHome - actualTotal
  const isOver = actualRemain < budgetRemain

  function updateConfig(updates: Partial<BudgetConfig>) {
    const next = { ...config, ...updates }
    setConfig(next)
    saveBudget(next)
  }

  return (
    <div className="px-4 py-4 pb-8 space-y-3">
      {/* Hero banner */}
      <div className={`rounded-2xl p-4 text-white ${isOver ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
        <div className="text-[11px] opacity-75 mb-0.5">เงินที่ควรเหลือ / เหลือจริง</div>
        <div className="text-3xl font-bold">{formatCurrency(budgetRemain, 0)}</div>
        <div className="text-[11px] opacity-75 mt-0.5">จากเงินเดือน {formatCurrency(baseSalary, 0)}</div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-white/20 rounded-xl p-2.5 text-center">
            <div className="text-[10px] opacity-80">ตามเป้า</div>
            <div className="text-[15px] font-bold">{formatCurrency(budgetRemain, 0)}</div>
          </div>
          <div className="bg-white/20 rounded-xl p-2.5 text-center">
            <div className="text-[10px] opacity-80">จริงเดือนนี้</div>
            <div className={`text-[15px] font-bold ${isOver ? 'text-red-200' : 'text-green-200'}`}>
              {formatCurrency(actualRemain, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Auto deductions */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <CardTitle>หักจากเงินเดือน (อัตโนมัติ)</CardTitle>
          {!salary && <span className="text-[10px] text-amber-600">⚠️ ยังไม่มีข้อมูลเงินเดือน — ไปเพิ่มที่หน้าเงินเดือน</span>}
        </div>
        <BudRow label="เงินเดือน" amount={baseSalary} income />
        <BudRow label="ประกันสังคม" amount={SS} />
        <BudRow label="หัก PVD" amount={pvd} note={salary ? `${salary.pvdEmployeeRate}%` : undefined} />
        <BudRow label="หักภาษี ณ ที่จ่าย" amount={withholdingMonthly} note="/12" />
        <div className="border-t pt-2 mt-1.5 flex justify-between text-[13px] font-bold">
          <span className="text-gray-700">รับสุทธิ</span>
          <span className="text-emerald-600">{formatCurrency(netTakeHome, 0)}</span>
        </div>
      </Card>

      {/* Fixed costs */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <CardTitle>ค่าใช้จ่ายคงที่</CardTitle>
          <button onClick={() => setShowEdit(true)} className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-lg">แก้ไข ✏️</button>
        </div>
        <BudRow label="ค่าเน็ต" amount={config.internet} />
        <BudRow label="ค่าน้ำ / ค่าไฟ" amount={config.utilities} />
        <BudRow label="ค่าส่วนกลาง" amount={condoMonthly} />
        <BudRow label="ค่าประกัน" amount={insuranceMonthly} />
        <BudRow label="📱 Subscription" amount={subTotal} />
        <div className="border-t pt-2 mt-1.5 flex justify-between text-[13px] font-bold">
          <span className="text-gray-700">รวมคงที่</span>
          <span className="text-gray-900">−{formatCurrency(totalFixed, 0)}</span>
        </div>
      </Card>

      {/* Variable budget vs actual */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <CardTitle>ค่าใช้จ่ายแปรผัน</CardTitle>
          <button onClick={() => setShowEdit(true)} className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-lg">ตั้งเป้า ✏️</button>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">เป้าหมาย vs จริงเดือนนี้</div>
        <BudVsActual label="🍜 อาหาร"      budget={config.foodBudget}     actual={aFood} />
        <BudVsActual label="🛍️ ช้อปปิ้ง"  budget={config.shoppingBudget} actual={aShopping} />
        <BudVsActual label="👨‍👩‍👧 ครอบครัว" budget={config.familyBudget}   actual={aFamily} />
        <BudVsActual label="📦 อื่นๆ"      budget={config.otherBudget}    actual={aOther} />
      </Card>

      {/* Summary */}
      <Card>
        <CardTitle>สรุป</CardTitle>
        <div className="mt-2 space-y-1.5 text-[13px]">
          <div className="flex justify-between"><span className="text-gray-500">รับสุทธิ</span><span className="font-semibold text-emerald-600">{formatCurrency(netTakeHome, 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">รายจ่ายตามเป้า</span><span className="font-semibold text-gray-700">−{formatCurrency(budgetTotal, 0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">รายจ่ายจริง</span><span className="font-semibold text-red-500">−{formatCurrency(actualTotal, 0)}</span></div>
          <div className="border-t pt-2 mt-1 space-y-1">
            <div className="flex justify-between font-bold text-[14px]">
              <span className="text-gray-700">เป้าที่ควรเหลือ</span>
              <span className={budgetRemain >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatCurrency(budgetRemain, 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-[14px]">
              <span className="text-gray-700">เหลือจริง</span>
              <span className={actualRemain >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatCurrency(actualRemain, 0)}</span>
            </div>
          </div>
          {isOver ? (
            <div className="bg-red-50 rounded-xl px-3 py-2 text-[12px] text-red-600 font-semibold mt-1">
              ⚠️ ใช้เกินเป้าไป {formatCurrency(budgetRemain - actualRemain, 0)}
            </div>
          ) : (
            <div className="bg-green-50 rounded-xl px-3 py-2 text-[12px] text-green-700 font-semibold mt-1">
              ✅ อยู่ในเป้า เหลือดีกว่าแผน {formatCurrency(actualRemain - budgetRemain, 0)}
            </div>
          )}
        </div>
      </Card>

      {showEdit && <BudgetConfigSheet config={config} onSave={updateConfig} onClose={() => setShowEdit(false)} />}
    </div>
  )
}

function BudRow({ label, amount, income, note }: { label: string; amount: number; income?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <div>
        <span className="text-[13px] text-gray-700">{label}</span>
        {note && <span className="text-[10px] text-gray-400 ml-1.5">{note}</span>}
      </div>
      <span className={`text-[13px] font-semibold ${income ? 'text-emerald-600' : 'text-gray-700'}`}>
        {income ? '' : '−'}{formatCurrency(amount, 0)}
      </span>
    </div>
  )
}

function BudVsActual({ label, budget, actual }: { label: string; budget: number; actual: number }) {
  const diff = actual - budget
  const over = budget > 0 && diff > 0
  const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] text-gray-700">{label}</span>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-gray-400">เป้า {budget > 0 ? formatCurrency(budget, 0) : '—'}</span>
          <span className="font-semibold text-gray-800">จริง {formatCurrency(actual, 0)}</span>
        </div>
      </div>
      {budget > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-[11px] font-semibold w-24 text-right ${over ? 'text-red-500' : 'text-emerald-600'}`}>
            {over ? `เกิน +${formatCurrency(diff, 0)}` : `เหลือ ${formatCurrency(-diff, 0)}`}
          </span>
        </div>
      )}
    </div>
  )
}

function BudgetConfigSheet({ config, onSave, onClose }: {
  config: BudgetConfig
  onSave: (updates: Partial<BudgetConfig>) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState({ ...config })

  function f(key: keyof BudgetConfig) {
    return (
      <input
        type="number" placeholder="0"
        value={local[key] || ''}
        onChange={e => setLocal(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full mt-0.5"
      />
    )
  }

  function labeledField(key: keyof BudgetConfig, label: string, note?: string) {
    return (
      <div className="mb-3" key={key}>
        <div className="flex justify-between">
          <span className="text-[12px] font-semibold text-gray-600">{label}</span>
          {note && <span className="text-[10px] text-gray-400">{note}</span>}
        </div>
        {f(key)}
      </div>
    )
  }

  function save() { onSave(local); onClose() }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">ตั้งค่างบประมาณ</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">ค่าใช้จ่ายคงที่ / เดือน</div>
        {labeledField('internet', 'ค่าเน็ต')}
        {labeledField('utilities', 'ค่าน้ำ + ค่าไฟ (รวม)')}
        {labeledField('condoFee', 'ค่าส่วนกลางคอนโด')}
        {labeledField('insurance', 'ค่าประกัน (รวมทุกกรมธรรม์)')}
        {labeledField('subscription', '📱 Subscription')}

        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3 mt-5">เป้าหมายรายจ่ายแปรผัน / เดือน</div>
        {labeledField('foodBudget', '🍜 อาหาร')}
        {labeledField('shoppingBudget', '🛍️ ช้อปปิ้ง')}
        {labeledField('familyBudget', '👨‍👩‍👧 ครอบครัว')}
        {labeledField('otherBudget', '📦 อื่นๆ')}

        <Button onClick={save}>
          บันทึก
        </Button>
      </div>
    </div>
  )
}
