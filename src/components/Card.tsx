import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm ${onClick ? 'active:scale-[0.98] cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{children}</div>
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-5 pt-4 pb-1 text-[13px] font-semibold text-gray-500">{children}</div>
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

export function ProgressBar({ value, max, color = 'bg-indigo-500' }: { value: number; max: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
