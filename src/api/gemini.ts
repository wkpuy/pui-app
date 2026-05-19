import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null
let activeModel = 'gemini-2.0-flash'

// Model preference order: try newer first, fall back to stable
const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

export function initGemini(apiKey: string) {
  genAI = new GoogleGenerativeAI(apiKey)
}

export async function chatWithCoach(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  systemContext: string
): Promise<string> {
  if (!genAI) throw new Error('กรุณาตั้งค่า Gemini API Key ในหน้า Settings ก่อน')

  const lastMsg = messages[messages.length - 1]
  const history = messages.slice(0, -1)

  // Try current model; on model-not-found error, cycle through fallbacks
  const modelsToTry = [activeModel, ...MODEL_FALLBACKS.filter(m => m !== activeModel)]
  let lastErr: Error | null = null

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemContext })
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(lastMsg.parts[0].text)
      activeModel = modelName
      return result.response.text()
    } catch (e: any) {
      const msg: string = e?.message ?? ''
      // Only retry on model-not-found type errors
      if (/not found|not exist|invalid model|404/i.test(msg)) {
        lastErr = e
        continue
      }
      // For quota, auth, network errors — throw immediately with clear Thai message
      if (/api.?key|invalid.?key|unauthorized|403/i.test(msg)) {
        throw new Error('API Key ไม่ถูกต้อง — กรุณาตรวจสอบในหน้า Settings')
      }
      if (/quota|429|resource.?exhausted/i.test(msg)) {
        throw new Error('Quota หมดแล้ว — รอสักครู่แล้วลองใหม่')
      }
      throw e
    }
  }

  throw lastErr ?? new Error('ไม่สามารถเชื่อมต่อ Gemini ได้')
}

export async function analyzePatterns(context: string): Promise<string> {
  if (!genAI) return ''
  try {
    const model = genAI.getGenerativeModel({ model: activeModel })
    const result = await model.generateContent(context)
    return result.response.text()
  } catch {
    return ''
  }
}
