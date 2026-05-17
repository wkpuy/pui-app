import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { fetchCalendarEvents, parseDividendEvents } from '../api/google'
import type { ParsedDividendEvent } from '../api/google'
import { formatCurrency } from '../utils/calculations'

interface CalEvent {
  id: string
  summary: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  description?: string
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function eventDateStr(e: CalEvent): string {
  return e.start?.date ?? e.start?.dateTime?.slice(0, 10) ?? ''
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatThaiDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${THAI_DAYS[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`
}

export default function Calendar() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [dividendEvents, setDividendEvents] = useState<ParsedDividendEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(new Date())
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState<string | null>(null)

  const tokens = useLiveQuery(() => db.googleTokens.toArray().then(r => r[0]))
  const investments = useLiveQuery(() => db.investments.toArray())
  const existingDividends = useLiveQuery(() => db.dividends.toArray())

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
      setDividendEvents(parseDividendEvents(raw))
    } catch (e: any) {
      setError(e.message ?? 'ไม่สามารถโหลดปฏิทินได้')
    } finally {
      setLoading(false)
    }
  }

  // Auto-sync dividend from a calendar event to Investment dividend history
  async function syncDividendToHistory(ev: ParsedDividendEvent) {
    if (!investments) return
    setSyncing(ev.date + ev.ticker)

    try {
      // Match by ticker (case-insensitive, strip .BK suffix)
      const tickerClean = ev.ticker.replace(/\.BK$/i, '').toUpperCase()
      const inv = investments.find(i => {
        const t = (i.ticker ?? i.name).replace(/\.BK$/i, '').toUpperCase()
        return t === tickerClean
      })

      if (!inv?.id) {
        alert(`ไม่พบหุ้น "${ev.ticker}" ในรายการลงทุน\nกรุณาเพิ่มหุ้นนี้ในหน้าลงทุนก่อน`)
        return
      }

      // Check duplicate (same investmentId + date)
      const duplicate = existingDividends?.find(
        d => d.investmentId === inv.id && d.date === ev.date
      )
      if (duplicate) {
        alert(`มีข้อมูลปันผลของ ${ev.ticker} วันที่ ${ev.date} อยู่แล้ว`)
        return
      }

      await db.dividends.add({
        investmentId: inv.id,
        date: ev.date,
        amountPerShare: ev.amountPerShare,
        totalReceived: ev.totalReceived,
        notes: `sync จาก Google Calendar: ${ev.title}`,
      })

      // Mark as hasDividend if not already
      if (!inv.hasDividend) {
        await db.investments.update(inv.id, { hasDividend: true })
      }

      setSyncedIds(prev => new Set([...prev, ev.date + ev.ticker]))
    } finally {
      setSyncing(null)
    }
  }

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)) }

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
    return events.filter(e => eventDateStr(e).startsWith(ds))
  }

  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate())
  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : []
  function isDividendEvent(summary: string) {
    return /^\[[A-Z0-9-]+\].*(ปันผล|XD)/i.test(summary)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="ปฏิทิน" />
      <div className="flex-1 overflow-y-auto">

        {!tokens?.accessToken ? (
          <div className="text-center py-16 px-8 text-gray-400">
            <div className="text-5xl mb-4">📅</div>
            <div className="font-semibold text-gray-600 mb-2">ยังไม่ได้เชื่อมต่อ Google</div>
            <div className="text-[13px]">ไปที่ Settings → เชื่อมต่อ Google</div>
          </div>
        ) : (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 text-lg">‹</button>
              <div className="text-[16px] font-bold text-gray-900">
                {THAI_MONTHS[month]} {year + 543}
              </div>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 text-lg">›</button>
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
                    if (!d) return <div key={ci} className="h-12 border-b border-r border-gray-50 last:border-r-0" />
                    const ds = dayStr(d)
                    const dayEvs = eventsForDay(d)
                    const hasDivEv = dayEvs.some(e => isDividendEvent(e.summary))
                    const hasOtherEv = dayEvs.some(e => !isDividendEvent(e.summary))
                    const isToday = ds === today
                    const isSelected = selectedDay === d
                    return (
                      <button
                        key={ci}
                        onClick={() => setSelectedDay(isSelected ? null : d)}
                        className={`h-12 border-b border-r border-gray-50 last:border-r-0 flex flex-col items-center justify-start pt-1 active:bg-indigo-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                      >
                        <span className={`text-[13px] font-semibold w-7 h-7 flex items-center justify-center rounded-full leading-none ${
                          isToday ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-700' : 'text-gray-700'
                        }`}>
                          {d}
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {hasDivEv && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                          {hasOtherEv && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {loading && <div className="text-center py-4 text-[13px] text-indigo-500">⏳ กำลังโหลด...</div>}
            {error && <div className="mx-4 mt-3 bg-red-50 rounded-xl p-3 text-[13px] text-red-600">{error}</div>}

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
                    {selectedEvents.map(ev => {
                      const ds = eventDateStr(ev)
                      const parsed = dividendEvents.find(p => p.date === ds && ev.summary.includes(`[${p.ticker}]`))
                      const isDivEv = isDividendEvent(ev.summary)
                      const syncKey = parsed ? parsed.date + parsed.ticker : ''
                      const alreadySynced = syncedIds.has(syncKey)
                      const isSyncing = syncing === syncKey

                      return (
                        <div key={ev.id} className={`rounded-2xl p-4 shadow-sm ${isDivEv ? 'bg-green-50' : 'bg-white'}`}>
                          <div className={`text-[14px] font-bold mb-1 ${isDivEv ? 'text-green-800' : 'text-gray-900'}`}>
                            {isDivEv ? '💰 ' : '📅 '}{ev.summary}
                          </div>

                          {/* Dividend details */}
                          {parsed && parsed.totalReceived > 0 && (
                            <div className="mt-2 bg-white rounded-xl p-3 border border-green-100">
                              <div className="grid grid-cols-2 gap-y-1.5 text-[13px]">
                                <div className="text-gray-500">หุ้น</div>
                                <div className="font-bold text-gray-900">{parsed.ticker}</div>
                                {parsed.shares > 0 && <>
                                  <div className="text-gray-500">จำนวนถือ</div>
                                  <div className="font-semibold">{parsed.shares.toLocaleString()} หุ้น</div>
                                </>}
                                <div className="text-gray-500">ปันผล/หุ้น</div>
                                <div className="font-semibold">{parsed.amountPerShare} บาท</div>
                                <div className="text-gray-500">รับรวม</div>
                                <div className="font-bold text-green-700">{formatCurrency(parsed.totalReceived)}</div>
                                <div className="text-gray-500">ประเภท</div>
                                <div className="font-semibold">
                                  {parsed.eventType === 'xd' ? '🏷️ XD' : '💵 จ่ายปันผล'}
                                </div>
                              </div>

                              {/* Sync button — only for dividend payment events */}
                              {parsed.eventType === 'dividend' && (
                                <button
                                  onClick={() => syncDividendToHistory(parsed)}
                                  disabled={alreadySynced || isSyncing}
                                  className={`mt-3 w-full py-2 rounded-xl text-[13px] font-bold active:scale-95 transition-all ${
                                    alreadySynced
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-green-600 text-white active:bg-green-700'
                                  } disabled:opacity-60`}
                                >
                                  {alreadySynced ? '✅ บันทึกแล้ว' : isSyncing ? '⏳ กำลังบันทึก...' : '+ บันทึกเข้าประวัติปันผล'}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Regular event time */}
                          {!parsed && ev.start?.dateTime && (
                            <div className="text-[12px] text-gray-400 mt-0.5">
                              {new Date(ev.start.dateTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Month dividend summary */}
            {dividendEvents.length > 0 && (
              <div className="mx-4 mt-4 mb-2">
                <div className="text-[13px] font-bold text-gray-500 mb-2 px-1">
                  💰 ปันผล/XD เดือนนี้ ({dividendEvents.length} รายการ)
                </div>
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  {dividendEvents.map((ev, idx) => {
                    const syncKey = ev.date + ev.ticker
                    const alreadySynced = syncedIds.has(syncKey)
                    const isSyncing = syncing === syncKey
                    return (
                      <div key={syncKey}
                        className={`px-4 py-3 ${idx < dividendEvents.length - 1 ? 'border-b border-gray-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                                ev.eventType === 'xd' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {ev.eventType === 'xd' ? 'XD' : 'ปันผล'}
                              </span>
                              <span className="text-[14px] font-bold text-gray-900">{ev.ticker}</span>
                              <span className="text-[12px] text-gray-400">{formatThaiDate(ev.date)}</span>
                            </div>
                            {ev.totalReceived > 0 && (
                              <div className="text-[13px] text-gray-600 mt-0.5">
                                {ev.amountPerShare} บาท/หุ้น · รับ <span className="font-bold text-green-600">{formatCurrency(ev.totalReceived)}</span>
                              </div>
                            )}
                          </div>
                          {ev.eventType === 'dividend' && ev.totalReceived > 0 && (
                            <button
                              onClick={() => syncDividendToHistory(ev)}
                              disabled={alreadySynced || isSyncing}
                              className={`flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-xl active:scale-95 ${
                                alreadySynced ? 'bg-green-50 text-green-600' : 'bg-green-600 text-white'
                              } disabled:opacity-60`}
                            >
                              {alreadySynced ? '✅ บันทึก' : isSyncing ? '⏳' : '+ บันทึก'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {/* Total received this month */}
                  {dividendEvents.filter(e => e.eventType === 'dividend').length > 0 && (
                    <div className="px-4 py-3 bg-green-50 flex justify-between items-center">
                      <span className="text-[13px] font-semibold text-green-700">รวมรับปันผลเดือนนี้</span>
                      <span className="text-[15px] font-bold text-green-700">
                        {formatCurrency(dividendEvents.filter(e => e.eventType === 'dividend').reduce((s, e) => s + e.totalReceived, 0))}
                      </span>
                    </div>
                  )}
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
