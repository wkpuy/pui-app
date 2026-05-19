import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, SectionLabel } from '../components/Card'
import { signInWithGoogle, fetchCalendarEvents, fetchGmailBankMessages, parseBankEmail, parseDividendEvents, findDriveBackupFile, uploadBackupToDrive, downloadDriveBackup, calcSinceDate } from '../api/google'
import { getWhoopAuthUrl, loadWhoopTokens, clearWhoopTokens, fetchWhoopData, getValidTokens, saveWhoopTokens } from '../api/whoop'

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

  const syncWhoop = useCallback(async () => {
    const tokens = loadWhoopTokens()
    if (!tokens) { setSyncStatus('❌ ยังไม่ได้เชื่อมต่อ WHOOP'); return }
    setWhoopSyncing(true)
    setWhoopResult(null)
    try {
      setWhoopResult({ text: '⏳ [1/3] ตรวจสอบ token...', ok: true })
      let valid: typeof tokens
      try {
        valid = await getValidTokens(tokens)
        saveWhoopTokens(valid)
      } catch (e: any) {
        setWhoopResult({ text: `❌ Token ไม่ถูกต้อง: ${e.message} — กรุณา Disconnect แล้ว Connect ใหม่`, ok: false })
        return
      }

      setWhoopResult({ text: '⏳ [2/3] กำลังดึงข้อมูลจาก WHOOP...', ok: true })
      let records: Awaited<ReturnType<typeof fetchWhoopData>>
      try {
        records = await fetchWhoopData(valid, 90)
      } catch (e: any) {
        setWhoopResult({ text: `❌ เชื่อมต่อ WHOOP API ล้มเหลว: ${e.message}`, ok: false })
        return
      }

      setWhoopResult({ text: `⏳ [3/3] บันทึก ${records.length} วัน...`, ok: true })
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
          source: 'whoop',
        }
        if (existing) {
          await db.healthDaily.update(existing.id!, { ...payload, id: undefined })
          updated++
        } else {
          await db.healthDaily.add(payload)
          added++
        }
      }
      await db.syncLog.add({ source: 'whoop', lastSyncAt: new Date().toISOString(), status: 'success', notes: `+${added} ใหม่, ${updated} อัปเดต` })
      if (records.length === 0) {
        setWhoopResult({ text: '⚠️ ไม่มีข้อมูลจาก WHOOP API', ok: false })
      } else if (added === 0 && updated === 0) {
        setWhoopResult({ text: `ℹ️ ข้อมูลเป็นปัจจุบันแล้ว (พบ ${records.length} วัน)`, ok: true })
      } else {
        setWhoopResult({ text: `✅ +${added} วันใหม่${updated > 0 ? ` อัปเดต ${updated}` : ''} จาก ${records.length} วัน`, ok: true })
      }
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
    if (!confirm('กู้คืนข้อมูลจาก Drive จะแทนที่ข้อมูลที่มีอยู่ทั้งหมด ยืนยัน?')) return
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
      <PageHeader title="ตั้งค่า" gradient="from-slate-500 to-gray-700" />
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
              <button onClick={saveProfile} className="bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm active:scale-95">
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
    </div>
  )
}
