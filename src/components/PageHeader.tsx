import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  rightAction?: { label: string; onClick: () => void }
  rightActions?: { label: string; onClick: () => void; secondary?: boolean }[]
  back?: boolean
  gradient?: string   // e.g. "from-emerald-500 to-teal-600"
}

export default function PageHeader({ title, subtitle, rightAction, rightActions, back, gradient }: Props) {
  const navigate = useNavigate()

  // merge rightAction + rightActions into one list for rendering
  const actions = [
    ...(rightActions ?? []),
    ...(rightAction ? [{ label: rightAction.label, onClick: rightAction.onClick }] : []),
  ]

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
          {actions.length > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              {actions.map((a, i) => (
                <button
                  key={i}
                  onClick={a.onClick}
                  className={`font-semibold text-[13px] px-4 py-2 rounded-xl active:scale-95 backdrop-blur-sm ${a.secondary ? 'bg-white/10 text-white/80' : 'bg-white/20 text-white'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
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
