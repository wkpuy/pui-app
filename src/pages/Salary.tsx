import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { SalaryRecord } from '../db'
import { formatCurrency } from '../utils/calculations'
import { Card, SectionLabel } from '../components/Card'

const CURRENT_YEAR = new Date().getFullYear()

export default function Salary() {
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<SalaryRecord | null>(null)
  const [projYears, setProjYears] = useState(10)
  const [growthRate, setGrowthRate] = useState(5)

  const records = useLiveQuery(() => db.salaryRecords.orderBy('year').reverse().toArray())
  const latestRecord = records?.[0]

  function openAdd() { setEditItem(null); setShowForm(true) }
  function openEdit(r: SalaryRecord) { setEditItem(r); setShowForm(true) }

  // Build projection from latest record
  const projectionRows = (() => {
    if (!latestRecord) return []
    const rows = []
    for (let i = 0; i <= projYears; i++) {
      const factor = Math.pow(1 + growthRate / 100, i)
      const salary = latestRecord.baseSalary * factor
      const annual = salary * 12
      const bonus = latestRecord.bonus * factor
      const pvdEmployee = annual * (latestRecord.pvdEmployeeRate / 100)
      const pvdEmployer = annual * (latestRecord.pvdEmployerRate / 100)
      rows.push({
        year: CURRENT_YEAR + i,
        monthlySalary: salary,
        annualIncome: annual + bonus,
        pvdTotal: pvdEmployee + pvdEmployer,
      })
    }
    return rows
  })()

  const totalAnnualIncome = latestRecord
    ? (latestRecord.baseSalary * 12) + latestRecord.bonus
    : 0
  const pvdContrib = latestRecord
    ? (latestRecord.baseSalary * 12) * ((latestRecord.pvdEmployeeRate + latestRecord.pvdEmployerRate) / 100)
    : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">
          ‹
        </button>
        <div className="flex-1 text-[17px] font-bold text-gray-900">เงินเดือน & ความก้าวหน้า</div>
        <button onClick={openAdd} className="bg-indigo-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl active:scale-95">
          ＋ เพิ่มปี
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Current year summary */}
        {latestRecord && (
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 py-5 text-white">
            <div className="text-xs opacity-75 mb-1">ปี {latestRecord.year}</div>
            <div className="text-3xl font-bold mb-1">{formatCurrency(latestRecord.baseSalary)}<span className="text-base font-normal opacity-75">/เดือน</span></div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-white/15 rounded-xl p-2 text-center">
                <div className="text-[11px] opacity-75">รายได้รวม/ปี</div>
                <div className="text-[13px] font-bold">{formatCurrency(totalAnnualIncome, 0)}</div>
              </div>
              <div className="bg-white/15 rounded-xl p-2 text-center">
                <div className="text-[11px] opacity-75">โบนัส</div>
                <div className="text-[13px] font-bold">{formatCurrency(latestRecord.bonus, 0)}</div>
                <div className="text-[10px] opacity-75">{(latestRecord.bonus / latestRecord.baseSalary).toFixed(2)} เดือน</div>
              </div>
              <div className="bg-white/15 rounded-xl p-2 text-center">
                <div className="text-[11px] opacity-75">กองทุนสำรอง/ปี</div>
                <div className="text-[13px] font-bold">{formatCurrency(pvdContrib, 0)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Salary history */}
        {records && records.length > 0 && (
          <>
            <SectionLabel>ประวัติเงินเดือน</SectionLabel>
            <div className="mx-4 bg-white rounded-2xl overflow-hidden shadow-sm">
              {records.map((r, idx) => {
                const prevRecord = records[idx + 1]
                const increaseAmt = prevRecord ? r.baseSalary - prevRecord.baseSalary : null
                const increasePct = prevRecord && prevRecord.baseSalary > 0 ? (increaseAmt! / prevRecord.baseSalary) * 100 : null
                const bonusMonths = r.baseSalary > 0 ? r.bonus / r.baseSalary : 0
                return (
                  <div key={r.id}>
                    {idx > 0 && <div className="h-px bg-gray-50 mx-4" />}
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <div>
                        <div className="text-[15px] font-semibold text-gray-900">ปี {r.year}</div>
                        <div className="text-[12px] text-gray-400">
                          โบนัส {formatCurrency(r.bonus)} ({bonusMonths.toFixed(2)} เดือน) · PVD {r.pvdEmployeeRate + r.pvdEmployerRate}%
                        </div>
                        {increasePct !== null && (
                          <div className={`text-[11px] font-semibold mt-0.5 ${increaseAmt! > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {increaseAmt! > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(increaseAmt!))} ({Math.abs(increasePct!).toFixed(1)}%)
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[15px] font-bold text-indigo-600">{formatCurrency(r.baseSalary)}</div>
                          <div className="text-[11px] text-gray-400">/เดือน</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[13px] active:scale-95">✏️</button>
                          <button onClick={() => { if (confirm('ลบรายการนี้?')) db.salaryRecords.delete(r.id!) }}
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-[13px] active:scale-95">🗑️</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Projection settings */}
        {latestRecord && (
          <>
            <SectionLabel>คาดการณ์อนาคต</SectionLabel>
            <div className="mx-4">
              <Card>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="flex justify-between text-[13px] font-semibold text-gray-700 mb-1">
                      <span>อัตราเพิ่มเงินเดือน/ปี</span>
                      <span className="text-indigo-600">{growthRate}%</span>
                    </div>
                    <input type="range" min={0} max={20} step={0.5} value={growthRate}
                      onChange={e => setGrowthRate(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[13px] font-semibold text-gray-700 mb-1">
                      <span>จำนวนปีที่คาดการณ์</span>
                      <span className="text-indigo-600">{projYears} ปี</span>
                    </div>
                    <input type="range" min={1} max={35} step={1} value={projYears}
                      onChange={e => setProjYears(parseInt(e.target.value))}
                      className="w-full accent-indigo-600" />
                  </div>
                </div>
              </Card>
            </div>

            {/* PVD cumulative summary */}
            {projectionRows.length > 0 && (() => {
              const totalPvd = projectionRows.reduce((s, r) => s + r.pvdTotal, 0)
              return (
                <div className="mx-4 mb-3">
                  <div className="bg-indigo-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[12px] text-indigo-600 font-semibold">PVD สะสมรวม {projYears} ปี</div>
                      <div className="text-[11px] text-indigo-400 mt-0.5">พนักงาน + บริษัทสมทบ (ไม่รวมผลตอบแทน)</div>
                    </div>
                    <div className="text-[20px] font-bold text-indigo-700">{formatCurrency(totalPvd, 0)}</div>
                  </div>
                </div>
              )
            })()}

            {/* Projection table */}
            <div className="mx-4 mt-3 mb-4">
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-4 gap-1 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <div className="text-[11px] font-bold text-gray-500">ปี</div>
                  <div className="text-[11px] font-bold text-gray-500 text-right">เงินเดือน</div>
                  <div className="text-[11px] font-bold text-gray-500 text-right">รายได้/ปี</div>
                  <div className="text-[11px] font-bold text-gray-500 text-right">PVD/ปี</div>
                </div>
                {projectionRows.map((row, idx) => (
                  <div key={row.year}
                    className={`grid grid-cols-4 gap-1 px-4 py-2.5 ${idx < projectionRows.length - 1 ? 'border-b border-gray-50' : ''} ${idx === 0 ? 'bg-indigo-50' : ''}`}
                  >
                    <div className={`text-[13px] font-semibold ${idx === 0 ? 'text-indigo-700' : 'text-gray-700'}`}>{row.year}</div>
                    <div className="text-[13px] text-right font-medium text-gray-800">{formatCurrency(row.monthlySalary, 0)}</div>
                    <div className="text-[13px] text-right font-semibold text-green-600">{formatCurrency(row.annualIncome, 0)}</div>
                    <div className="text-[13px] text-right text-indigo-600">{formatCurrency(row.pvdTotal, 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!latestRecord && (
          <div className="text-center py-16 text-gray-400 px-8">
            <div className="text-5xl mb-4">💼</div>
            <div className="font-semibold text-gray-600 mb-4">ยังไม่มีข้อมูลเงินเดือน</div>
            <button onClick={openAdd} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-semibold active:scale-95">
              เพิ่มข้อมูลเงินเดือน
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>

      {showForm && <SalaryForm editItem={editItem} prevSalary={editItem ? undefined : latestRecord?.baseSalary} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function SalaryForm({ editItem, prevSalary, onClose }: { editItem: SalaryRecord | null; prevSalary?: number; onClose: () => void }) {
  const [form, setForm] = useState({
    year: editItem?.year?.toString() ?? CURRENT_YEAR.toString(),
    baseSalary: editItem?.baseSalary?.toString() ?? '',
    salaryIncreaseAmt: '',
    bonus: editItem?.bonus?.toString() ?? '0',
    pvdEmployeeRate: editItem?.pvdEmployeeRate?.toString() ?? '5',
    pvdEmployerRate: editItem?.pvdEmployerRate?.toString() ?? '5',
    notes: editItem?.notes ?? '',
  })

  async function save() {
    if (!form.baseSalary) return
    const data = {
      year: parseInt(form.year),
      baseSalary: parseFloat(form.baseSalary),
      bonus: parseFloat(form.bonus) || 0,
      pvdEmployeeRate: parseFloat(form.pvdEmployeeRate) || 0,
      pvdEmployerRate: parseFloat(form.pvdEmployerRate) || 0,
      notes: form.notes || undefined,
    }
    if (editItem?.id) {
      await db.salaryRecords.update(editItem.id, data)
    } else {
      await db.salaryRecords.add(data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-5 pb-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">{editItem ? 'แก้ไข' : 'เพิ่ม'}ข้อมูลเงินเดือน</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">ปี</div>
          <input type="number" value={form.year}
            onChange={e => setForm(v => ({ ...v, year: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>

        {/* Salary increase input (only when adding new with prev salary) */}
        {!editItem && prevSalary ? (
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">เงินเดือนที่ขึ้น (บาท)</div>
            <input type="number" placeholder={`เงินเดือนปัจจุบัน ${formatCurrency(prevSalary)}`} value={form.salaryIncreaseAmt}
              onChange={e => {
                const inc = parseFloat(e.target.value) || 0
                setForm(v => ({
                  ...v,
                  salaryIncreaseAmt: e.target.value,
                  baseSalary: inc > 0 ? String(prevSalary + inc) : v.baseSalary,
                }))
              }}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
            {form.salaryIncreaseAmt && parseFloat(form.salaryIncreaseAmt) > 0 && (
              <div className="text-[11px] text-green-600 font-semibold mt-1 ml-1">
                = {((parseFloat(form.salaryIncreaseAmt) / prevSalary) * 100).toFixed(2)}% จาก {formatCurrency(prevSalary)}
              </div>
            )}
          </div>
        ) : null}

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">เงินเดือนฐาน (บาท/เดือน)</div>
          <input type="number" value={form.baseSalary}
            onChange={e => setForm(v => ({ ...v, baseSalary: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        </div>

        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">โบนัสประจำปี (บาท)</div>
          <input type="number" value={form.bonus}
            onChange={e => setForm(v => ({ ...v, bonus: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
          {form.bonus && form.baseSalary && parseFloat(form.baseSalary) > 0 && (
            <div className="text-[11px] text-indigo-600 font-semibold mt-1 ml-1">
              = {(parseFloat(form.bonus) / parseFloat(form.baseSalary)).toFixed(2)} เดือน
            </div>
          )}
        </div>

        <div className="text-[12px] font-semibold text-gray-500 mb-0">กองทุนสำรองเลี้ยงชีพ (PVD)</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">ส่วนพนักงาน %</div>
            <input type="number" value={form.pvdEmployeeRate}
              onChange={e => setForm(v => ({ ...v, pvdEmployeeRate: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">ส่วนนายจ้าง %</div>
            <input type="number" value={form.pvdEmployerRate}
              onChange={e => setForm(v => ({ ...v, pvdEmployerRate: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full" />
          </div>
        </div>
        <input placeholder="หมายเหตุ" value={form.notes}
          onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm w-full" />
        <button onClick={save} className="bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[15px] active:scale-95 mt-2">
          บันทึก
        </button>
      </div>
    </div>
  )
}

// Utility used by Finance page, keep it consistent
export { CURRENT_YEAR }
