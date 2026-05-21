import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isDbError = /dexie|indexeddb|versionerror|upgradeerror/i.test(error.message)

    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">😢</div>
        <h1 className="text-[18px] font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h1>
        <p className="text-[13px] text-gray-500 mb-1 max-w-xs">
          {isDbError
            ? 'ฐานข้อมูลอัพเกรดไม่สำเร็จ กรุณาล้างแคชแล้วเปิดใหม่'
            : 'แอพเจอปัญหาระหว่างโหลด'}
        </p>
        <details className="mb-5 max-w-xs">
          <summary className="text-[11px] text-gray-400 cursor-pointer">รายละเอียดข้อผิดพลาด</summary>
          <pre className="mt-1 text-[10px] text-red-500 whitespace-pre-wrap text-left bg-red-50 rounded-xl p-2 border border-red-100 max-h-32 overflow-y-auto">
            {error.message}
          </pre>
        </details>

        <button
          onClick={() => window.location.reload()}
          className="w-full max-w-xs bg-indigo-600 text-white font-bold py-3 rounded-2xl text-[15px] active:scale-95 mb-3"
        >
          🔄 โหลดใหม่
        </button>

        {isDbError && (
          <button
            onClick={() => {
              indexedDB.deleteDatabase('PuiPersonalApp')
              window.location.reload()
            }}
            className="w-full max-w-xs bg-red-100 text-red-700 font-semibold py-2.5 rounded-2xl text-[13px] active:scale-95"
          >
            ⚠️ ล้างข้อมูลแอพแล้วโหลดใหม่ (ข้อมูลจะหายถ้าไม่ได้ backup)
          </button>
        )}
      </div>
    )
  }
}
