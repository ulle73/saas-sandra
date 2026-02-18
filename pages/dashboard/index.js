import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { BentoGrid, BentoItem } from '../../components/BentoGrid'
import KPICard from '../../components/KPICard'
import WeekBookingBoard from '../../components/WeekBookingBoard'
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

  const fetchOutlookEvents = async () => {
    setOutlookLoading(true)
    try {
      const response = await fetch('/api/outlook/events?days=40&limit=100')
      const raw = await response.text()
      let payload = {}
      try { payload = JSON.parse(raw) } catch { payload = { error: 'Invalid JSON' } }

      if (!response.ok) throw new Error(payload.error || 'Failed to fetch Outlook events')

      setOutlookEnabled(Boolean(payload.enabled))
      setOutlookEvents(payload.events || [])

      if (payload.enabled) {
        const contacts = await loadContactsForOutlookSync()
        const plan = buildOutlookSyncPlan(payload.events || [], contacts)
        setUnmatchedEvents(plan.unmatchedEvents)
      } else {
        setUnmatchedEvents([])
      }
    } catch (err) {
      console.error('Outlook sync error:', err)
      setOutlookEnabled(false)
      setUnmatchedEvents([])
    } finally {
      setOutlookLoading(false)
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

  if (loading) return null // Keep first paint clean until dashboard data is ready

  return (
    <div className="dashboard-stack">
        
        {/* Welcome Section */}
        <section className="dashboard-welcome">
          <div className="dashboard-welcome-copy">
             <h2 className="dashboard-greeting">Good afternoon, Agent</h2>
             <p className="dashboard-subtitle">Here&apos;s what&apos;s happening in your network today.</p>
          </div>
          <div className="dashboard-welcome-actions">
             <div className="glass-panel dashboard-status-pill">
                <span className="dashboard-status-dot"></span>
                <span className="dashboard-status-label">System Operational</span>
             </div>
          </div>
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

          <BentoItem colSpan={4} className="dashboard-planner-panel">
             <div className="dashboard-panel-header">
                <div>
                   <h3 className="dashboard-panel-title">Calendar + Trello Week Board</h3>
                   <p className="dashboard-panel-meta">
                     Outlook Sync: {outlookEnabled ? 'Active' : 'Disconnected'} · Idag: {outlookSummary.todayCount} · Veckan: {outlookSummary.weekCount}
                     {outlookSummary.nextEvent?.startAt ? ` · Nästa: ${new Date(outlookSummary.nextEvent.startAt).toLocaleString('sv-SE')}` : ''}
                     {searchTerm ? ` · Filter: "${searchTerm}"` : ''}
                   </p>
                </div>
                <button type="button" className="btn-secondary" onClick={fetchOutlookEvents} disabled={outlookLoading}>
                   {outlookLoading ? 'Synkar...' : 'Synka om'}
                </button>
             </div>
             
             <div className="dashboard-planner-wrap">
                {outlookLoading ? (
                  <div className="dashboard-spinner-wrap">
                    <div className="dashboard-spinner"></div>
                  </div>
                ) : (
                  <WeekBookingBoard events={filteredOutlookEvents} />
                )}
             </div>
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
                   <button className="btn btn-primary">
                      Review Suggestions
                   </button>
                </div>
             </BentoItem>
          )}

        </BentoGrid>
    </div>
  )
}
