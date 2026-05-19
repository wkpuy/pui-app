import { useLocation, useNavigate } from 'react-router-dom'

function HomeIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}
function HeartIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  )
}
function WalletIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="22" height="14" rx="2"/>
      <path d="M16 14a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" stroke="none"/>
      <path d="M1 10h22"/>
    </svg>
  )
}
function TargetIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
}
function SparkleIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

const TABS = [
  { path: '/',           label: 'หน้าหลัก', grad: 'from-violet-500 to-indigo-600',  Icon: HomeIcon },
  { path: '/investment', label: 'ลงทุน',    grad: 'from-blue-500 to-cyan-600',      Icon: ChartIcon },
  { path: '/health',     label: 'สุขภาพ',   grad: 'from-rose-500 to-pink-600',      Icon: HeartIcon },
  { path: '/finance',    label: 'การเงิน',  grad: 'from-emerald-500 to-teal-600',   Icon: WalletIcon },
  { path: '/retirement', label: 'เกษียณ',   grad: 'from-orange-500 to-amber-500',   Icon: TargetIcon },
  { path: '/coach',      label: 'AI Coach', grad: 'from-purple-500 to-violet-600',  Icon: SparkleIcon },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="flex-shrink-0 bg-white/95 backdrop-blur-xl border-t border-gray-100/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.07)]">
      <div className="flex">
        {TABS.map(({ path, label, grad, Icon }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path, { replace: true })}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center pt-2 pb-1.5 gap-0.5 min-h-[56px]"
            >
              <div className={`w-10 h-[34px] rounded-xl flex items-center justify-center transition-all duration-200
                ${active ? `bg-gradient-to-br ${grad} shadow-md` : ''}`}>
                <span className={`transition-colors duration-200 ${active ? 'text-white' : 'text-gray-400'}`}>
                  <Icon />
                </span>
              </div>
              <span aria-hidden="true" className={`text-[11px] font-semibold leading-none transition-colors duration-200 ${active ? 'text-gray-700' : 'text-gray-500'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
