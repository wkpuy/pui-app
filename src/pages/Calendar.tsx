import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { fetchCalendarEvents } from '../api/google'

interface CalEvent {
  id: string
  summary: string
  start: string
  end: string
  description?: string
  colorId?: string
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function formatThaiDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${THAI_DAYS[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Calendar() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(new Date())

  const tokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  useEffect(() => {
    if (tokens?.accessToken) loadEvents()
  }, [tokens?.accessToken, year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEvents() {
    if (!tokens?.accessToken) return
    setLoading(true)
    setError(null)
    try {
      const startOfMonth = new Date(year, month, 1)
      const endOfMonth = new Date(year, month + 1, 0)
      const raw = await fetchCalendarEvents(tokens.accessToken, startOfMonth.toISOString(), endOfMonth.toISOString())
      setEvents(raw)
    } catch (e: any) {
      setError(e.message ?? 'ไม่สามารถโหลดปฏิทินได้')
    } finally {
      setLoading(false)
    }
  }

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)) }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayStr()

  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  function dayStr(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function eventsForDay(d: number) {
    const ds = dayStr(d)
    return events.filter(e => e.start.startsWith(ds))
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate())
  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : []

  const isDividendEvent = (summary: string) => /^\[.+\]/.test(summary)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="ปฏิทิน" />
      <div className="flex-1 overflow-y-auto">

        {!tokens?.accessToken ? (
          <div className="text-center py-16 px-8 text-gray-400">
            <div className="text-5xl mb-4">📅</div>
            <div className="font-semibold text-gray-600 mb-2">ยังไม่ได้เชื่อมต่อ Google</div>
            <div className="text-[13px]">ไปที่ Settings → เชื่อมต่อ Google เพื่อดูปฏิทิน</div>
          </div>
        ) : (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">‹</button>
              <div className="text-[16px] font-bold text-gray-900">
                {THAI_MONTHS[month]} {year + 543}
              </div>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">›</button>
            </div>

            {/* Calendar grid */}
            <div className="bg-white mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-7 border-b border-gray-100">
                {THAI_DAYS.map(d => (
                  <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400">{d}</div>
                ))}
              </div>
              {rows.map((row, ri) => (
                <div key={ri} className="grid grid-cols-7">
                  {row.map((d, ci) => {
                    if (!d) return <div key={ci} className="h-12 border-b border-r border-gray-50" />
                    const ds = dayStr(d)
                    const dayEvents = eventsForDay(d)
                    const isToday = ds === today
                    const isSelected = selectedDay === d
                    return (
                      <button
                        key={ci}
                        onClick={() => setSelectedDay(isSelected ? null : d)}
                        className={`h-12 border-b border-r border-gray-50 flex flex-col items-center justify-start pt-1 relative active:bg-indigo-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                      >
                        <span className={`text-[13px] font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {d}
                        </span>
                        {dayEvents.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5">
                            {dayEvents.slice(0, 3).map((e, i) => (
                              <div key={i} className={`w-1.5 h-1.5 rounded-full ${isDividendEvent(e.summary) ? 'bg-green-500' : 'bg-indigo-400'}`} />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Loading / error */}
            {loading && (
              <div className="text-center py-4 text-[13px] text-indigo-500">⏳ กำลังโหลดปฏิทิน...</div>
            )}
            {error && (
              <div className="mx-4 mt-3 bg-red-50 rounded-xl p-3 text-[13px] text-red-600">{error}</div>
            )}

            {/* Selected day events */}
            {selectedDay && (
              <div className="mx-4 mt-3">
                <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">
                  {formatThaiDate(dayStr(selectedDay))} — {selectedEvents.length > 0 ? `${selectedEvents.length} รายการ` : 'ไม่มีกิจกรรม'}
                </div>
                {selectedEvents.length === 0 ? (
                  <div className="bg-white rounded-2xl p-4 text-center text-gray-400 text-[13px] shadow-sm">ว่าง</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedEvents.map(ev => (
                      <div key={ev.id} className={`rounded-2xl p-4 shadow-sm ${isDividendEvent(ev.summary) ? 'bg-green-50' : 'bg-white'}`}>
                        <div className={`text-[14px] font-semibold ${isDividendEvent(ev.summary) ? 'text-green-800' : 'text-gray-900'}`}>
                          {isDividendEvent(ev.summary) ? '💰 ' : '📅 '}{ev.summary}
                        </div>
                        {ev.start.includes('T') && (
                          <div className="text-[12px] text-gray-400 mt-0.5">
                            {new Date(ev.start).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                          </div>
                        )}
                        {ev.description && (
                          <div className="text-[12px] text-gray-500 mt-1">{ev.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* All month events list */}
            {events.filter(e => isDividendEvent(e.summary)).length > 0 && (
              <div className="mx-4 mt-4 mb-4">
                <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">💰 ปันผล/XD เดือนนี้</div>
                <div className="flex flex-col gap-2">
                  {events.filter(e => isDividendEvent(e.summary)).map(ev => (
                    <div key={ev.id} className="bg-green-50 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold text-green-800">{ev.summary}</div>
                        <div className="text-[11px] text-green-600">{formatThaiDate(ev.start)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="h-4" />
          </>
        )}
      </div>
    </div>
  )
}
