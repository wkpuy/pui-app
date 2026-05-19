import { type ReactNode, type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'cta' | 'compact' | 'danger' | 'ghost'
  loading?: boolean
  children: ReactNode
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Full-width — form save buttons inside modals/sheets
  primary: 'w-full bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 disabled:opacity-40 mt-2',
  // Centered pill — empty-state CTAs
  cta:     'bg-indigo-600 text-white font-semibold px-8 py-3 rounded-2xl active:scale-95 disabled:opacity-40',
  // Inline compact — quick-action chips
  compact: 'bg-indigo-600 text-white font-semibold px-3.5 py-2 rounded-2xl text-[13px] active:scale-95 disabled:opacity-40',
  // Destructive full-width
  danger:  'w-full bg-red-500 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 disabled:opacity-40 mt-2',
  // Outline secondary
  ghost:   'border-2 border-indigo-200 text-indigo-600 font-semibold py-2.5 px-4 rounded-xl text-sm active:scale-95 disabled:opacity-40',
}

export default function Button({
  variant = 'primary',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`transition-transform ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {loading ? <span className="opacity-60">กำลังโหลด…</span> : children}
    </button>
  )
}

// ── Icon button ──────────────────────────────────────────────────────────────
// 36×36 visual, but -m-1 p-1 expands tap target to 44px without shifting layout

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  tone?: 'neutral' | 'destructive'
}

export function IconButton({ children, tone = 'neutral', className = '', ...props }: IconButtonProps) {
  const base = tone === 'destructive'
    ? 'bg-red-50 text-red-400'
    : 'bg-gray-100 text-gray-500'
  return (
    <button
      {...props}
      className={`-m-1 p-1 w-9 h-9 rounded-lg flex items-center justify-center active:scale-95 disabled:opacity-40 ${base} ${className}`}
    >
      {children}
    </button>
  )
}

// ── Close button (modal / sheet header) ──────────────────────────────────────
// 44×44 tap target, visually an ✕

export function CloseButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label="ปิด"
      {...props}
      className={`w-11 h-11 flex items-center justify-center text-gray-400 text-xl active:opacity-60 ${className}`}
    >
      ✕
    </button>
  )
}
