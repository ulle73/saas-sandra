import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'
import { BentoGrid, BentoItem } from '../../components/BentoGrid'
import KPICard from '../../components/KPICard'
import Calendar from '../../components/Calendar'
import { computeContactStatus } from '../../lib/contactStatus'
import { buildOutlookSyncPlan } from '../../lib/outlookSync'

export default function Dashboard({ session, theme, toggleTheme }) {
  const router = useRouter()
  // Stats state
  const [stats, setStats] = useState({ green: 0, yellow: 0, red: 0, total: 0 })
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)

  // Outlook Sync State
  const [outlookEvents, setOutlookEvents] = useState([])
  const [unmatchedEvents, setUnmatchedEvents] = useState([])
  const [contactsForSync, setContactsForSync] = useState([])
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
        setContactsForSync(contacts)
        const plan = buildOutlookSyncPlan(payload.events || [], contacts)
        setUnmatchedEvents(plan.unmatchedEvents)
      }
    } catch (err) {
      console.error('Outlook sync error:', err)
      setOutlookEnabled(false)
    } finally {
      setOutlookLoading(false)
    }
  }

  if (loading) return null // Keep first paint clean until dashboard data is ready

  return (
    <AppShell title="Overview" session={session} theme={theme} onToggleTheme={toggleTheme}>
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

          {/* Large Calendar / Chart Area */}
          <BentoItem colSpan={2} rowSpan={2} className="dashboard-calendar-panel">
             <div className="dashboard-panel-header">
                <div>
                   <h3 className="dashboard-panel-title">Activity Calendar</h3>
                   <p className="dashboard-panel-meta">Outlook Sync Status: {outlookEnabled ? 'Active' : 'Disconnected'}</p>
                </div>
                <button className="icon-btn">
                   <span className="material-symbols-outlined">more_horiz</span>
                </button>
             </div>
             
             <div className="dashboard-calendar-wrap">
                {outlookLoading ? (
                  <div className="dashboard-spinner-wrap">
                    <div className="dashboard-spinner"></div>
                  </div>
                ) : (
                  <Calendar 
                    events={outlookEvents} 
                    onEventClick={(e) => console.log(e)}
                  />
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
                {recentActivity.length === 0 ? (
                  <p className="dashboard-empty-note">No recent activity recorded.</p>
                ) : (
                  recentActivity.map((activity) => (
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
    </AppShell>
  )
}
