import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (date: string) => void
  placeholder?: string
  className?: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value + 'T00:00:00')
    return new Date()
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // Monday-first: shift Sunday to end
  let startDay = firstDay.getDay() - 1
  if (startDay < 0) startDay = 6
  const daysInMonth = lastDay.getDate()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const selected = value ? new Date(value + 'T00:00:00') : null

  const selectDate = (day: number) => {
    const d = new Date(year, month, day)
    const iso = d.toISOString().split('T')[0]
    onChange(iso)
    setOpen(false)
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const formatDisplay = () => {
    if (!value) return placeholder
    const d = new Date(value + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input text-xs w-full flex items-center gap-2 justify-between"
      >
        <span className={value ? 'text-zinc-200' : 'text-zinc-500'}>{formatDisplay()}</span>
        <Calendar className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-2xl"
          style={{ width: 'min(22rem, calc(100vw - 24px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <span className="text-white text-xs font-semibold">{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-[10px] text-zinc-600 text-center font-medium">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: startDay }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const date = new Date(year, month, day)
              date.setHours(0, 0, 0, 0)
              const isToday = date.getTime() === today.getTime()
              const isSelected = selected && date.getTime() === selected.getTime()
              return (
                <button
                  key={day}
                  onClick={() => selectDate(day)}
                  className={`
                    w-8 h-8 rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? 'bg-[var(--accent)] text-white'
                      : isToday
                        ? 'border border-[var(--accent)] text-[var(--accent)]'
                        : 'text-zinc-400 hover:bg-[var(--bg-elevated)] hover:text-white'
                    }
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <button
            onClick={() => {
              const t = new Date(); t.setHours(0,0,0,0)
              selectDate(t.getDate())
              setViewDate(t)
            }}
            className="mt-2 w-full text-[10px] text-zinc-500 hover:text-[var(--accent)] text-center transition-colors"
          >
            Today
          </button>
        </div>
      )}
    </div>
  )
}
