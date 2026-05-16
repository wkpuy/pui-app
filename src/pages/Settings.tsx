import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { Card, SectionLabel } from '../components/Card'
import { signInWithGoogle, fetchCalendarEvents, fetchGmailBankMessages, parseBankEmail, parseDividendEvents } from '../api/google'

export default function Settings() {
  const navigate = useNavigate()
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const settings = useLiveQuery(() => db.settings.toArray().then(r => r[0]))
  const googleTokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))

  const [profileForm, setProfileForm] = useState({ nickname: '', fullName: '', dob: '', gender: 'male' as 'male' | 'female', heightCm: '' })
  const [geminiKey, setGeminiKey] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [syncStatus, setSyncStatus] = useState('')

  useEffect(() => {
    if (profile) setProfileForm({ nickname: profile.nickname, fullName: profile.fullName, dob: profile.dob, gender: profile.gender, heightCm: profile.heightCm.toString() })
    if (settings?.geminiApiKey) setGeminiKey(settings.geminiApiKey)
    if (settings?.googleClientId) setGoogleClientId(settings.googleClientId)
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
    } catch (e: any) {
      setSyncStatus(`❌ ${e.message}`)
    }
  }

  async function syncGoogleData() {
    if (!googleTokens?.accessToken) { setSyncStatus('กรุณาเชื่อมต่อ Google ก่อน'); return }
    setSyncStatus('กำลัง sync...')
    try {
      // Sync calendar
      const events = await fetchCalendarEvents(googleTokens.accessToken)
      const dividendEvents = parseDividendEvents(events)
      await db.syncLog.add({ source: 'calendar', lastSyncAt: new Date().toISOString(), status: 'success', notes: `${events.length} events, ${dividendEvents.length} dividend` })

      // Sync Gmail bank
      const emails = await fetchGmailBankMessages(googleTokens.accessToken)
      let added = 0
      for (const email of emails) {
        const parsed = parseBankEmail(email)
        if (parsed.amount > 0) {
          await db.financeRecords.add({ ...parsed, type: parsed.type as 'income' | 'expense', category: parsed.type === 'income' ? 'โอนเข้า' : 'โอนออก', source: parsed.source as any })
          added++
        }
      }
      await db.syncLog.add({ source: 'gmail', lastSyncAt: new Date().toISOString(), status: 'success', notes: `${added} records` })
      setSyncStatus(`✓ Sync เสร็จ: ${events.length} นัดหมาย, ${added} รายการธนาคาร`)
    } catch (e: any) {
      setSyncStatus(`❌ Sync ล้มเหลว: ${e.message}`)
    }
  }

  async function importAppleHealth(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      // Expect array of HealthDaily objects
      if (Array.isArray(data)) {
        await db.healthDaily.bulkAdd(data.map((d: any) => ({ ...d, source: 'apple_health', id: undefined })))
        setSyncStatus(`✓ Import Apple Health: ${data.length} วัน`)
      }
    } catch {
      setSyncStatus('❌ ไฟล์ไม่ถูกต้อง')
    }
    await db.syncLog.add({ source: 'apple_health', lastSyncAt: new Date().toISOString(), status: 'success' })
  }

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
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personal-app-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.profile) await db.profile.bulkAdd(data.profile.map((d: any) => ({ ...d, id: undefined })))
      if (data.investments) await db.investments.bulkAdd(data.investments.map((d: any) => ({ ...d, id: undefined })))
      if (data.dividends) await db.dividends.bulkAdd(data.dividends.map((d: any) => ({ ...d, id: undefined })))
      if (data.healthRecords) await db.healthRecords.bulkAdd(data.healthRecords.map((d: any) => ({ ...d, id: undefined })))
      if (data.healthDaily) await db.healthDaily.bulkAdd(data.healthDaily.map((d: any) => ({ ...d, id: undefined })))
      if (data.retirementPlan) await db.retirementPlan.bulkAdd(data.retirementPlan.map((d: any) => ({ ...d, id: undefined })))
      if (data.financeRecords) await db.financeRecords.bulkAdd(data.financeRecords.map((d: any) => ({ ...d, id: undefined })))
      setSyncStatus('✓ Import สำเร็จ โหลดหน้าใหม่...')
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setSyncStatus('❌ ไฟล์ไม่ถูกต้อง')
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="ตั้งค่า" />
      <div className="flex-1 overflow-y-auto">

        {syncStatus && (
          <div className="mx-4 mt-3 bg-indigo-50 text-indigo-700 text-[13px] font-medium px-4 py-2.5 rounded-xl">{syncStatus}</div>
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
                <button onClick={syncGoogleData} className="bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm active:scale-95">
                  📥 Sync ตอนนี้ (Calendar + Gmail)
                </button>
              )}
            </div>
          </Card>
        </div>

        {/* Apple Health */}
        <SectionLabel>Apple Health / WHOOP</SectionLabel>
        <div className="mx-4">
          <Card className="!bg-gray-50">
            <div className="text-[13px] font-semibold text-gray-700 mb-2">Import ข้อมูลสุขภาพ</div>
            <div className="text-[12px] text-gray-500 mb-3">
              ใช้ iOS Shortcuts export JSON จาก Apple Health แล้ว import ที่นี่
            </div>
            <label className="bg-gray-800 text-white font-semibold text-sm py-2.5 px-4 rounded-xl active:scale-95 cursor-pointer block text-center">
              📱 เลือกไฟล์ Apple Health JSON
              <input type="file" accept=".json" onChange={importAppleHealth} className="hidden" />
            </label>
            <button onClick={() => navigate('/shortcuts-guide')} className="text-indigo-600 text-[12px] font-medium mt-2 w-full text-center">
              วิธีสร้าง iOS Shortcut →
            </button>
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
              <button onClick={exportData} className="bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:scale-95">
                📤 Export ข้อมูลทั้งหมด (JSON)
              </button>
              <label className="border-2 border-green-500 text-green-700 font-bold py-3 rounded-xl text-sm text-center cursor-pointer active:scale-95">
                📥 Import ข้อมูล (JSON)
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
              <div className="text-[11px] text-gray-400 text-center">ใช้เพื่อย้ายข้อมูลเมื่อเปลี่ยน iPhone</div>
            </div>
          </Card>
        </div>
        <div className="h-4" />
      </div>
    </div>
  )
}
