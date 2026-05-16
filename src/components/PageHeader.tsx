import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  rightAction?: { label: string; onClick: () => void }
  back?: boolean
}

export default function PageHeader({ title, rightAction, back }: Props) {
  const navigate = useNavigate()
  return (
    <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="flex items-center gap-2">
        {back && (
          <button onClick={() => navigate(-1)} className="text-indigo-600 font-medium text-sm mr-1">← กลับ</button>
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
