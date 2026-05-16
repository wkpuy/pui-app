import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { chatWithCoach, analyzePatterns, initGemini } from '../api/gemini'
import { getAgeDetail } from '../utils/calculations'

interface Message { role: 'user' | 'assistant'; content: string; time: string }

const SMART_PROMPTS = [
  'สุขภาพของฉันตอนนี้เป็นยังไงบ้าง?',
  'พอร์ตหุ้นฉันควรปรับอะไรไหม?',
  'ฉันจะเกษียณทันไหม?',
  'รายจ่ายเดือนนี้สูงไปไหม?',
]

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const settings = useLiveQuery(() => db.settings.toArray().then(r => r[0]))
  const profile = useLiveQuery(() => db.profile.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const latestHealth = useLiveQuery(() => db.healthRecords.orderBy('date').last())
  const latestDaily = useLiveQuery(() => db.healthDaily.orderBy('date').last())
  const retirement = useLiveQuery(() => db.retirementPlan.toArray().then(r => r[0]))
  const recentFinance = useLiveQuery(() => db.financeRecords.orderBy('date').reverse().limit(30).toArray())

  useEffect(() => {
    if (settings?.geminiApiKey) initGemini(settings.geminiApiKey)
  }, [settings?.geminiApiKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!settings?.geminiApiKey || !investments || !latestHealth) return
    buildSmartAlerts()
  }, [settings, investments, latestHealth, recentFinance])

  function buildContext() {
    const age = profile ? getAgeDetail(profile.dob) : null
    const totalInvested = investments?.reduce((s, i) => s + i.costBasis, 0) ?? 0
    const totalCurrent = investments?.reduce((s, i) => s + i.currentValue, 0) ?? 0

    return `คุณคือ AI Coach ส่วนตัวของ ${profile?.nickname ?? 'ผู้ใช้'} พูดภาษาไทย ตอบกระชับ เป็นกันเอง

ข้อมูลส่วนตัว:
- ชื่อ: ${profile?.nickname}, อายุ ${age?.years} ปี ${age?.months} เดือน

ข้อมูลการลงทุน:
- พอร์ตรวม: ต้นทุน ${totalInvested.toLocaleString()} บาท, ตอนนี้ ${totalCurrent.toLocaleString()} บาท (${((totalCurrent - totalInvested) / totalInvested * 100).toFixed(1)}%)
${investments?.map(i => `  - ${i.name}: ต้นทุน ${i.costBasis.toLocaleString()}, ปัจจุบัน ${i.currentValue.toLocaleString()}`).join('\n') ?? ''}

ข้อมูลสุขภาพล่าสุด (${latestHealth?.date ?? 'ไม่มี'}):
${latestHealth ? `- ความดัน: ${latestHealth.systolic}/${latestHealth.diastolic}, น้ำตาล: ${latestHealth.glucose}, LDL: ${latestHealth.ldl}, HDL: ${latestHealth.hdl}` : 'ไม่มีข้อมูล'}
${latestDaily ? `- น้ำหนัก: ${latestDaily.weightKg} กก., ก้าว: ${latestDaily.steps}, นอน: ${latestDaily.sleepTotal} ชม., VO2max: ${latestDaily.vo2max}` : ''}

แผนเกษียณ: เป้าอายุ ${retirement?.targetRetirementAge ?? '-'}, ใช้/เดือน ${retirement?.monthlyExpenseAtRetirement?.toLocaleString() ?? '-'} บาท

ตอบคำถามโดยอ้างอิงข้อมูลจริงข้างต้น`
  }

  async function buildSmartAlerts() {
    if (!settings?.geminiApiKey) return
    try {
      initGemini(settings.geminiApiKey)
      const context = buildContext()
      const prompt = `${context}\n\nวิเคราะห์ข้อมูลและแจ้งเตือน 2-3 ข้อสำคัญที่พบ เขียนแต่ละข้อสั้นๆ 1 บรรทัด เริ่มด้วย emoji`
      const result = await analyzePatterns(prompt)
      const lines = result.split('\n').filter(l => l.trim().length > 0).slice(0, 3)
      setAlerts(lines)
    } catch { /* silent */ }
  }

  async function sendMessage(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || loading) return
    if (!settings?.geminiApiKey) {
      setMessages(v => [...v, {
        role: 'assistant',
        content: 'กรุณาตั้งค่า Gemini API Key ก่อนในหน้า Settings ครับ',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      }])
      return
    }

    const userMsg: Message = { role: 'user', content: msg, time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      initGemini(settings.geminiApiKey)
      const history = newMessages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }],
      }))
      history.push({ role: 'user', parts: [{ text: msg }] })

      const reply = await chatWithCoach(history, buildContext())
      setMessages(v => [...v, {
        role: 'assistant', content: reply,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      }])

      // Save to DB
      await db.chatMessages.bulkAdd([
        { role: 'user', content: msg, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ])
    } catch (e: any) {
      setMessages(v => [...v, { role: 'assistant', content: `เกิดข้อผิดพลาด: ${e.message}`, time: '' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="AI Coach 🤖" />

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide mb-1">Smart Alerts</div>
          {alerts.map((a, i) => (
            <div key={i} className="text-[12px] text-indigo-700 py-0.5">{a}</div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🤖</div>
            <div className="text-gray-500 font-medium mb-1">สวัสดีครับ ฉันคือ AI Coach</div>
            <div className="text-[13px] text-gray-400 mb-4">ถามอะไรก็ได้เกี่ยวกับสุขภาพ การเงิน หรือการลงทุน</div>
            <div className="flex flex-col gap-2">
              {SMART_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="bg-indigo-50 text-indigo-700 text-[13px] font-medium px-4 py-2.5 rounded-xl active:scale-95 text-left">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 mb-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${m.role === 'assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gray-200'}`}>
              {m.role === 'assistant' ? '🤖' : '😊'}
            </div>
            <div className={`max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
              <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${m.role === 'assistant' ? 'bg-white text-gray-800 shadow-sm rounded-tl-sm' : 'bg-indigo-600 text-white rounded-tr-sm'}`}>
                {m.content}
              </div>
              {m.time && <div className="text-[10px] text-gray-400 px-1">{m.time}</div>}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm">🤖</div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="พิมพ์คำถาม..."
          rows={1}
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-[14px] resize-none outline-none focus:border-indigo-400"
          style={{ maxHeight: 100 }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 flex-shrink-0"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
