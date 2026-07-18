// สร้าง id สุ่มแบบ client-side (ใช้ทั่วแอพ) — fallback เมื่อ crypto.randomUUID ไม่มี
export function genId(): string {
  try { return crypto.randomUUID() }
  catch { return `${Date.now()}-${Math.round(Math.random() * 1e9)}` }
}
