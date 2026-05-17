import { useNavigate } from 'react-router-dom'

const STEPS = [
  { num: 1, title: 'ดาวน์โหลด Shortcuts app', desc: 'มีติดมากับ iPhone แล้ว หรือดาวน์โหลดจาก App Store' },
  { num: 2, title: 'สร้าง Shortcut ใหม่', desc: 'เปิด Shortcuts > กด + > Add Action' },
  { num: 3, title: 'เพิ่ม Action: Find Health Samples', desc: 'ค้นหา "Health" แล้วเลือก "Find Health Samples"\nเลือก Type: Steps, Sleep, Heart Rate ฯลฯ\nตั้ง date range: Last 30 days' },
  { num: 4, title: 'แปลงเป็น JSON', desc: 'เพิ่ม Action: "Get Dictionary from Input"\nแล้ว "Combine Text" เป็น JSON format' },
  { num: 5, title: 'บันทึกไฟล์', desc: 'เพิ่ม Action: "Save File"\nเลือกบันทึกใน iCloud Drive หรือ Files app' },
  { num: 6, title: 'Import เข้าแอพ', desc: 'กลับมาที่แอพนี้ > Settings > Import Apple Health JSON\nเลือกไฟล์ที่บันทึกไว้' },
  { num: 7, title: 'ตั้ง Automation (ไม่บังคับ)', desc: 'Shortcuts > Automation > + > Time of Day\nตั้งเวลา 06:00 ทุกวัน ให้รัน Shortcut นี้อัตโนมัติ' },
]

const JSON_EXAMPLE = `[
  {
    "date": "2026-05-16",
    "steps": 8432,
    "sleepTotal": 7.5,
    "sleepDeep": 1.2,
    "sleepRem": 1.8,
    "sleepLight": 4.5,
    "waterMl": 2000,
    "caloriesBurned": 450,
    "vo2max": 42.5,
    "weightKg": 68
  }
]`

export default function ShortcutsGuide() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-white border-b border-gray-100 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button onClick={() => navigate("/")} className="text-indigo-600 font-medium text-sm">← กลับ</button>
        <h1 className="text-[17px] font-bold text-gray-900">วิธีใช้ iOS Shortcuts</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-indigo-50 rounded-2xl p-4 mb-4">
          <div className="text-[14px] font-bold text-indigo-700 mb-1">🍎 Apple Health Sync</div>
          <div className="text-[13px] text-indigo-600">
            เนื่องจาก Safari Web App ไม่สามารถเข้าถึง HealthKit โดยตรง เราใช้ iOS Shortcuts เป็นตัวกลางแทน
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          {STEPS.map(s => (
            <div key={s.num} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
              <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-0.5">
                {s.num}
              </div>
              <div>
                <div className="text-[14px] font-semibold text-gray-900 mb-0.5">{s.title}</div>
                <div className="text-[13px] text-gray-500 whitespace-pre-line">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-2xl p-4 mb-4">
          <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">รูปแบบ JSON ที่รองรับ</div>
          <pre className="text-[11px] text-green-400 overflow-x-auto">{JSON_EXAMPLE}</pre>
        </div>

        <div className="bg-amber-50 rounded-2xl p-4 mb-4">
          <div className="text-[13px] font-bold text-amber-700 mb-1">⌚ สำหรับ WHOOP</div>
          <div className="text-[13px] text-amber-600">
            Export ข้อมูลจาก WHOOP app เป็น CSV แล้ว convert เป็น JSON format เดียวกัน หรือใช้ WHOOP API
          </div>
        </div>

        <button onClick={() => navigate('/settings')} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl w-full active:scale-95">
          ไปที่ Settings เพื่อ Import
        </button>
        <div className="h-4" />
      </div>
    </div>
  )
}
