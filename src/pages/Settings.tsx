import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, pruneSyncLog, getStorageStats } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, SectionLabel } from '../components/Card'
import { signInWithGoogle, fetchCalendarEvents, fetchGmailBankMessages, parseBankEmail, parseDividendEvents, findDriveBackupFile, uploadBackupToDrive, downloadDriveBackup, calcSinceDate } from '../api/google'
import { getWhoopAuthUrl, loadWhoopTokens, clearWhoopTokens, debugWhoopRaw, getValidTokens, saveWhoopTokens } from '../api/whoop'
import { syncWhoopAndSave } from '../api/whoopSync'

const CLEAR_SECTIONS = [
  { key: 'home',       label: '🏠 หน้าหลัก',  tables: ['profile', 'netWorthSnapshots'] },
  { key: 'investment', label: '📈 ลงทุน',     tables: ['investments', 'dividends'] },
  { key: 'health',     label: '💪 สุขภาพ',    tables: ['healthRecords', 'healthDaily', 'medications', 'medicationLogs'] },
  { key: 'finance',    label: '💰 การเงิน',   tables: ['financeRecords', 'installments', 'subscriptions', 'salaryRecords', 'condoMortgage', 'taxRecords'] },
  { key: 'retirement', label: '🌅 เกษียณ',    tables: ['retirementPlan', 'emergencyFund'] },
  { key: 'coach',      label: '🤖 AI Coach',  tables: ['chatMessages'] },
] as const

export default function Settings() {
  const navigate = useNavigate()
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const settings = useLiveQuery(() => db.settings.toArray().then(r => r[0]))
  const googleTokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))

  const [profileForm, setProfileForm] = useState({ nickname: '', fullName: '', dob: '', gender: 'male' as 'male' | 'female', heightCm: '' })
  const [geminiKey, setGeminiKey] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const [driveBackup, setDriveBackup] = useState<{ id: string; modifiedTime: string } | null>(null)
  const [syncMonths, setSyncMonths] = useState(1)
  const [whoopConnected, setWhoopConnected] = useState(false)
  const [whoopSyncing, setWhoopSyncing] = useState(false)
  const [whoopResult, setWhoopResult] = useState<{ text: string; ok: boolean } | null>(null)
  const [whoopDebug, setWhoopDebug] = useState<string>('')
  const [storageStats, setStorageStats] = useState<Awaited<ReturnType<typeof getStorageStats>> | null>(null)
  const [clearSelected, setClearSelected] = useState<Set<string>>(new Set())
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function loadStats() {
    const s = await getStorageStats()
    setStorageStats(s)
  }

  // Reactive counts per section (keyed by section.key)
  const sectionCounts = useLiveQuery(async () => {
    const counts: Record<string, number> = {}
    for (const sec of CLEAR_SECTIONS) {
      let total = 0
      for (const t of sec.tables) {
        total += await (db as any)[t].count()
      }
      counts[sec.key] = total
    }
    return counts
  }, [])

  const allSelected = clearSelected.size === CLEAR_SECTIONS.length
  const totalSelectedCount = CLEAR_SECTIONS
    .filter(s => clearSelected.has(s.key))
    .reduce((sum, s) => sum + (sectionCounts?.[s.key] ?? 0), 0)

  function toggleClearSection(key: string) {
    setClearSelected(s => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  function toggleClearAll() {
    setClearSelected(allSelected ? new Set() : new Set(CLEAR_SECTIONS.map(s => s.key)))
  }

  async function doClearData() {
    setClearing(true)
    try {
      for (const sec of CLEAR_SECTIONS) {
        if (!clearSelected.has(sec.key)) continue
        for (const t of sec.tables) {
          await (db as any)[t].clear()
        }
      }
      const count = totalSelectedCount
      setClearSelected(new Set())
      setShowClearConfirm(false)
      setSyncStatus(`✓ ล้างข้อมูล ${count} รายการแล้ว`)
      setTimeout(() => setSyncStatus(''), 3000)
      loadStats()
    } finally {
      setClearing(false)
    }
  }

  useEffect(() => {
    if (profile) setProfileForm({ nickname: profile.nickname, fullName: profile.fullName, dob: profile.dob, gender: profile.gender, heightCm: profile.heightCm.toString() })
    if (settings?.geminiApiKey) setGeminiKey(settings.geminiApiKey)
    if (settings?.googleClientId) setGoogleClientId(settings.googleClientId)
    setWhoopConnected(!!loadWhoopTokens())
  }, [profile, settings])

  async function saveProfile() {
    const data = { nickname: profileForm.nickname, fullName: profileForm.fullName, dob: profileForm.dob, gender: profileForm.gender, heightCm: parseFloat(profileForm.heightCm) || 170 }
    if (profile?.id) await db.profile.update(profile.id, data)
    else await db.profile.add(data)
    setSyncStatus('บันทึกข้อมูลแล้ว ✓')
    setTimeout(() => setSyncStatus(''), 2000)
  }

  async function saveApiKeys() {
    const sid = settings?.id
    const data = { geminiApiKey: geminiKey, googleClientId, defaultCurrency: 'THB' as const, onboardingDone: true }
    if (sid) await db.settings.update(sid, data)
    else await db.settings.add(data)
    setSyncStatus('บันทึก API Keys แล้ว ✓')
    setTimeout(() => setSyncStatus(''), 2000)
  }

  async function connectGoogle() {
    if (!googleClientId) { setSyncStatus('กรุณากรอก Google Client ID ก่อน'); return }
    try {
      setSyncStatus('กำลังเชื่อมต่อ Google...')
      const { accessToken, email } = await signInWithGoogle(googleClientId)
      const existing = await db.googleTokens.toArray().then(r => r[0])
      const tokenData = { accessToken, expiresAt: Date.now() + 3600 * 1000, scope: 'calendar gmail drive', userEmail: email }
      if (existing?.id) await db.googleTokens.update(existing.id, tokenData)
      else await db.googleTokens.add(tokenData)
      setSyncStatus(`✓ เชื่อมต่อ Google แล้ว (${email})`)
      // Check for Drive backup (for new device restore)
      try {
        const backup = await findDriveBackupFile(accessToken)
        if (backup) setDriveBackup(backup)
      } catch { /* ignore */ }
    } catch (e: any) {
      setSyncStatus(`❌ ${e.message}`)
    }
  }

  async function syncGoogleData() {
    if (!googleTokens?.accessToken) { setSyncStatus('กรุณาเชื่อมต่อ Google ก่อน'); return }
    const sinceDate = calcSinceDate(syncMonths)
    setSyncStatus(`กำลัง sync ย้อนหลัง ${syncMonths} เดือน (ตั้งแต่ ${sinceDate.replace(/\//g, '/')})...`)
    try {
      // Sync calendar
      const events = await fetchCalendarEvents(googleTokens.accessToken)
      const dividendEvents = parseDividendEvents(events)
      await db.syncLog.add({ source: 'calendar', lastSyncAt: new Date().toISOString(), status: 'success', notes: `${events.length} events, ${dividendEvents.length} dividend` })

      // Sync Gmail bank with selected date range + duplicate check
      const emails = await fetchGmailBankMessages(googleTokens.accessToken, sinceDate)
      let added = 0, skipped = 0
      for (const email of emails) {
        const parsed = parseBankEmail(email)
        if (parsed.amount <= 0) continue
        if (parsed.rawRef) {
          const exists = await db.financeRecords.where('rawRef').equals(parsed.rawRef).count()
          if (exists > 0) { skipped++; continue }
        }
        await db.financeRecords.add({ ...parsed, type: parsed.type as 'income' | 'expense', category: parsed.type === 'income' ? 'โอนเข้า' : 'โอนออก', source: parsed.source as any })
        added++
      }
      await db.syncLog.add({ source: 'gmail', lastSyncAt: new Date().toISOString(), status: 'success', notes: `+${added} records, ${skipped} skipped` })
      pruneSyncLog()
      setSyncStatus(`✓ Sync เสร็จ: ${events.length} นัดหมาย, +${added} รายการธนาคาร${skipped > 0 ? ` (ข้าม ${skipped} ซ้ำ)` : ''}`)
    } catch (e: any) {
      setSyncStatus(`❌ Sync ล้มเหลว: ${e.message}`)
    }
  }

  const connectWhoop = useCallback(() => {
    window.location.href = getWhoopAuthUrl()
  }, [])

  const disconnectWhoop = useCallback(() => {
    clearWhoopTokens()
    setWhoopConnected(false)
    setSyncStatus('ยกเลิกการเชื่อมต่อ WHOOP แล้ว')
  }, [])

  const runWhoopDebug = useCallback(async () => {
    const tokens = loadWhoopTokens()
    if (!tokens) { setWhoopDebug('❌ ยังไม่ได้เชื่อมต่อ WHOOP'); return }
    setWhoopDebug('⏳ กำลังเรียก WHOOP API...')
    try {
      const valid = await getValidTokens(tokens)
      saveWhoopTokens(valid)
      const raw = await debugWhoopRaw(valid)
      setWhoopDebug(JSON.stringify(raw, null, 2))
    } catch (e: any) {
      setWhoopDebug(`❌ Error: ${e.message}`)
    }
  }, [])

  const syncWhoop = useCallback(async () => {
    setWhoopSyncing(true)
    setWhoopResult({ text: '⏳ กำลัง sync...', ok: true })
    try {
      const result = await syncWhoopAndSave(90)
      setWhoopResult({
        text: result.ok ? `✅ ${result.message}${result.total ? ` (${result.total} วัน)` : ''}` : `❌ ${result.message}`,
        ok: result.ok,
      })
    } finally {
      setWhoopSyncing(false)
    }
  }, [])

  async function exportData() {
    const data = {
      profile: await db.profile.toArray(),
      investments: await db.investments.toArray(),
      dividends: await db.dividends.toArray(),
      healthRecords: await db.healthRecords.toArray(),
      healthDaily: await db.healthDaily.toArray(),
      retirementPlan: await db.retirementPlan.toArray(),
      financeRecords: await db.financeRecords.toArray(),
      emergencyFund: await db.emergencyFund.toArray(),
      salaryRecords: await db.salaryRecords.toArray(),
      condoMortgage: await db.condoMortgage.toArray(),
      installments: await db.installments.toArray(),
      exportedAt: new Date().toISOString(),
    }
    // Download local copy
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personal-app-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    // Also upload to Drive if connected
    if (googleTokens?.accessToken) {
      try {
        setSyncStatus('กำลัง backup ขึ้น Google Drive...')
        const existing = await findDriveBackupFile(googleTokens.accessToken)
        await uploadBackupToDrive(googleTokens.accessToken, data, existing?.id)
        setSyncStatus(`✓ Export + Backup ขึ้น Drive แล้ว`)
      } catch {
        setSyncStatus('✓ Export สำเร็จ (Drive backup ล้มเหลว)')
      }
      setTimeout(() => setSyncStatus(''), 3000)
    }
  }

  async function restoreFromDrive() {
    if (!googleTokens?.accessToken || !driveBackup) return
    if (!confirm('กู้คืนข้อมูลจาก Drive จะแทนที่ข้อมูลทั้งหมดในแอพ\nดำเนินการต่อ?')) return
    setSyncStatus('กำลังกู้คืนข้อมูลจาก Drive...')
    try {
      const data: any = await downloadDriveBackup(googleTokens.accessToken, driveBackup.id)
      await applyImport(data)
    } catch (e: any) {
      setSyncStatus(`❌ กู้คืนล้มเหลว: ${e.message}`)
    }
  }

  async function applyImport(data: any) {
    try {
      if (data.profile) await db.profile.bulkAdd(data.profile.map((d: any) => ({ ...d, id: undefined })))
      if (data.investments) await db.investments.bulkAdd(data.investments.map((d: any) => ({ ...d, id: undefined })))
      if (data.dividends) await db.dividends.bulkAdd(data.dividends.map((d: any) => ({ ...d, id: undefined })))
      if (data.healthRecords) await db.healthRecords.bulkAdd(data.healthRecords.map((d: any) => ({ ...d, id: undefined })))
      if (data.healthDaily) await db.healthDaily.bulkAdd(data.healthDaily.map((d: any) => ({ ...d, id: undefined })))
      if (data.retirementPlan) await db.retirementPlan.bulkAdd(data.retirementPlan.map((d: any) => ({ ...d, id: undefined })))
      if (data.financeRecords) await db.financeRecords.bulkAdd(data.financeRecords.map((d: any) => ({ ...d, id: undefined })))
      if (data.salaryRecords) await db.salaryRecords.bulkAdd(data.salaryRecords.map((d: any) => ({ ...d, id: undefined })))
      if (data.condoMortgage) await db.condoMortgage.bulkAdd(data.condoMortgage.map((d: any) => ({ ...d, id: undefined })))
      if (data.installments) await db.installments.bulkAdd(data.installments.map((d: any) => ({ ...d, id: undefined })))
      setSyncStatus('✓ Import สำเร็จ กำลังโหลดใหม่...')
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setSyncStatus('❌ ไฟล์ไม่ถูกต้อง หรือข้อมูลซ้ำ')
    }
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await applyImport(data)
    } catch {
      setSyncStatus('❌ ไฟล์ไม่ถูกต้อง')
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="ตั้งค่า" gradient="from-slate-500 to-gray-700" back />
      <div className="flex-1 overflow-y-auto">

        {syncStatus && (
          <div className="mx-4 mt-3 bg-indigo-50 text-indigo-700 text-[13px] font-medium px-4 py-2.5 rounded-xl">{syncStatus}</div>
        )}

        {/* Drive backup restore banner */}
        {driveBackup && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-bold text-blue-800">☁️ พบข้อมูลสำรองใน Drive</div>
              <div className="text-[11px] text-blue-600 mt-0.5">
                บันทึกล่าสุด {new Date(driveBackup.modifiedTime).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={restoreFromDrive}
                className="bg-blue-600 text-white text-[12px] font-bold px-3 py-2 rounded-xl active:scale-95">
                กู้คืน
              </button>
              <button onClick={() => setDriveBackup(null)}
                className="text-gray-400 text-[12px] px-2 py-2 rounded-xl active:scale-95">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Profile */}
        <SectionLabel>ข้อมูลส่วนตัว</SectionLabel>
        <div className="mx-4">
          <Card>
            <div className="flex flex-col gap-3">
              {[['ชื่อเล่น', 'nickname', 'text'], ['ชื่อ-นามสกุล', 'fullName', 'text'], ['วันเกิด', 'dob', 'date'], ['ส่วนสูง (ซม.)', 'heightCm', 'number']].map(([label, key, type]) => (
                <div key={key}>
                  <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
                  <input type={type} value={(profileForm as any)[key]}
                    onChange={e => setProfileForm(v => ({ ...v, [key]: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
                </div>
              ))}
              <div>
                <div className="text-[12px] font-semibold text-gray-500 mb-1">เพศ</div>
                <select value={profileForm.gender} onChange={e => setProfileForm(v => ({ ...v, gender: e.target.value as any }))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full">
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
              <button onClick={saveProfile} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
                บันทึกข้อมูล
              </button>
            </div>
          </Card>
        </div>

        {/* API Keys */}
        <SectionLabel>API Keys</SectionLabel>
        <div className="mx-4">
          <Card>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[12px] font-semibold text-gray-500 mb-1">Gemini API Key</div>
                <input type="password" placeholder="AIza..." value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
                <div className="text-[11px] text-gray-400 mt-1">รับได้ฟรีที่ Google AI Studio</div>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-gray-500 mb-1">Google OAuth Client ID</div>
                <input type="text" placeholder="xxx.apps.googleusercontent.com" value={googleClientId} onChange={e => setGoogleClientId(e.target.value)}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
                <div className="text-[11px] text-gray-400 mt-1">สร้างที่ Google Cloud Console</div>
              </div>
              <button onClick={saveApiKeys} className="bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm active:scale-95">
                บันทึก Keys
              </button>
            </div>
          </Card>
        </div>

        {/* Google Sync */}
        <SectionLabel>Google Integration</SectionLabel>
        <div className="mx-4">
          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold text-gray-900">บัญชี Google</div>
                  <div className="text-[12px] text-gray-400">{googleTokens?.userEmail ?? 'ยังไม่ได้เชื่อมต่อ'}</div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${googleTokens ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>
              <button onClick={connectGoogle} className="border-2 border-indigo-200 text-indigo-600 font-semibold py-2.5 rounded-xl text-sm active:scale-95">
                {googleTokens ? '🔄 เชื่อมต่อใหม่' : '🔗 เชื่อมต่อ Google'}
              </button>
              {googleTokens && (
                <>
                  {/* Month range selector */}
                  <div>
                    <div className="text-[12px] font-semibold text-gray-600 mb-2">ช่วงเวลา Gmail Bank sync</div>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(m => {
                        const since = calcSinceDate(m)
                        const label = m === 1 ? 'เดือนนี้' : `${m} เดือน`
                        const dateHint = since.replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$3/$2/$1')
                        return (
                          <button key={m} onClick={() => setSyncMonths(m)}
                            className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border-2 transition-colors ${syncMonths === m ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>
                            <div>{label}</div>
                            <div className={`text-[10px] mt-0.5 ${syncMonths === m ? 'opacity-80' : 'text-gray-400'}`}>จาก {dateHint}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <button onClick={syncGoogleData} className="bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm active:scale-95">
                    📥 Sync ตอนนี้ (Calendar + Gmail)
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* WHOOP */}
        <SectionLabel>WHOOP</SectionLabel>
        <div className="mx-4">
          <Card className="!bg-gray-50">
            {whoopConnected ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div className="text-[13px] font-semibold text-gray-800">เชื่อมต่อ WHOOP แล้ว</div>
                </div>
                <button
                  onClick={syncWhoop}
                  disabled={whoopSyncing}
                  className="w-full bg-black text-white font-semibold py-2.5 rounded-xl text-sm active:scale-95 disabled:opacity-50 mb-2"
                >
                  {whoopSyncing ? '⏳ กำลัง sync...' : '🔄 Sync WHOOP (90 วันล่าสุด)'}
                </button>
                {whoopResult && (
                  <div className={`text-[12px] font-medium px-3 py-2 rounded-xl mb-2 ${whoopResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {whoopResult.text}
                  </div>
                )}
                <button
                  onClick={runWhoopDebug}
                  className="w-full bg-amber-50 text-amber-700 font-semibold py-2 rounded-xl text-[12px] border border-amber-200 mb-2"
                >
                  🔍 Debug — ดู raw response จาก WHOOP API
                </button>
                {whoopDebug && (
                  <div className="mb-2">
                    <textarea
                      readOnly
                      value={whoopDebug}
                      className="w-full text-[10px] font-mono bg-gray-900 text-green-300 p-2 rounded-xl"
                      rows={12}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(whoopDebug); setWhoopDebug(whoopDebug + '\n\n[คัดลอกแล้ว ✓]') }}
                      className="w-full bg-gray-800 text-white font-semibold py-1.5 rounded-lg text-[11px] mt-1"
                    >
                      📋 Copy ทั้งหมด
                    </button>
                  </div>
                )}
                <button onClick={disconnectWhoop} className="text-red-500 text-[12px] font-medium w-full text-center">
                  ยกเลิกการเชื่อมต่อ
                </button>
              </>
            ) : (
              <>
                <div className="text-[13px] font-semibold text-gray-700 mb-1">เชื่อมต่อ WHOOP</div>
                <div className="text-[12px] text-gray-500 mb-3">
                  ดึงข้อมูล Recovery, Sleep, HRV, Strain จาก WHOOP โดยตรง
                </div>
                <button
                  onClick={connectWhoop}
                  className="w-full bg-black text-white font-semibold py-2.5 rounded-xl text-sm active:scale-95"
                >
                  🔗 Connect WHOOP
                </button>
              </>
            )}
          </Card>
        </div>

        {/* Annual Wrapped */}
        <SectionLabel>ฟีเจอร์พิเศษ</SectionLabel>
        <div className="mx-4">
          <Card>
            <button onClick={() => navigate('/wrapped')} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-lg">🎊</div>
                <div className="text-left">
                  <div className="text-[14px] font-semibold text-gray-900">Annual Wrapped</div>
                  <div className="text-[12px] text-gray-400">สรุปปีนี้ของคุณ</div>
                </div>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          </Card>
        </div>

        {/* Storage Stats */}
        <SectionLabel>พื้นที่จัดเก็บข้อมูล</SectionLabel>
        <div className="mx-4 mb-4">
          <Card>
            {!storageStats ? (
              <button onClick={loadStats} className="w-full text-[13px] font-semibold text-indigo-600 py-2 active:scale-95">
                📊 ดูสถิติข้อมูลใน Storage
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-bold text-gray-700">รวมทั้งหมด</span>
                  <span className="text-[13px] font-bold text-indigo-600">{storageStats.total.toLocaleString()} rows</span>
                </div>
                {([
                  ['💬 แชท AI', storageStats.chatMessages, 500, true],
                  ['💰 รายการการเงิน', storageStats.financeRecords, 2000, false],
                  ['🏃 กิจกรรมรายวัน', storageStats.healthDaily, 1000, false],
                  ['🩺 ผลตรวจสุขภาพ', storageStats.healthRecords, 200, false],
                  ['📋 Sync log', storageStats.syncLog, 50, true],
                  ['💊 ยา/วิตามิน log', storageStats.medicationLogs, 500, false],
                  ['📦 อื่นๆ', storageStats.investments + storageStats.dividends + storageStats.installments + storageStats.subscriptions + storageStats.taxRecords + storageStats.salaryRecords + storageStats.medications, 500, false],
                ] as [string, number, number, boolean][]).map(([label, count, warn, canClear]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[12px] text-gray-500 flex-1">{label}</span>
                    <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full ${count > warn ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {count}
                    </span>
                    {canClear && count > 0 && label.includes('แชท') && (
                      <button onClick={async () => { if (confirm('ล้างประวัติแชททั้งหมด?\nAI จะลืมบทสนทนาก่อนหน้า')) { await db.chatMessages.clear(); loadStats() } }}
                        className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded active:scale-95">ล้าง</button>
                    )}
                    {canClear && count > 50 && label.includes('log') && (
                      <button onClick={async () => { await pruneSyncLog(10); loadStats() }}
                        className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded active:scale-95">Trim</button>
                    )}
                  </div>
                ))}
                <button onClick={loadStats} className="text-[11px] text-gray-400 pt-1 active:scale-95">🔄 รีเฟรช</button>
              </div>
            )}
          </Card>
        </div>

        {/* Export / Import */}
        <SectionLabel>สำรอง / กู้คืนข้อมูล</SectionLabel>
        <div className="mx-4 mb-4">
          <Card>
            <div className="flex flex-col gap-3">
              {/* Drive backup info */}
              <div className={`rounded-xl px-3 py-2.5 text-[12px] ${googleTokens ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                {googleTokens
                  ? '☁️ เชื่อมต่อ Google แล้ว — Export จะ backup ขึ้น Drive อัตโนมัติ'
                  : '☁️ เชื่อมต่อ Google เพื่อ backup อัตโนมัติขึ้น Drive'}
              </div>
              <button onClick={exportData} className="bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:scale-95">
                📤 Export ข้อมูลทั้งหมด
                {googleTokens ? ' + Drive Backup' : ' (JSON)'}
              </button>
              {googleTokens && (
                <button onClick={async () => {
                  if (!driveBackup) {
                    setSyncStatus('กำลังค้นหาไฟล์สำรองใน Drive...')
                    try {
                      const backup = await findDriveBackupFile(googleTokens.accessToken)
                      if (backup) { setDriveBackup(backup); setSyncStatus('') }
                      else setSyncStatus('❌ ไม่พบไฟล์สำรองใน Drive')
                    } catch { setSyncStatus('❌ ไม่สามารถเชื่อมต่อ Drive ได้') }
                  } else {
                    restoreFromDrive()
                  }
                }}
                  className="border-2 border-blue-400 text-blue-600 font-bold py-3 rounded-xl text-sm active:scale-95">
                  ☁️ กู้คืนจาก Drive Backup
                </button>
              )}
              <label className="border-2 border-gray-300 text-gray-600 font-bold py-3 rounded-xl text-sm text-center cursor-pointer active:scale-95">
                📥 Import จากไฟล์ (JSON)
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
              <div className="text-[11px] text-gray-400 text-center leading-relaxed">
                เปลี่ยน iPhone ใหม่: ลง app → เชื่อมต่อ Google → กด "กู้คืนจาก Drive"
              </div>
            </div>
          </Card>
        </div>

        <SectionLabel>ล้างข้อมูลในแอป</SectionLabel>
        <div className="mx-4 mb-4">
          <Card>
            <div className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">
              ⚠️ เลือกหมวดที่จะลบ — ลบแล้วกู้คืนไม่ได้ (ยกเว้นกู้จาก Drive backup)
            </div>

            <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 mb-2 cursor-pointer active:bg-gray-100">
              <input type="checkbox" checked={allSelected} onChange={toggleClearAll}
                className="w-5 h-5 accent-red-500" />
              <div className="text-[14px] font-bold text-gray-900">เลือกทั้งหมด</div>
            </label>

            <div className="flex flex-col gap-1">
              {CLEAR_SECTIONS.map(sec => {
                const count = sectionCounts?.[sec.key] ?? 0
                const selected = clearSelected.has(sec.key)
                return (
                  <label key={sec.key}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${count === 0 ? 'opacity-50' : 'active:bg-gray-50'}`}>
                    <input type="checkbox" checked={selected} disabled={count === 0}
                      onChange={() => toggleClearSection(sec.key)}
                      className="w-5 h-5 accent-red-500" />
                    <div className="flex-1 text-[13px] font-medium text-gray-900">{sec.label}</div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${count > 0 ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400'}`}>
                      {count}
                    </span>
                  </label>
                )
              })}
            </div>

            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearSelected.size === 0 || totalSelectedCount === 0}
              className="mt-3 w-full bg-red-500 text-white font-bold py-3 rounded-xl text-sm active:scale-95 disabled:opacity-40">
              🗑️ ล้างข้อมูล {totalSelectedCount > 0 && `(${totalSelectedCount} รายการ)`}
            </button>
          </Card>
        </div>

        <SectionLabel>ปัญหาการใช้งาน</SectionLabel>
        <div className="mx-4 mb-4">
          <Card>
            <div className="text-[12px] text-gray-500 mb-2.5">
              ถ้ามีปัญหาอัปเดต code ไม่ทันใหม่ (เช่น "undefined is not a function") กดปุ่มนี้เพื่อ clear cache และโหลด code ล่าสุด
            </div>
            <button
              onClick={async () => {
                if (!confirm('ล้าง cache และ reload? (ข้อมูลของคุณจะไม่หาย)')) return
                try {
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations()
                    await Promise.all(regs.map(r => r.unregister()))
                  }
                  if ('caches' in window) {
                    const keys = await caches.keys()
                    await Promise.all(keys.map(k => caches.delete(k)))
                  }
                } finally {
                  location.reload()
                }
              }}
              className="bg-orange-500 text-white font-bold py-3 rounded-xl text-sm active:scale-95 w-full"
            >
              🔄 บังคับอัปเดต App
            </button>
          </Card>
        </div>
        <div className="h-4" />
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => !clearing && setShowClearConfirm(false)}>
          <div className="bg-white rounded-t-3xl w-full p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2 text-red-600">⚠️ ยืนยันการล้างข้อมูล</h3>
            <div className="text-[13px] text-gray-700 mb-3">
              จะลบข้อมูลในหมวดต่อไปนี้ทั้งหมด (รวม {totalSelectedCount} รายการ):
            </div>
            <ul className="text-[13px] text-gray-700 space-y-1 mb-4 bg-gray-50 rounded-xl p-3">
              {CLEAR_SECTIONS.filter(s => clearSelected.has(s.key)).map(s => (
                <li key={s.key} className="flex justify-between">
                  <span>• {s.label}</span>
                  <span className="font-semibold text-gray-500">{sectionCounts?.[s.key] ?? 0}</span>
                </li>
              ))}
            </ul>
            <div className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-4">
              ⚠️ ลบแล้วกู้คืนไม่ได้
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)} disabled={clearing}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={doClearData} disabled={clearing}
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50">
                {clearing ? 'กำลังลบ...' : 'ลบทั้งหมด'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
