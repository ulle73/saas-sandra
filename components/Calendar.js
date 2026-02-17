import { useState } from 'react'

export default function Calendar({ events = [], onEventClick, onDateClick }) {
  const [currentDate, setCurrentDate] = useState(new Date())

  // Calendar Logic (Native JS)
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const getFirstDayOfMonth = (date) => {
    // 0 = Sunday, 1 = Monday. We want Monday start?
    // Let's assume standard Sunday start for now or adjust to Monday (ISO)
    // getDay() returns 0 for Sunday.
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay() 
  }

  const daysInMonth = getDaysInMonth(currentDate)
  const firstDay = getFirstDayOfMonth(currentDate)
  
  // Adjust for Monday start if desired (Optional: standard 0-6 Sun-Sat is safer for international unless specified)
  // Let's stick to Sunday start for simplicity, or we can shift.
  // Actually, Sweden/Europe uses Monday. Let's do Monday start.
  // if day is 0 (Sun), it becomes 6. 1 (Mon) becomes 0.
  const startOffset = firstDay === 0 ? 6 : firstDay - 1 

  const prevMonthDays = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate()

  const generateDays = () => {
    const days = []
    
    // Previous month filler
    for (let i = 0; i < startOffset; i++) {
        days.push({
            day: prevMonthDays - startOffset + i + 1,
            isCurrentMonth: false,
            date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, prevMonthDays - startOffset + i + 1)
        })
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
        days.push({
            day: i,
            isCurrentMonth: true,
            date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i)
        })
    }

    // Next month filler
    const totalSlots = 42 // 6 rows * 7 cols
    const remaining = totalSlots - days.length
    for (let i = 1; i <= remaining; i++) {
        days.push({
            day: i,
            isCurrentMonth: false,
            date: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, i)
        })
    }

    return days
  }

  const calendarDays = generateDays()

  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))
  }

  const isSameDay = (d1, d2) => {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate()
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  return (
    <div className="flex flex-col h-full bg-transparent">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => changeMonth(-1)}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="text-sm font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                >
                    Today
                </button>
                <button 
                    onClick={() => changeMonth(1)}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>

        {/* Grid Header */}
        <div className="grid grid-cols-7 mb-2 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="text-xs font-bold text-slate-400 uppercase tracking-wider py-2">
                    {day}
                </div>
            ))}
        </div>

        {/* Grid Body */}
        <div className="grid grid-cols-7 gap-1 flex-1 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800">
            {calendarDays.map((cell, index) => {
                const dayEvents = events.filter(e => {
                    if (!e.startAt) return false;
                    return isSameDay(new Date(e.startAt), cell.date)
                })

                return (
                    <div 
                        key={index}
                        onClick={() => onDateClick && onDateClick(cell.date)}
                        className={`
                            min-h-[100px] p-2 flex flex-col gap-1 transition-colors cursor-pointer
                            ${cell.isCurrentMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-950/50'}
                            hover:bg-blue-50 dark:hover:bg-slate-800/50
                        `}
                    >
                        <div className={`
                            text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                            ${isSameDay(cell.date, new Date()) 
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
                                : cell.isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}
                        `}>
                            {cell.day}
                        </div>

                        {/* Events Stack */}
                        <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px]">
                            {dayEvents.map(event => (
                                <div 
                                    key={event.id}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onEventClick && onEventClick(event)
                                    }}
                                    className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border-l-2 border-blue-500 truncate hover:brightness-95 transition-all"
                                    title={event.title}
                                >
                                    {event.title}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    </div>
  )
}
