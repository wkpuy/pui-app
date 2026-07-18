import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

// ปฏิทิน (date input) สไตล์กลางของทั้งแอพ — ใช้ตัวนี้ทุกที่เพื่อให้หน้าตาเหมือนกัน
export default function DateInput({ className = '', ...props }: Props) {
  return (
    <input
      type="date"
      {...props}
      className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 ${className}`}
    />
  )
}
