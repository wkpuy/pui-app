import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-[0_2px_16px_rgba(0,0,0,0.06)] ${onClick ? 'active:scale-[0.98] cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{children}</div>
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-5 pt-5 pb-1.5 text-[13px] font-semibold text-gray-600">{children}</div>
}

export function Divider() {
  return <div className="h-2 bg-gray-100" />
}

interface StatusTagProps {
  status: 'optimal' | 'good' | 'warning' | 'high'
  label: string
}

const TAG_STYLES = {
  optimal: 'bg-indigo-50 text-indigo-600',
  good:    'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-600',
  high:    'bg-red-50 text-red-600',
}

export function StatusTag({ status, label }: StatusTagProps) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${TAG_STYLES[status]}`}>
      {label}
    </span>
  )
}

// Auto-dismiss toast notification
export function Toast({ message, type = 'success', onDone }: {
  message: string | null
  type?: 'success' | 'error'
  onDone: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300) }, 2500)
    return () => clearTimeout(t)
  }, [message])

  if (!message) return null
  return (
    <div className={`fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl shadow-lg text-[13px] font-semibold text-white transition-all duration-300 whitespace-nowrap
      ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
      {type === 'success' ? '✓ ' : '✕ '}{message}
    </div>
  )
}

export function ProgressBar({ value, max, color = 'bg-indigo-500' }: { value: number; max: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
