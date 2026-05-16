export interface HealthNorm {
  label: string
  unit: string
  normal: string
  optimal: string
  evaluate: (val: number) => 'optimal' | 'good' | 'warning' | 'high'
}

export const HEALTH_NORMS: Record<string, HealthNorm> = {
  systolic: {
    label: 'ความดัน (บน)',
    unit: 'mmHg',
    normal: '< 120',
    optimal: '< 110',
    evaluate: (v) => v < 110 ? 'optimal' : v < 120 ? 'good' : v < 140 ? 'warning' : 'high',
  },
  diastolic: {
    label: 'ความดัน (ล่าง)',
    unit: 'mmHg',
    normal: '< 80',
    optimal: '< 70',
    evaluate: (v) => v < 70 ? 'optimal' : v < 80 ? 'good' : v < 90 ? 'warning' : 'high',
  },
  heartRate: {
    label: 'อัตราเต้นหัวใจ',
    unit: 'bpm',
    normal: '60–100',
    optimal: '< 60',
    evaluate: (v) => v < 60 ? 'optimal' : v <= 70 ? 'good' : v <= 100 ? 'warning' : 'high',
  },
  glucose: {
    label: 'น้ำตาลในเลือด (FBS)',
    unit: 'mg/dL',
    normal: '< 100',
    optimal: '70–85',
    evaluate: (v) => (v >= 70 && v <= 85) ? 'optimal' : v < 100 ? 'good' : v < 126 ? 'warning' : 'high',
  },
  ldl: {
    label: 'ไขมัน LDL',
    unit: 'mg/dL',
    normal: '< 130',
    optimal: '< 70',
    evaluate: (v) => v < 70 ? 'optimal' : v < 100 ? 'good' : v < 130 ? 'warning' : 'high',
  },
  hdl: {
    label: 'ไขมัน HDL',
    unit: 'mg/dL',
    normal: '> 40',
    optimal: '> 60',
    evaluate: (v) => v > 60 ? 'optimal' : v >= 40 ? 'good' : 'high',
  },
  triglycerides: {
    label: 'ไตรกลีเซอไรด์',
    unit: 'mg/dL',
    normal: '< 150',
    optimal: '< 100',
    evaluate: (v) => v < 100 ? 'optimal' : v < 150 ? 'good' : v < 200 ? 'warning' : 'high',
  },
  hba1c: {
    label: 'HbA1c',
    unit: '%',
    normal: '< 5.7',
    optimal: '< 5.0',
    evaluate: (v) => v < 5.0 ? 'optimal' : v < 5.7 ? 'good' : v < 6.5 ? 'warning' : 'high',
  },
  vo2max: {
    label: 'VO₂max',
    unit: 'mL/kg/min',
    normal: '> 35',
    optimal: '> 50',
    evaluate: (v) => v > 50 ? 'optimal' : v > 40 ? 'good' : v > 30 ? 'warning' : 'high',
  },
}

export const STATUS_COLOR = {
  optimal: { bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-500', label: 'Optimal' },
  good:    { bg: 'bg-green-50',  text: 'text-green-600',  dot: 'bg-green-500',  label: 'ปกติ' },
  warning: { bg: 'bg-amber-50',  text: 'text-amber-600',  dot: 'bg-amber-500',  label: 'เฝ้าระวัง' },
  high:    { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-500',    label: 'สูง/ต่ำ' },
}

export const AGE_CHECKUPS: { minAge: number; maxAge: number; items: string[] }[] = [
  { minAge: 20, maxAge: 39, items: ['ตรวจเลือดทั่วไป', 'ความดันโลหิต', 'ดัชนีมวลกาย'] },
  { minAge: 35, maxAge: 49, items: ['ตรวจน้ำตาล', 'ไขมันในเลือด', 'ECG พื้นฐาน', 'ตรวจตา', 'ทันตกรรม'] },
  { minAge: 40, maxAge: 59, items: ['ตรวจมะเร็งลำไส้', 'ตรวจหัวใจ', 'ตรวจไทรอยด์', 'ตรวจกระดูก'] },
  { minAge: 50, maxAge: 99, items: ['Colonoscopy', 'ตรวจมะเร็งเต้านม/ต่อมลูกหมาก', 'ตรวจหู'] },
]

export function getRecommendedCheckups(age: number) {
  return AGE_CHECKUPS.filter(c => age >= c.minAge && age <= c.maxAge).flatMap(c => c.items)
}
