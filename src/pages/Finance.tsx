import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, CardTitle, SectionLabel, ProgressBar, Toast } from '../components/Card'
import { formatCurrency } from '../utils/calculations'
import type { FinanceRecord, Installment } from '../db/types'
import { listBillFiles } from '../api/google'
import type { BillFile } from '../api/google'
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
}

type Tab = 'overview' | 'records' | 'yearly' | 'installments' | 'emergency'

export default function Finance() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<FinanceRecord | null>(null)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const records = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().toArray())
  const emergency = useLiveQuery(() => db.emergencyFund.toArray().then(r => r[0]))
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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {([['overview', 'ภาพรวม'], ['records', 'รายการ'], ['yearly', 'รายปี'], ['installments', 'ผ่อนชำระ'], ['emergency', 'ฉุกเฉิน']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab
            income={income} expense={expense} net={net}
            expenseByCategory={expenseByCategory}
            monthRecords={monthRecords}
            month={month}
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
        {tab === 'emergency' && <EmergencyFundTab emergency={emergency} monthlyExpense={expense} />}
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

function detectCat(description: string): string {
  const d = description.toUpperCase()
  if (/GRAB/.test(d)) return 'อาหาร'
  if (/MRT|BTS|BEM|TAXI|BOLT|TRANSPORT/.test(d)) return 'เดินทาง'
  if (/HOSPITAL|CLINIC|PHARMACY|MEDICAL|SIRIRAJ|BANGPO|SAMITIVEJ|RAJDHEV/.test(d)) return 'สุขภาพ'
  if (/APPLE|NETFLIX|SPOTIFY|ANTHROPIC|GOOGLE|YOUTUBE|WINDSURF|LUMEN|COWAY|2C2P.*SUBSCRIPTION/.test(d)) return 'Subscription'
  if (/SHOPEE|LAZADA|CENTRAL|LOTUS|TOPS|UNIQLO|AMAZON/.test(d)) return 'ช้อปปิ้ง'
  if (/FOOD|MEKIKI|SUKISHI|AFTER YOU|CAFE|COFFEE|KFC|PIZZA|BQ|PZD/.test(d)) return 'อาหาร'
  if (/INSURANCE|ASSURANCE/.test(d)) return 'ประกัน'
  return 'ช้อปปิ้ง'
}

function OverviewTab({ income, expense, net, expenseByCategory, monthRecords, month }: {
  income: number; expense: number; net: number; expenseByCategory: Record<string, number>; monthRecords: FinanceRecord[]; month: string
}) {
  const tokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))
  const [bills, setBills] = useState<BillFile[]>([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [billsError, setBillsError] = useState<string | null>(null)
  const [billsSynced, setBillsSynced] = useState(false)
  const [emailsLoading, setEmailsLoading] = useState(false)

  // PDF import state
  const [importState, setImportState] = useState<ImportState | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Manual PDF upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualBank, setManualBank] = useState('KTC')
  const [manualParsing, setManualParsing] = useState(false)

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
      setToast({ text: `โหลดสำเร็จ ${result.length} ไฟล์`, type: 'success' })
    } catch (e: any) {
      const msg = e.message ?? 'ไม่สามารถโหลดไฟล์จาก Drive ได้'
      setBillsError(msg)
      setToast({ text: msg, type: 'error' })
    } finally {
      setBillsLoading(false)
    }
  }

  async function syncEmails() {
    if (!tokens?.accessToken) return
    setEmailsLoading(true)
    try {
      const { fetchGmailBankMessages, parseBankEmail } = await import('../api/google')
      const messages = await fetchGmailBankMessages(tokens.accessToken)
      let added = 0, skipped = 0, noAmount = 0
      for (const msg of messages) {
        const txn = parseBankEmail(msg)
        if (!txn.rawRef || txn.amount <= 0) { noAmount++; continue }
        const exists = await db.financeRecords.where('rawRef').equals(txn.rawRef).count()
        if (exists > 0) { skipped++; continue }
        await db.financeRecords.add({
          date: txn.date,
          amount: txn.amount,
          type: txn.type as 'income' | 'expense',
          category: txn.type === 'income' ? 'โอนเข้า' : 'โอนออก',
          description: txn.description,
          source: txn.source as any,
          rawRef: txn.rawRef,
        })
        added++
      }
      const detail = `(พบ ${messages.length} อีเมล${noAmount > 0 ? ` · อ่านยอดไม่ได้ ${noAmount}` : ''}${skipped > 0 ? ` · ซ้ำ ${skipped}` : ''})`
      setToast({
        text: added > 0
          ? `เพิ่ม ${added} รายการ ${detail}`
          : messages.length === 0
            ? 'ไม่พบอีเมลธนาคารใน 48 ชม. ที่ผ่านมา'
            : `ไม่มีรายการใหม่ ${detail}`,
        type: added > 0 ? 'success' : 'error',
      })
    } catch (e: any) {
      setToast({ text: e.message ?? 'ไม่สามารถอ่าน Gmail ได้', type: 'error' })
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
      setToast({ text: e.message ?? 'ไม่สามารถอ่าน PDF ได้', type: 'error' })
    } finally {
      setImporting(null)
    }
  }

  async function importPdfFile(file: File) {
    setManualParsing(true)
    try {
      const { parseBillPdf } = await import('../api/pdfParser')
      const buffer = await file.arrayBuffer()
      const txns = await parseBillPdf(buffer, manualBank)
      const txnsWithCat = txns.map(t => ({ ...t, category: detectCat(t.description) }))
      const fileId = `manual_${manualBank}_${file.name}`
      setImportState({
        file: { id: fileId, name: file.name, bankName: manualBank },
        txns: txnsWithCat,
        selected: new Array(txnsWithCat.length).fill(true),
      })
    } catch (e: any) {
      setToast({ text: e.message ?? 'ไม่สามารถอ่าน PDF ได้', type: 'error' })
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
    try {
      // dedupe globally by date|amount|description across all credit_card records
      const allCCRecords = await db.financeRecords.where('source').equals('credit_card').toArray()
      const existingKeys = new Set(allCCRecords.map(r => `${r.date}|${r.amount}|${r.description}`))

      let added = 0
      let skipped = 0
      // atomic: either all succeed or all rollback
      await db.transaction('rw', db.financeRecords, async () => {
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
            rawRef: importState.file.id,
            cardName: importState.file.bankName,
          })
          existingKeys.add(key)
          added++
        }
      })
      // Auto-create/update installments from transactions with installmentInfo
      let instAdded = 0, instUpdated = 0
      const instTxns = toSave.filter(t => t.installmentInfo && Math.abs(t.amount) > 0)
      for (const txn of instTxns) {
        const { current, total } = txn.installmentInfo!
        // Clean name: remove "03/06" prefix/suffix and interest notation like INT00.74%
        const cleanName = txn.description
          .replace(/^\d{2,3}\/\d{2,3}\s+/, '')
          .replace(/\s*:?\s*\d{2,3}\/\d{2,3}\s*$/, '')
          .replace(/\s+INT\d+\.?\d*%/i, '')
          .trim() || txn.description

        const allInst = await db.installments.toArray()
        const existing = allInst.find(i =>
          i.totalInstallments === total &&
          (i.name.slice(0, 12) === cleanName.slice(0, 12) || cleanName.slice(0, 12) === i.name.slice(0, 12))
        )

        if (!existing) {
          await db.installments.add({
            name: cleanName,
            totalAmount: Math.abs(txn.amount) * total,
            monthlyAmount: Math.abs(txn.amount),
            totalInstallments: total,
            paidInstallments: current,
            startDate: txn.transDate || fallbackDate,
            category: txn.category || 'ช้อปปิ้ง',
            source: 'credit_card',
            cardName: importState.file.bankName,
          })
          instAdded++
        } else if (existing.paidInstallments < current) {
          await db.installments.update(existing.id!, { paidInstallments: current })
          instUpdated++
        }
      }

      setImportState(null)
      const instNote = instAdded > 0 ? ` · เพิ่มผ่อน ${instAdded} รายการ` : instUpdated > 0 ? ` · อัปเดตผ่อน ${instUpdated}` : ''
      setToast({
        text: added > 0
          ? `บันทึก ${added} รายการ${skipped > 0 ? ` (ข้าม ${skipped} ซ้ำ)` : ''}${instNote}`
          : `ทั้งหมดเป็นรายการซ้ำ (${skipped})${instNote}`,
        type: added > 0 || instAdded > 0 ? 'success' : 'error',
      })
    } catch (e: any) {
      console.error('saveImport error:', e)
      setToast({ text: `บันทึกไม่สำเร็จ: ${e?.message ?? e}`, type: 'error' })
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

      {Object.keys(expenseByCategory).length > 0 && (
        <>
          <SectionLabel>หมวดรายจ่าย</SectionLabel>
          <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
            {Object.entries(expenseByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt], idx, arr) => (
                <div key={cat} className={`px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-medium text-gray-700">{CAT_ICONS[cat] ?? '📦'} {cat}</span>
                    <span className="text-[14px] font-bold text-gray-900">{formatCurrency(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={expense} color="bg-red-400" />
                </div>
              ))}
          </div>
        </>
      )}

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
              {emailsLoading ? '⏳ กำลังโหลด...' : '📧 Sync ธนาคาร'}
            </button>
          )}
        </Card>
      </div>

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
              {billsLoading ? '⏳ กำลังโหลด...' : '🔄 Sync บิลบัตรเครดิต'}
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
          <div className="text-[13px] font-semibold text-orange-700 mb-1">📲 อัปโหลด PDF จากเครื่อง</div>
          <div className="text-[12px] text-orange-600 mb-2.5">เลือกไฟล์บิลบัตรเครดิตจาก iPhone โดยตรง</div>
          <div className="flex gap-2 mb-2.5">
            <select
              value={manualBank}
              onChange={e => setManualBank(e.target.value)}
              className="flex-1 border border-orange-200 bg-white rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 outline-none"
            >
              <option value="KTC">KTC</option>
              <option value="KBANK">กสิกร (KBANK)</option>
              <option value="KRUNGSRI">กรุงศรี (KRUNGSRI)</option>
              <option value="UOB">ยูโอบี (UOB)</option>
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={manualParsing}
              className="flex-1 bg-orange-500 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-60"
            >
              {manualParsing ? '⏳ กำลังอ่าน...' : '📂 เลือกไฟล์ PDF'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importPdfFile(f) }}
          />
          <div className="text-[11px] text-orange-400">รองรับ KTC · KBANK · กรุงศรี · UOB</div>
        </Card>
      </div>

      {/* PDF Import Modal */}
      {importState && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="text-[16px] font-bold text-gray-900">นำเข้ารายการ</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {importState.file.bankName} · {importState.file.dateStr ? `${importState.file.dateStr.slice(6, 8)}/${importState.file.dateStr.slice(4, 6)}/${importState.file.dateStr.slice(0, 4)}` : importState.file.name}
                </div>
              </div>
              <button onClick={() => setImportState(null)} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center">✕</button>
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
          <div>ยังไม่มีรายการ</div>
        </div>
      ) : records.map(r => (
        <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${r.type === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
              {CAT_ICONS[r.category] ?? (r.type === 'income' ? '💚' : '🔴')}
            </div>
            <div>
              <div className="text-[14px] font-semibold text-gray-900">{r.description || r.category}</div>
              <div className="text-[11px] text-gray-400">{r.date} · {r.category}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[15px] font-bold ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
              {r.type === 'income' ? '+' : '-'}{formatCurrency(r.amount)}
            </div>
            <div className="flex gap-1">
              <button onClick={() => onEdit(r)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
              <button onClick={() => { if (confirm('ลบรายการนี้?')) db.financeRecords.delete(r.id!) }}
                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
            </div>
          </div>
        </div>
      ))}
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

function InstallmentsTab({ installments }: { installments: Installment[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Installment | null>(null)

  const activeInstallments = installments.filter(i => i.paidInstallments < i.totalInstallments)
  const totalMonthly = activeInstallments.reduce((s, i) => s + i.monthlyAmount, 0)

  // Check subscription renewals (next 30 days)
  const upcomingRenewals = installments.filter(inst => {
    if (inst.totalInstallments > 24) return false // long-term not subscription
    const start = new Date(inst.startDate)
    const today = new Date()
    const daysElapsed = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const cycleDays = 30
    const daysUntilRenewal = cycleDays - (daysElapsed % cycleDays)
    return daysUntilRenewal <= 30
  })

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] text-gray-500">ผ่อนต่อเดือนรวม</div>
          <div className="text-2xl font-bold text-red-500">{formatCurrency(totalMonthly)}</div>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95">
          ＋ เพิ่ม
        </button>
      </div>

      {upcomingRenewals.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-3 mb-3">
          <div className="text-[13px] font-semibold text-amber-700 mb-1.5">🔔 ใกล้ต่ออายุ</div>
          {upcomingRenewals.map(i => (
            <div key={i.id} className="text-[12px] text-amber-800">• {i.name} — {formatCurrency(i.monthlyAmount)}</div>
          ))}
        </div>
      )}

      {installments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💳</div>
          <div>ยังไม่มีรายการผ่อน</div>
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
                      {inst.cardName && (() => {
                        const CARD_COLORS: Record<string, string> = {
                          KTC: 'bg-blue-100 text-blue-700', KBANK: 'bg-green-100 text-green-700',
                          KRUNGSRI: 'bg-yellow-100 text-yellow-700', UOB: 'bg-red-100 text-red-700',
                        }
                        return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CARD_COLORS[inst.cardName] ?? 'bg-gray-100 text-gray-600'}`}>💳 {inst.cardName}</span>
                      })()}
                    </div>
                    <div className="text-[12px] text-gray-400">{inst.category} · เริ่ม {inst.startDate.slice(0, 7)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(inst); setShowForm(true) }}
                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] active:scale-95">✏️</button>
                    <button onClick={() => { if (confirm('ลบ?')) db.installments.delete(inst.id!) }}
                      className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[11px] active:scale-95">🗑️</button>
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
                {!isDone && (
                  <button
                    onClick={() => db.installments.update(inst.id!, { paidInstallments: inst.paidInstallments + 1 })}
                    className="mt-2 text-[12px] font-semibold text-indigo-600 active:scale-95"
                  >
                    + บันทึกชำระงวดถัดไป
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && <InstallmentForm editItem={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

function InstallmentForm({ editItem, onClose }: { editItem: Installment | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editItem?.name ?? '',
    totalAmount: editItem?.totalAmount?.toString() ?? '',
    monthlyAmount: editItem?.monthlyAmount?.toString() ?? '',
    totalInstallments: editItem?.totalInstallments?.toString() ?? '',
    paidInstallments: editItem?.paidInstallments?.toString() ?? '0',
    startDate: editItem?.startDate ?? new Date().toISOString().slice(0, 10),
    category: editItem?.category ?? 'ช้อปปิ้ง',
    source: editItem?.source ?? 'credit_card',
  })

  async function save() {
    if (!form.name || !form.monthlyAmount) return
    const data = {
      name: form.name,
      totalAmount: parseFloat(form.totalAmount) || (parseFloat(form.monthlyAmount) * parseInt(form.totalInstallments)),
      monthlyAmount: parseFloat(form.monthlyAmount),
      totalInstallments: parseInt(form.totalInstallments) || 1,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate,
      category: form.category,
      source: form.source,
    }
    if (editItem?.id) await db.installments.update(editItem.id, data)
    else await db.installments.add(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'เพิ่ม'}รายการผ่อน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <input placeholder="ชื่อรายการ (เช่น iPhone 16, Netflix)" value={form.name}
          onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-500 mb-1">ยอดรวม (บาท)</div>
            <input type="number" value={form.totalAmount}
              onChange={e => setForm(v => ({ ...v, totalAmount: e.target.value }))}
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
          <div className="text-[11px] text-gray-500 mb-1">วันที่เริ่ม</div>
          <input type="date" value={form.startDate}
            onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>
        <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full">
          {CATEGORIES_EXPENSE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}

function EmergencyFundTab({ emergency, monthlyExpense }: { emergency: any; monthlyExpense: number }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    targetMonths: emergency?.targetMonths?.toString() ?? '6',
    currentAmount: emergency?.currentAmount?.toString() ?? '',
  })

  const target = (emergency?.targetMonths ?? 6) * monthlyExpense
  const current = emergency?.currentAmount ?? 0
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0

  async function save() {
    const data = { targetMonths: parseInt(form.targetMonths), currentAmount: parseFloat(form.currentAmount), updatedAt: new Date().toISOString() }
    if (emergency?.id) await db.emergencyFund.update(emergency.id, data)
    else await db.emergencyFund.add(data)
    setShowForm(false)
  }

  return (
    <div className="px-4 pt-3">
      <Card>
        <CardTitle>เงินสำรองฉุกเฉิน</CardTitle>
        <div className="flex justify-between items-end mb-3 mt-1">
          <div>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(current)}</div>
            <div className="text-xs text-gray-400 mt-0.5">เป้าหมาย {emergency?.targetMonths ?? 6} เดือน = {formatCurrency(target)}</div>
          </div>
          <div className="text-2xl font-bold text-indigo-600">{pct.toFixed(0)}%</div>
        </div>
        <ProgressBar value={pct} max={100} color={pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'} />
        <div className="text-xs text-gray-400 mt-1.5">
          {pct >= 100 ? '✅ ครบแล้ว' : `ยังขาด ${formatCurrency(target - current)}`}
        </div>
        <button onClick={() => setShowForm(v => !v)} className="mt-3 text-indigo-600 text-sm font-semibold">
          แก้ไขข้อมูล
        </button>
        {showForm && (
          <div className="mt-3 flex flex-col gap-2">
            <input type="number" placeholder="เป้าหมาย (เดือน)" value={form.targetMonths}
              onChange={e => setForm(v => ({ ...v, targetMonths: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            <input type="number" placeholder="มีอยู่ตอนนี้ (บาท)" value={form.currentAmount}
              onChange={e => setForm(v => ({ ...v, currentAmount: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
            <button onClick={save} className="bg-indigo-600 text-white font-bold py-2.5 rounded-xl text-sm active:scale-95">
              บันทึก
            </button>
          </div>
        )}
      </Card>
      <div className="h-4" />
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
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          {editRecord ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
