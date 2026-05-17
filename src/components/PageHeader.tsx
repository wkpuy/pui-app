import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  rightAction?: { label: string; onClick: () => void }
  back?: boolean
  gradient?: string   // e.g. "from-emerald-500 to-teal-600"
}

export default function PageHeader({ title, subtitle, rightAction, back, gradient }: Props) {
  const navigate = useNavigate()

  if (gradient) {
    return (
      <header className={`flex-shrink-0 bg-gradient-to-r ${gradient} px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-5`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {back && (
              <button onClick={() => navigate('/')} className="text-white/80 font-medium text-base mr-1 active:opacity-70">‹ กลับ</button>
            )}
            <div>
              <h1 className="text-[22px] font-bold text-white leading-tight">{title}</h1>
              {subtitle && <p className="text-[12px] text-white/70 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {rightAction && (
            <button
              onClick={rightAction.onClick}
              className="bg-white/20 text-white font-semibold text-[13px] px-4 py-2 rounded-xl active:scale-95 backdrop-blur-sm mt-0.5"
            >
              {rightAction.label}
            </button>
          )}
        </div>
      </header>
    )
  }

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="flex items-center gap-2">
        {back && (
          <button onClick={() => navigate('/')} className="text-indigo-600 font-medium text-sm mr-1">‹ กลับ</button>
        )}
        <h1 className="text-[17px] font-bold text-gray-900">{title}</h1>
      </div>
      {rightAction && (
        <button onClick={rightAction.onClick} className="text-indigo-600 font-semibold text-sm">
          {rightAction.label}
        </button>
      )}
    </header>
  )
}
