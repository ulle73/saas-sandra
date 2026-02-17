import { useEffect, useMemo, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function startOfWeek(inputDate) {
  const date = new Date(inputDate)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayOffset)
  return date
}

function addDays(inputDate, amount) {
  return new Date(inputDate.getTime() + amount * DAY_MS)
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

function inWeek(date, weekStart) {
  const weekEnd = addDays(weekStart, 7)
  return date >= weekStart && date < weekEnd
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatWeekRange(weekStart, locale = 'sv-SE') {
  const weekEnd = addDays(weekStart, 6)
  const startMonth = weekStart.toLocaleDateString(locale, { month: 'short' })
  const endMonth = weekEnd.toLocaleDateString(locale, { month: 'short' })
  const year = weekEnd.getFullYear()
  if (startMonth === endMonth) {
    return `${weekStart.getDate()}-${weekEnd.getDate()} ${startMonth} ${year}`
  }
  return `${weekStart.getDate()} ${startMonth} - ${weekEnd.getDate()} ${endMonth} ${year}`
}

function formatTime(startDate, isAllDay, locale = 'sv-SE') {
  if (isAllDay) return 'Heldag'
  return startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function normalizeEvents(events) {
  return (events || []).map((event, index) => ({
    ...event,
    id: event.id || `event-${index}`,
  }))
}

export default function WeekBookingBoard({ events = [] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [localEvents, setLocalEvents] = useState(() => normalizeEvents(events))
  const [dragEventId, setDragEventId] = useState('')

  useEffect(() => {
    setLocalEvents(normalizeEvents(events))
  }, [events])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  )

  const groupedByDay = useMemo(() => {
    const byDay = new Map()
    weekDays.forEach((day) => byDay.set(dayKey(day), []))

    localEvents.forEach((event) => {
      const start = toDate(event.startAt)
      if (!start || !inWeek(start, weekStart)) return
      const key = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate()))
      if (!byDay.has(key)) return
      byDay.get(key).push(event)
    })

    for (const value of byDay.values()) {
      value.sort((a, b) => {
        const aStart = toDate(a.startAt)?.getTime() || 0
        const bStart = toDate(b.startAt)?.getTime() || 0
        return aStart - bStart
      })
    }

    return byDay
  }, [localEvents, weekDays, weekStart])

  const weekEventCount = useMemo(() => {
    return weekDays.reduce((total, day) => total + (groupedByDay.get(dayKey(day))?.length || 0), 0)
  }, [groupedByDay, weekDays])

  const outsideWeekCount = useMemo(() => {
    return localEvents.filter((event) => {
      const start = toDate(event.startAt)
      if (!start) return true
      return !inWeek(start, weekStart)
    }).length
  }, [localEvents, weekStart])

  const moveEventToDay = (eventId, targetDay) => {
    setLocalEvents((current) => current.map((event) => {
      if (event.id !== eventId) return event

      const currentStart = toDate(event.startAt)
      const currentEnd = toDate(event.endAt)

      const nextStart = new Date(targetDay)
      if (currentStart) {
        nextStart.setHours(
          currentStart.getHours(),
          currentStart.getMinutes(),
          currentStart.getSeconds(),
          currentStart.getMilliseconds()
        )
      } else {
        nextStart.setHours(9, 0, 0, 0)
      }

      let nextEnd = null
      if (currentStart && currentEnd && currentEnd > currentStart) {
        const duration = currentEnd.getTime() - currentStart.getTime()
        nextEnd = new Date(nextStart.getTime() + duration)
      } else if (currentStart) {
        nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000)
      }

      return {
        ...event,
        startAt: nextStart.toISOString(),
        endAt: nextEnd ? nextEnd.toISOString() : event.endAt,
      }
    }))
  }

  const handleDropToDay = (targetDay) => {
    if (!dragEventId) return
    moveEventToDay(dragEventId, targetDay)
    setDragEventId('')
  }

  const today = new Date()

  return (
    <section className="week-board">
      <div className="week-board-top">
        <div>
          <p className="week-board-title">Veckoplanering</p>
          <p className="week-board-meta">
            {formatWeekRange(weekStart)} · {weekEventCount} bokningar i veckan
          </p>
        </div>

        <div className="week-board-controls">
          <button type="button" className="btn-secondary week-nav-btn" onClick={() => setWeekStart((current) => addDays(current, -7))}>
            Föregående
          </button>
          <button type="button" className="btn-secondary week-nav-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Denna vecka
          </button>
          <button type="button" className="btn-secondary week-nav-btn" onClick={() => setWeekStart((current) => addDays(current, 7))}>
            Nästa
          </button>
        </div>
      </div>

      <div className="week-day-chip-row">
        {weekDays.map((day) => {
          const count = groupedByDay.get(dayKey(day))?.length || 0
          return (
            <div key={dayKey(day)} className={`week-day-chip ${isSameDay(day, today) ? 'is-today' : ''}`}>
              <span className="week-day-chip-name">{day.toLocaleDateString('sv-SE', { weekday: 'short' })}</span>
              <span className="week-day-chip-date">{day.getDate()}</span>
              <span className="week-day-chip-count">{count}</span>
            </div>
          )
        })}
      </div>

      <div className="week-board-grid custom-scrollbar">
        {weekDays.map((day) => {
          const eventsForDay = groupedByDay.get(dayKey(day)) || []
          return (
            <section
              key={dayKey(day)}
              className={`week-column ${isSameDay(day, today) ? 'is-today' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropToDay(day)}
            >
              <header className="week-column-header">
                <p className="week-column-title">{day.toLocaleDateString('sv-SE', { weekday: 'long' })}</p>
                <span className="badge badge-confidence-medium">{eventsForDay.length}</span>
              </header>

              <div className="week-column-body">
                {eventsForDay.length === 0 ? (
                  <p className="week-column-empty">Inga bokningar</p>
                ) : (
                  eventsForDay.map((event) => {
                    const start = toDate(event.startAt) || day
                    return (
                      <article
                        key={event.id}
                        className={`week-card ${dragEventId === event.id ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={() => setDragEventId(event.id)}
                        onDragEnd={() => setDragEventId('')}
                      >
                        <p className="week-card-time">{formatTime(start, event.isAllDay)}</p>
                        <p className="week-card-title">{event.title || '(No title)'}</p>
                        {event.location ? <p className="week-card-meta">{event.location}</p> : null}
                        <div className="week-card-footer">
                          <span className="week-card-owner">{event.organizer || 'Outlook event'}</span>
                          {event.webLink ? (
                            <a href={event.webLink} target="_blank" rel="noopener noreferrer" className="inline-link small-copy">
                              Öppna
                            </a>
                          ) : null}
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>

      <p className="week-board-footnote">
        Dra kort mellan dagar för planering i vyn. {outsideWeekCount > 0 ? `${outsideWeekCount} event ligger utanför vald vecka.` : 'Alla visade event ligger i vald vecka.'}
      </p>
    </section>
  )
}
