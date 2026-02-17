import { useState } from 'react'

export default function Calendar({ events = [], onEventClick, onDateClick }) {
  const [currentDate, setCurrentDate] = useState(new Date())

  // Calendar Logic (Native JS)
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const getFirstDayOfMonth = (date) => {
    // 0 = Sunday, 1 = Monday. 
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay() 
  }

  const daysInMonth = getDaysInMonth(currentDate)
  const firstDay = getFirstDayOfMonth(currentDate)
  
  // Standardize on Monday start for business calendar
  // If firstDay is 0 (Sunday), offset is 6. If 1 (Monday), offset is 0.
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

    // Next month filler - Ensure 6 rows (42 cells) for consistent height
    const totalSlots = 42 
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
    <div className="calendar">
        {/* Header */}
        <div className="calendar-header">
            <h2 className="calendar-title">
                {monthNames[currentDate.getMonth()]} <span className="calendar-year">{currentDate.getFullYear()}</span>
            </h2>
            <div className="calendar-controls">
                <button 
                    onClick={() => changeMonth(-1)}
                    className="calendar-nav-button"
                >
                    <svg className="calendar-nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="calendar-today-button"
                >
                    Today
                </button>
                <button 
                    onClick={() => changeMonth(1)}
                    className="calendar-nav-button"
                >
                    <svg className="calendar-nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>

        {/* Grid Header */}
        <div className="calendar-weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="calendar-weekday">
                    {day}
                </div>
            ))}
        </div>

        {/* Grid Body */}
        <div className="calendar-grid">
            {calendarDays.map((cell, index) => {
                const dayEvents = events.filter(e => {
                    if (!e.startAt) return false;
                    return isSameDay(new Date(e.startAt), cell.date)
                })

                const isToday = isSameDay(cell.date, new Date())

                return (
                    <div 
                        key={index}
                        onClick={() => onDateClick && onDateClick(cell.date)}
                        className={`calendar-cell ${!cell.isCurrentMonth ? 'calendar-cell-muted' : ''}`}
                    >
                        <div className="calendar-cell-top">
                           <div className={`calendar-day ${isToday ? 'calendar-day-today' : 'calendar-day-default'}`}>
                               {cell.day}
                           </div>
                           {dayEvents.length > 0 && (
                             <span className="calendar-event-count">
                               {dayEvents.length}
                             </span>
                           )}
                        </div>

                        {/* Events Stack */}
                        <div className="calendar-event-list custom-scrollbar">
                            {dayEvents.map(event => (
                                <div 
                                    key={event.id}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onEventClick && onEventClick(event)
                                    }}
                                    className="event-pill"
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
