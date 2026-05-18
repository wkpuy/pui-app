import { useNavigate } from 'react-router-dom'

const APP_URL = 'https://wkpuy.github.io/pui-app/'


const JSON_EXAMPLE = `[
  {
    "date": "2026-05-18",
    "steps": 8432,
    "sleepTotal": 7.5,
    "sleepDeep": 1.2,
    "sleepRem": 1.8,
    "sleepLight": 4.5,
    "caloriesBurned": 450,
    "weightKg": 68,
    "vo2max": 42.5,
    "waterMl": 2000
  }
]`

export default function ShortcutsGuide() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-white border-b border-gray-100 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button onClick={() => navigate(-1)} className="text-indigo-600 font-medium text-sm">← กลับ</button>
        <h1 className="text-[17px] font-bold text-gray-900">Apple Health Auto-Sync</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* How it works */}
        <div className="bg-indigo-50 rounded-2xl p-4 mb-4">
          <div className="text-[14px] font-bold text-indigo-700 mb-2">🍎 ทำงานอย่างไร?</div>
          <div className="flex flex-col gap-2 text-[13px] text-indigo-700">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
              <span>iOS Shortcuts อ่านข้อมูลจาก Apple Health</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
              <span>Shortcut แปลงเป็น JSON → Base64 → เปิด URL แอพ</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">3</span>
              <span>แอพรับข้อมูลจาก URL → บันทึกลง DB <strong>อัตโนมัติ</strong> ไม่ต้อง import ไฟล์</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">4</span>
              <span>ตั้ง Automation รันทุกเช้า 06:00 → <strong>ไม่ต้องทำเองเลย</strong></span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">ขั้นตอนตั้งค่า (ทำครั้งเดียว)</div>

        {[
          {
            icon: '📲',
            title: 'เปิด Shortcuts app',
            desc: 'มีติดมากับ iPhone — กด + สร้าง Shortcut ใหม่',
          },
          {
            icon: '❤️',
            title: 'Add Action: Find Health Samples',
            desc: 'ค้นหา "Health Samples"\nเลือก Steps / Sleep Analysis / Active Energy / Body Mass\nตั้ง Sort: Newest First · Limit: 7',
          },
          {
            icon: '🔢',
            title: 'รวมข้อมูลเป็น Array JSON',
            desc: 'ใช้ Repeat + Dictionary + Text action\nให้ได้รูปแบบ JSON array (ดูตัวอย่างด้านล่าง)',
          },
          {
            icon: '🔐',
            title: 'Encode Base64',
            desc: 'Add Action: "Encode" → เลือก Base64 Encode\nเพื่อให้ URL ไม่มีอักขระพิเศษ',
          },
          {
            icon: '🔗',
            title: 'Open URL',
            desc: `Add Action: "Open URLs"\nURL = ${APP_URL}?healthSync=[Base64]\nแอพจะเปิดขึ้นมาและบันทึกข้อมูลทันที`,
          },
          {
            icon: '⏰',
            title: 'ตั้ง Automation (ไม่บังคับ แต่แนะนำ)',
            desc: 'Shortcuts → Automation → + → Time of Day\nเวลา 06:00 น. ทุกวัน → Run Shortcut นี้\n→ ข้อมูลจะ sync ทุกเช้าโดยอัตโนมัติ',
          },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3 mb-2.5">
            <div className="text-2xl flex-shrink-0">{s.icon}</div>
            <div>
              <div className="text-[14px] font-semibold text-gray-900 mb-0.5">{s.title}</div>
              <div className="text-[12px] text-gray-500 whitespace-pre-line">{s.desc}</div>
            </div>
          </div>
        ))}

        {/* URL format */}
        <div className="bg-gray-900 rounded-2xl p-4 mb-4 mt-2">
          <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-1">URL format</div>
          <div className="text-[11px] text-green-400 break-all font-mono">
            {APP_URL}<span className="text-yellow-300">?healthSync=</span><span className="text-blue-300">BASE64_JSON</span>
          </div>
        </div>

        {/* JSON example */}
        <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">รูปแบบ JSON ที่รองรับ</div>
        <div className="bg-gray-900 rounded-2xl p-4 mb-4">
          <pre className="text-[11px] text-green-400 overflow-x-auto">{JSON_EXAMPLE}</pre>
        </div>

        {/* Fields reference */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
          {[
            ['date', 'YYYY-MM-DD', 'required'],
            ['steps', 'จำนวนก้าว', 'optional'],
            ['sleepTotal', 'ชั่วโมงนอนรวม', 'optional'],
            ['sleepDeep', 'Deep sleep (ชม.)', 'optional'],
            ['sleepRem', 'REM sleep (ชม.)', 'optional'],
            ['sleepLight', 'Light sleep (ชม.)', 'optional'],
            ['caloriesBurned', 'แคลอรี่เผาผลาญ', 'optional'],
            ['weightKg', 'น้ำหนัก (kg)', 'optional'],
            ['vo2max', 'VO2 max', 'optional'],
            ['waterMl', 'น้ำดื่ม (ml)', 'optional'],
            ['heartRate', 'อัตราการเต้นหัวใจ', 'optional'],
          ].map(([field, desc, req], i, arr) => (
            <div key={field} className={`px-4 py-2.5 flex items-center justify-between ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <span className="text-[12px] font-mono font-bold text-indigo-700">{field}</span>
                <span className="text-[12px] text-gray-500 ml-2">{desc}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${req === 'required' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                {req === 'required' ? 'จำเป็น' : 'ไม่บังคับ'}
              </span>
            </div>
          ))}
        </div>

        {/* Already has manual import too */}
        <div className="bg-amber-50 rounded-2xl p-4 mb-6">
          <div className="text-[13px] font-bold text-amber-700 mb-1">📁 หรือจะ Import ไฟล์เองก็ได้</div>
          <div className="text-[13px] text-amber-600">
            ถ้าไม่อยากตั้ง Shortcut ก็ยังใช้ Settings → Import Apple Health JSON ได้เหมือนเดิม
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
