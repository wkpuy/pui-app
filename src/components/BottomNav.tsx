import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/',           icon: '🏠', label: 'หน้าหลัก' },
  { path: '/investment', icon: '💰', label: 'ลงทุน' },
  { path: '/health',     icon: '❤️', label: 'สุขภาพ' },
  { path: '/finance',    icon: '📊', label: 'การเงิน' },
  { path: '/retirement', icon: '🎯', label: 'เกษียณ' },
  { path: '/calendar',   icon: '📅', label: 'ปฏิทิน' },
  { path: '/coach',      icon: '🤖', label: 'AI Coach' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="flex-shrink-0 bg-white/95 backdrop-blur border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {tabs.map(tab => {
          const active = location.pathname === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center py-2 gap-0.5 min-h-[52px]"
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className={`text-[9px] font-medium leading-none ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
