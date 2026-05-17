# Personal Life App 📱

แอพข้อมูลส่วนตัวสำหรับใช้บน iPhone — ติดตามสุขภาพ การลงทุน แผนเกษียณ และการเงิน พร้อม AI Coach ส่วนตัว

🔗 **ใช้งาน:** https://wkpuy.github.io/pui-app

---

## ฟีเจอร์หลัก

| หน้า | ฟีเจอร์ |
|------|---------|
| 🏠 **Dashboard** | อายุ real-time, Life Score รวม, Daily Briefing, snapshot ทุกด้าน |
| 💰 **การลงทุน** | หุ้นไทย/ต่างประเทศ/กองทุน/ประกัน/ออมทรัพย์, กำไร-ขาดทุน, ปันผลย้อนหลัง |
| ❤️ **สุขภาพ** | ผลตรวจเลือด + ค่ามาตรฐาน/Optimal (สาย Longevity), นอน (deep/REM/light), ก้าว, VO₂max, อายุชีวภาพ |
| 📊 **การเงิน** | รายรับ-รายจ่าย, หมวดหมู่, เงินสำรองฉุกเฉิน, sync Gmail ธนาคาร |
| 🎯 **เกษียณ** | คำนวณ 4% Rule, progress bar, What If Simulator |
| 🤖 **AI Coach** | แชทกับ Gemini AI โดยมี context ข้อมูลจริงของเรา + Smart Pattern Alerts |
| 🎊 **Annual Wrapped** | สรุปปีแบบ Spotify Wrapped |
| ⚙️ **Settings** | ตั้งค่าโปรไฟล์, API keys, Google sync, Export/Import ข้อมูล |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS
- **Build:** Vite
- **Storage:** IndexedDB (Dexie.js) — เก็บในเครื่องทั้งหมด ไม่มี external database
- **PWA:** vite-plugin-pwa + Workbox (ใช้ offline ได้)
- **AI Coach:** Google Gemini API (`gemini-2.0-flash`)
- **External sync:** Google Calendar API, Gmail API, Google Drive API

---

## ติดตั้งบน iPhone

แอพนี้เป็น **Progressive Web App (PWA)** — ไม่ต้องผ่าน App Store

1. เปิด **Safari** บน iPhone
2. ไปที่ `https://wkpuy.github.io/pui-app`
3. กดปุ่ม **Share** (กล่องมีลูกศรขึ้น)
4. เลือก **"Add to Home Screen"**
5. กด **Add** — แอพจะปรากฏบน Home Screen เหมือนแอพทั่วไป

> ใช้ Safari เท่านั้น — Chrome บน iPhone ไม่รองรับ "Add to Home Screen" แบบ PWA

---

## ตั้งค่าครั้งแรก

### 1. ข้อมูลส่วนตัว
ไปที่ **Settings** → กรอกชื่อเล่น, วันเกิด, ส่วนสูง → บันทึก

### 2. Gemini API Key (สำหรับ AI Coach)
1. ไปที่ [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. กด **Create API key** → Copy
3. วางใน Settings → **Gemini API Key** → บันทึก Keys

### 3. Google OAuth Client ID (สำหรับ Calendar + Gmail + Drive)
1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com) → สร้าง Project ใหม่
2. เปิด APIs 3 ตัว: **Google Calendar API**, **Gmail API**, **Google Drive API**
3. **APIs & Services → OAuth consent screen**
   - Audience → **External**
   - Branding → กรอก App name + email
   - Data Access → เพิ่ม scopes:
     ```
     https://www.googleapis.com/auth/calendar.readonly
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/drive.readonly
     ```
   - Audience → เพิ่ม Test user: email ของตัวเอง
4. **Credentials → Create OAuth client ID**
   - Type: **Web application**
   - Authorized JavaScript origins:
     ```
     https://wkpuy.github.io
     http://localhost:5174
     ```
   - Authorized redirect URIs: (ใส่เหมือนกับ origins)
5. Copy **Client ID** → วางใน Settings → **Google OAuth Client ID** → บันทึก Keys
6. กด **เชื่อมต่อ Google** → login → Sync ได้เลย

---

## ข้อมูลสุขภาพ (Apple Health / WHOOP)

เนื่องจาก Safari Web App ไม่สามารถเข้าถึง HealthKit โดยตรง มี 2 วิธี:

### วิธีที่ 1 — กรอกเอง (ง่ายสุด)
ไปหน้า ❤️ สุขภาพ → กด **+** → กรอกน้ำหนัก, ก้าว, นอน, VO₂max ได้เลย

### วิธีที่ 2 — iOS Shortcuts (semi-auto)
ดูคู่มือในแอพที่ Settings → **วิธีสร้าง iOS Shortcut**

รูปแบบ JSON ที่รองรับสำหรับ import:
```json
[
  {
    "date": "2026-05-16",
    "weightKg": 68,
    "steps": 8432,
    "sleepTotal": 7.5,
    "sleepDeep": 1.2,
    "sleepRem": 1.8,
    "sleepLight": 4.5,
    "waterMl": 2000,
    "caloriesBurned": 450,
    "vo2max": 42.5
  }
]
```

---

## Google Calendar — ปันผล / XD

ดึงข้อมูลจาก Google Calendar อัตโนมัติ โดย event ต้องมีชื่อในรูปแบบ:
```
[CPALL] วันที่จ่ายปันผล
[PTT] วันที่ขึ้นเครื่องหมาย XD
```

---

## Export / Import ข้อมูล

ข้อมูลทั้งหมดเก็บใน **IndexedDB บน iPhone เท่านั้น** — ไม่มีการส่งข้อมูลออกไปที่ server ใดๆ

### Export (สำรองข้อมูล)
Settings → **Export ข้อมูลทั้งหมด (JSON)** → บันทึกไว้ใน iCloud Drive หรือ Files

### Import (กู้คืนหรือย้าย iPhone ใหม่)
Settings → **Import ข้อมูล (JSON)** → เลือกไฟล์ backup

> ⚠️ ควร Export สำรองข้อมูลเป็นประจำ เพราะถ้าล้าง browser data หรือเปลี่ยน iPhone ข้อมูลจะหายถ้าไม่มี backup

---

## ตารางการซิงก์ข้อมูล

| แหล่งข้อมูล | ความถี่ | วิธี |
|-------------|---------|------|
| Google Calendar (นัดหมาย, XD, ปันผล) | อัตโนมัติทุก 1 ชม. เมื่อเปิดแอพ | ต้อง login Google |
| Gmail (โอนเงิน กสิกร/กรุงเทพ) | อัตโนมัติทุก 24 ชม. เมื่อเปิดแอพ | ต้อง login Google |
| Google Drive (PDF บัตรเครดิต) | กด Sync เอง | ต้อง login Google |
| Apple Health / WHOOP | กด Import เอง | ผ่านไฟล์ JSON |
| AI Coach | Real-time | ต้องมี Gemini API Key |

---

## พัฒนาในเครื่อง (Local Development)

```bash
# Clone repo
git clone https://github.com/wkpuy/pui-app.git
cd pui-app

# ติดตั้ง dependencies
npm install

# เปิด dev server
npm run dev
# เปิดที่ http://localhost:5174

# Build สำหรับ production
npm run build
```

---

## Deploy

Push ขึ้น `main` branch → GitHub Actions จะ build และ deploy ไปยัง GitHub Pages อัตโนมัติ ใช้เวลาประมาณ 2 นาที

ดู workflow ได้ที่ [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

---

## ความปลอดภัย

- ข้อมูลส่วนตัวทั้งหมด (สุขภาพ, การเงิน, การลงทุน) เก็บบน **iPhone เท่านั้น** ผ่าน IndexedDB
- API Keys เก็บใน IndexedDB ในเครื่อง — ไม่ได้ commit ใน Git ไม่มีใครเห็น
- Google OAuth ใช้ **read-only scopes** เท่านั้น — ไม่มีการเขียน แก้ไข หรือลบข้อมูล Google
- Code ใน repo ไม่มีข้อมูลส่วนตัวหรือ credentials ใดๆ ทั้งสิ้น

---

*Personal use only · Built with React + Vite + Tailwind CSS + Dexie.js*
