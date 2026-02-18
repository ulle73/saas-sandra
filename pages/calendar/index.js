import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function CalendarPage({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const searchTerm = typeof router.query.q === 'string' ? router.query.q.trim().toLowerCase() : ''
  
  // Outlook Sync State
  const [outlookEvents, setOutlookEvents] = useState([])
  const [outlookLoading, setOutlookLoading] = useState(true)
  const [outlookEnabled, setOutlookEnabled] = useState(false)

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    setLoading(false)
    fetchOutlookEvents()
  }, [session, router])

  const fetchOutlookEvents = async () => {
    setOutlookLoading(true)
    try {
      // Fetch data for a wider range to support month views
      const response = await fetch('/api/outlook/events?days=60&limit=200')
      const payload = await response.json()

      if (!response.ok) throw new Error(payload.error || 'Failed to fetch Outlook events')

      setOutlookEnabled(Boolean(payload.enabled))
      setOutlookEvents(payload.events || [])
    } catch (err) {
      console.error('Outlook sync error:', err)
      setOutlookEnabled(false)
    } finally {
      setOutlookLoading(false)
    }
  }

  const daysInMonth = (month, year) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = (month, year) => {
    const d = new Date(year, month, 1).getDay()
    // Convert to Monday start (0=Mon, 6=Sun) if preferred, but design uses Sun start
    return d 
  }

  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate()
  }

  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))
  }

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return outlookEvents

    return outlookEvents.filter((event) => {
      const haystack = [
        event.title,
        event.location,
        event.organizer,
        event.organizerEmail,
        ...(event.attendeeEmails || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(searchTerm)
    })
  }, [outlookEvents, searchTerm])

  const currentMonthEvents = useMemo(() => {
    return filteredEvents.filter(event => {
      const start = event.startAt ? new Date(event.startAt) : null
      if (!start) return false
      return start.getMonth() === currentDate.getMonth() && start.getFullYear() === currentDate.getFullYear()
    })
  }, [filteredEvents, currentDate])

  const upcomingAgenda = useMemo(() => {
    const now = new Date()
    return filteredEvents
      .filter(e => e.startAt && new Date(e.startAt) >= now)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .slice(0, 5)
  }, [filteredEvents])

  const renderCalendarDays = () => {
    const month = currentDate.getMonth()
    const year = currentDate.getFullYear()
    const totalDays = daysInMonth(month, year)
    const startOffset = firstDayOfMonth(month, year)
    
    const cells = []
    
    // Empty cells for the start of the month
    for (let i = 0; i < startOffset; i++) {
       cells.push(<div key={`empty-${i}`} className="min-h-[120px] border-r border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"></div>)
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
      const cellDate = new Date(year, month, d)
      const isToday = isSameDay(cellDate, new Date())
      const dayEvents = filteredEvents.filter(e => e.startAt && isSameDay(new Date(e.startAt), cellDate))

      cells.push(
        <div key={d} className={`min-h-[120px] border-r border-b border-slate-100 dark:border-slate-800 p-3 group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isToday ? 'bg-primary/[0.02] dark:bg-primary/5' : ''}`}>
           <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500'}`}>
             {d}
           </span>
           <div className="mt-2 flex flex-col gap-1.5">
             {dayEvents.map(e => (
               <div key={e.id} className="px-2 py-1 border-l-2 border-primary rounded text-[10px] font-black uppercase tracking-tight truncate cursor-pointer transition-transform hover:scale-[1.02] bg-primary/10 text-primary-dark">
                 {e.title}
               </div>
             ))}
           </div>
        </div>
      )
    }

    // Fill the rest of the 7x6 grid
    const totalCells = cells.length
    const remainingCells = 42 - totalCells
    for (let i = 0; i < remainingCells; i++) {
        cells.push(<div key={`empty-end-${i}`} className="min-h-[120px] border-r border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"></div>)
    }

    return cells
  }

  if (loading) return null

  return (
      <div className="flex flex-col lg:flex-row gap-8 h-full">
        {/* Left Sidebar Info */}
        <aside className="w-full lg:w-72 flex flex-col gap-8">
           <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Agenda</h3>
              {searchTerm && (
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Filter: "{searchTerm}" ({currentMonthEvents.length} in month)
                </p>
              )}
              <div className="space-y-4">
                 {outlookLoading ? (
                   <p className="text-xs text-slate-400 animate-pulse font-bold">Laddar agenda...</p>
                 ) : upcomingAgenda.length === 0 ? (
                   <p className="text-xs text-slate-400 font-bold">Inga kommande möten</p>
                 ) : upcomingAgenda.map(event => {
                   const startDate = new Date(event.startAt)
                   const day = startDate.getDate()
                   const monthLabel = startDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
                   const timeLabel = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
                   
                   return (
                    <div key={event.id} className="group cursor-pointer">
                       <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl shrink-0 text-center min-w-[40px] bg-primary/10 text-primary`}>
                             <span className="text-xs font-black block leading-none">{day}</span>
                             <span className="text-[9px] font-black block leading-none mt-1">{monthLabel}</span>
                          </div>
                          <div>
                             <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
                               {event.title}
                             </p>
                             <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{timeLabel}</p>
                             <div className="flex items-center gap-1 mt-1 text-slate-400">
                                <span className="material-symbols-outlined text-[14px]">{event.isOnlineMeeting ? 'videocam' : 'location_on'}</span>
                                <span className="text-[10px] font-medium">{event.location || 'Remote Meeting'}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                 )})}
              </div>
           </div>

           <div className={`mt-auto p-6 rounded-2xl border transition-colors ${outlookEnabled ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-800' : 'bg-primary/[0.03] dark:bg-primary/10 border-primary/10'}`}>
              <div className="flex items-center gap-2 mb-3">
                 <span className={`material-symbols-outlined ${outlookEnabled ? 'text-green-500' : 'text-primary'}`}>cloud_sync</span>
                 <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">{outlookEnabled ? 'Outlook Synced' : 'Sync Status'}</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                 {outlookEnabled 
                   ? 'Dina möten från Outlook synkas automatiskt och visas i kalendern.'
                   : 'Anslut ditt Outlook-konto för att se dina bokningar direkt i vyn.'}
              </p>
           </div>
        </aside>

        {/* Main Calendar Grid */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
           <div className="flex items-center justify-center">
             <div className="flex items-center gap-2">
                <button
                  onClick={() => changeMonth(-1)}
                  className="p-2 text-slate-400 hover:text-primary transition-colors"
                  aria-label="Previous month"
                >
                   <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight min-w-[220px] text-center">
                   {currentDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}
                </h2>
                <button
                  onClick={() => changeMonth(1)}
                  className="p-2 text-slate-400 hover:text-primary transition-colors"
                  aria-label="Next month"
                >
                   <span className="material-symbols-outlined">chevron_right</span>
                </button>
             </div>
           </div>

           <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1">
              <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                 {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                   <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{day}</div>
                 ))}
              </div>
              <div className="grid grid-cols-7 border-l border-slate-100 dark:border-slate-800 relative">
                 {renderCalendarDays()}
                 {outlookLoading && (
                   <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10">
                     <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      </div>
  )
}
