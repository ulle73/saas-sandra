import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { BentoGrid, BentoItem } from '../../components/BentoGrid'
import KPICard from '../../components/KPICard'
import { computeContactStatus } from '../../lib/contactStatus'
import { buildOutlookSyncPlan } from '../../lib/outlookSync'

export default function Dashboard({ session, theme, toggleTheme }) {
  const router = useRouter()
  const searchTerm = typeof router.query.q === 'string' ? router.query.q.trim().toLowerCase() : ''
  // Stats state
  const [stats, setStats] = useState({ green: 0, yellow: 0, red: 0, total: 0 })
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)

  // Outlook Sync State
  const [outlookEvents, setOutlookEvents] = useState([])
  const [unmatchedEvents, setUnmatchedEvents] = useState([])
  const [outlookLoading, setOutlookLoading] = useState(true)
  const [outlookEnabled, setOutlookEnabled] = useState(false)
  const [outlookConnectionType, setOutlookConnectionType] = useState('none')
  const [outlookAccount, setOutlookAccount] = useState(null)
  const [outlookError, setOutlookError] = useState('')
  const [outlookActionLoading, setOutlookActionLoading] = useState(false)

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchStats()
    fetchOutlookEvents()
  }, [session, router])

  const fetchStats = async () => {
    try {
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('last_touchpoint, next_activity')
        .eq('user_id', session.user.id)

      if (contactsError) throw contactsError

      const counts = { green: 0, yellow: 0, red: 0, total: contacts?.length || 0 }
      contacts?.forEach((contact) => {
        const status = computeContactStatus(contact)
        counts[status] += 1
      })
      setStats(counts)

      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, type, timestamp, contacts(name)')
        .eq('user_id', session.user.id)
        .order('timestamp', { ascending: false })
        .limit(5)

      if (activitiesError) throw activitiesError
      setRecentActivity(activities || [])
    } catch (fetchError) {
      console.error('Error fetching stats:', fetchError)
    } finally {
      setLoading(false)
    }
  }

  // --- Outlook Logic (simplified for brevity, keeping existing functionality) ---
  const loadContactsForOutlookSync = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, user_id, name, email, last_touchpoint, next_activity')
      .eq('user_id', session.user.id)
      .order('name')
    if (error) throw error
    return data || []
  }

  const getAccessToken = async () => {
    if (session?.access_token) return session.access_token
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || null
  }

  const fetchOutlookEvents = async () => {
    setOutlookLoading(true)
    setOutlookError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        setOutlookEnabled(false)
        setOutlookConnectionType('none')
        setOutlookAccount(null)
        setOutlookEvents([])
        setUnmatchedEvents([])
        return
      }

      const response = await fetch('/api/outlook/events?days=40&limit=100', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const raw = await response.text()
      let payload = {}
      try { payload = JSON.parse(raw) } catch { payload = { error: 'Invalid JSON' } }

      if (!response.ok) throw new Error(payload.error || 'Failed to fetch Outlook events')

      setOutlookEnabled(Boolean(payload.enabled))
      setOutlookConnectionType(payload.connectionType || 'none')
      setOutlookAccount(payload.account || null)
      setOutlookEvents(payload.events || [])

      if (payload.enabled) {
        const contacts = await loadContactsForOutlookSync()
        const plan = buildOutlookSyncPlan(payload.events || [], contacts)
        setUnmatchedEvents(plan.unmatchedEvents)
      } else {
        setUnmatchedEvents([])
      }

      if (payload.needsReconnect) {
        setOutlookError('Outlook-anslutningen gick ut. Anslut kontot igen.')
      }
    } catch (err) {
      console.error('Outlook sync error:', err)
      setOutlookEnabled(false)
      setOutlookConnectionType('none')
      setOutlookAccount(null)
      setUnmatchedEvents([])
      setOutlookError(err.message || 'Kunde inte synka Outlook just nu.')
    } finally {
      setOutlookLoading(false)
    }
  }

  const connectOutlook = async () => {
    setOutlookActionLoading(true)
    setOutlookError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('Du är inte inloggad. Logga in igen och försök på nytt.')
      }

      const response = await fetch('/api/outlook/connect-url', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/dashboard' }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Kunde inte starta Outlook-inloggningen.')
      }

      window.location.assign(payload.url)
      return
    } catch (err) {
      setOutlookError(err.message || 'Kunde inte ansluta Outlook just nu.')
      setOutlookActionLoading(false)
    }
  }

  const disconnectOutlook = async () => {
    setOutlookActionLoading(true)
    setOutlookError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('Du är inte inloggad. Logga in igen och försök på nytt.')
      }

      const response = await fetch('/api/outlook/connection', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Kunde inte koppla från Outlook.')
      }

      setOutlookEnabled(false)
      setOutlookConnectionType('none')
      setOutlookAccount(null)
      setOutlookEvents([])
      setUnmatchedEvents([])
    } catch (err) {
      setOutlookError(err.message || 'Kunde inte koppla från Outlook just nu.')
    } finally {
      setOutlookActionLoading(false)
    }
  }

  const filteredOutlookEvents = useMemo(() => {
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

  const filteredRecentActivity = useMemo(() => {
    if (!searchTerm) return recentActivity

    return recentActivity.filter((activity) => {
      const contactName = activity.contacts?.name || ''
      const haystack = `${contactName} ${activity.type}`.toLowerCase()
      return haystack.includes(searchTerm)
    })
  }, [recentActivity, searchTerm])

  const outlookSummary = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday)
    endOfToday.setDate(endOfToday.getDate() + 1)

    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const weekStart = new Date(startOfToday)
    weekStart.setDate(weekStart.getDate() + mondayOffset)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    let todayCount = 0
    let weekCount = 0
    let nextEvent = null

    filteredOutlookEvents.forEach((event) => {
      const start = event?.startAt ? new Date(event.startAt) : null
      if (!start || Number.isNaN(start.getTime())) return

      if (start >= startOfToday && start < endOfToday) todayCount += 1
      if (start >= weekStart && start < weekEnd) weekCount += 1
      if (start > now && (!nextEvent || start < new Date(nextEvent.startAt))) {
        nextEvent = event
      }
    })

    return {
      todayCount,
      weekCount,
      nextEvent,
    }
  }, [filteredOutlookEvents])

  const dashboardPulse = useMemo(() => {
    const total = stats.total || 0
    const healthyShare = total > 0 ? Math.round((stats.green / total) * 100) : 0
    const atRiskShare = total > 0 ? Math.round(((stats.yellow + stats.red) / total) * 100) : 0

    const nextMeetingDate = outlookSummary.nextEvent?.startAt ? new Date(outlookSummary.nextEvent.startAt) : null
    const nextMeetingLabel = nextMeetingDate
      ? nextMeetingDate.toLocaleString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'No upcoming meeting'

    return {
      healthyShare,
      atRiskShare,
      nextMeetingLabel,
    }
  }, [outlookSummary.nextEvent, stats.green, stats.red, stats.total, stats.yellow])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return filteredOutlookEvents
      .filter((event) => {
        const start = event?.startAt ? new Date(event.startAt) : null
        return start && !Number.isNaN(start.getTime()) && start >= now
      })
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .slice(0, 5)
  }, [filteredOutlookEvents])

  const formatEventDateTime = (value) => {
    if (!value) return 'No time set'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleString('sv-SE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) return null // Keep first paint clean until dashboard data is ready

  return (
    <div className="dashboard-stack ux-section-stagger">
        
        {/* Welcome Section */}
        <section className="dashboard-welcome">
          <div className="dashboard-welcome-copy">
             <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Good afternoon, Sandra</h2>
             <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Here&apos;s what&apos;s happening in your network today.</p>
          </div>
          <div className="dashboard-welcome-actions">
             <div className="glass-panel flex justify-center items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-full bg-slate-50 border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                <span>System Operational</span>
             </div>
             <button type="button" className="btn-secondary" onClick={() => router.push('/calendar')}>
               <span className="material-symbols-outlined text-lg">calendar_today</span>
               Open Calendar
             </button>
             <button type="button" className="btn-secondary" onClick={() => router.push('/leads')}>
               <span className="material-symbols-outlined text-lg">auto_awesome</span>
               Review Leads
             </button>
          </div>
        </section>

        <section className="dashboard-metric-strip">
          <article className="glass-panel dashboard-metric-card">
            <p className="dashboard-metric-label">Next Meeting</p>
            <p className="dashboard-metric-value">{dashboardPulse.nextMeetingLabel}</p>
            <p className="dashboard-metric-meta">{outlookSummary.todayCount} today</p>
          </article>
          <article className="glass-panel dashboard-metric-card">
            <p className="dashboard-metric-label">Engagement Health</p>
            <p className="dashboard-metric-value">{dashboardPulse.healthyShare}%</p>
            <p className="dashboard-metric-meta">{stats.green} active of {stats.total} contacts</p>
          </article>
          <article className="glass-panel dashboard-metric-card">
            <p className="dashboard-metric-label">Risk Share</p>
            <p className="dashboard-metric-value">{dashboardPulse.atRiskShare}%</p>
            <p className="dashboard-metric-meta">{stats.yellow + stats.red} contacts need attention</p>
          </article>
          <article className="glass-panel dashboard-metric-card">
            <p className="dashboard-metric-label">Unmatched Events</p>
            <p className="dashboard-metric-value">{unmatchedEvents.length}</p>
            <p className="dashboard-metric-meta">AI can link these to contacts</p>
          </article>
        </section>

        {/* Primary Bento Grid */}
        <BentoGrid>
          {/* KPI Cards */}
          <BentoItem colSpan={1}>
             <KPICard 
               title="Total Contacts" 
               value={stats.total} 
               icon="group" 
               color="primary"
               trend="up" 
               trendValue="+12% vs last month"
             />
          </BentoItem>
          
          <BentoItem colSpan={1}>
             <KPICard 
               title="Active Leads" 
               value={stats.green} 
               icon="verified" 
               color="success" 
               trend="up" 
               trendValue="Healthy engagement"
             />
          </BentoItem>

          <BentoItem colSpan={1}>
             <KPICard 
               title="Attention Needed" 
               value={stats.yellow} 
               icon="warning" 
               color="warning" 
               trend="down" 
               trendValue="Action required"
             />
          </BentoItem>

          <BentoItem colSpan={1}>
             <KPICard 
               title="Critical" 
               value={stats.red} 
               icon="error" 
               color="danger" 
               trend="down" 
               trendValue="Immediate review"
             />
          </BentoItem>

          <BentoItem colSpan={2} rowSpan={2} className="dashboard-calendar-snapshot">
             <div className="dashboard-panel-header">
                <div>
                   <h3 className="dashboard-panel-title">Calendar Snapshot</h3>
                   <p className="dashboard-panel-meta">
                     Outlook Sync: {outlookEnabled ? 'Active' : 'Disconnected'} · Idag: {outlookSummary.todayCount} · Veckan: {outlookSummary.weekCount} · Nästa 5 möten
                     {searchTerm ? ` · Filter: "${searchTerm}"` : ''}
                   </p>
                   {outlookAccount?.email && (
                     <p className="dashboard-panel-meta">Konto: {outlookAccount.email}</p>
                   )}
                   {outlookError && (
                     <p className="dashboard-panel-meta text-red-600">{outlookError}</p>
                   )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => router.push('/calendar')}
                  >
                    Öppna kalender
                  </button>
                  {outlookConnectionType === 'user' ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={disconnectOutlook}
                      disabled={outlookActionLoading}
                    >
                      {outlookActionLoading ? 'Kopplar från...' : 'Koppla från'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={connectOutlook}
                      disabled={outlookActionLoading}
                    >
                      {outlookActionLoading ? 'Startar...' : 'Anslut Outlook'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={fetchOutlookEvents}
                    disabled={outlookLoading || outlookActionLoading}
                  >
                    {outlookLoading ? 'Synkar...' : 'Synka om'}
                  </button>
                </div>
             </div>

             {outlookLoading ? (
               <div className="dashboard-spinner-wrap">
                 <div className="dashboard-spinner"></div>
               </div>
             ) : upcomingEvents.length === 0 ? (
               <p className="dashboard-empty-note">No upcoming meetings in the current feed.</p>
             ) : (
               <div className="dashboard-calendar-events custom-scrollbar">
                 {upcomingEvents.map((event) => (
                   <article key={event.id} className="dashboard-calendar-event">
                     <div className="dashboard-calendar-event-copy">
                       <p className="dashboard-calendar-event-title">{event.title || 'Untitled meeting'}</p>
                       <p className="dashboard-calendar-event-meta">{formatEventDateTime(event.startAt)}</p>
                       <p className="dashboard-calendar-event-meta">{event.organizer || event.location || 'No organizer/location'}</p>
                     </div>
                     {event.webLink ? (
                       <a
                         href={event.webLink}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="inline-link small-copy"
                       >
                         Open
                       </a>
                     ) : null}
                   </article>
                 ))}
               </div>
             )}
          </BentoItem>

          {/* Recent Activity Feed */}
          <BentoItem colSpan={2} rowSpan={2}>
             <div className="dashboard-panel-header">
                <h3 className="dashboard-panel-title">Recent Activity</h3>
                <div className="glass-panel dashboard-live-pill">
                   <span className="dashboard-live-label">LIVE FEED</span>
                </div>
             </div>

             <div className="dashboard-activity-list">
                {filteredRecentActivity.length === 0 ? (
                  <p className="dashboard-empty-note">No recent activity recorded.</p>
                ) : (
                  filteredRecentActivity.map((activity) => (
                    <div key={activity.id} className="dashboard-activity-item">
                       <div className="dashboard-activity-icon-wrap">
                          <span className="material-symbols-outlined dashboard-activity-icon">
                            {activity.type === 'email' ? 'mail' : activity.type === 'call' ? 'call' : 'event'}
                          </span>
                       </div>
                       <div>
                          <p className="dashboard-activity-name">
                            {activity.contacts?.name || 'Unknown Contact'}
                          </p>
                          <p className="dashboard-activity-meta">
                            {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)} • {new Date(activity.timestamp).toLocaleDateString()}
                          </p>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </BentoItem>

          {/* Unmatched Events Action Area */}
          {unmatchedEvents.length > 0 && (
             <BentoItem colSpan={4} className="dashboard-ai-banner">
                <div className="dashboard-ai-banner-content">
                   <div className="dashboard-ai-icon-wrap">
                      <span className="material-symbols-outlined">smart_toy</span>
                   </div>
                   <div className="dashboard-ai-copy">
                      <h3 className="dashboard-panel-title">AI Suggestions Available</h3>
                      <p className="dashboard-panel-meta">
                        We found <span className="dashboard-highlight">{unmatchedEvents.length}</span> calendar events that can be linked to contacts.
                      </p>
                   </div>
                   <button className="btn btn-primary" onClick={() => router.push('/leads')}>
                      Review Suggestions
                   </button>
                </div>
             </BentoItem>
          )}

        </BentoGrid>
    </div>
  )
}
