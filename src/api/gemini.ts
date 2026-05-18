import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

export function initGemini(apiKey: string) {
  genAI = new GoogleGenerativeAI(apiKey)
}

export async function chatWithCoach(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  systemContext: string
): Promise<string> {
  if (!genAI) throw new Error('Gemini API key not configured')

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemContext,
  })

  const chat = model.startChat({ history: messages.slice(0, -1) })
  const lastMsg = messages[messages.length - 1]
  const result = await chat.sendMessage(lastMsg.parts[0].text)
  return result.response.text()
}

export async function analyzePatterns(context: string): Promise<string> {
  if (!genAI) return ''
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(context)
  return result.response.text()
}
