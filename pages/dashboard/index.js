import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'
import Calendar from '../../components/Calendar'
import { computeContactStatus } from '../../lib/contactStatus'
import {
  buildOutlookSyncPlan,
  buildManualContactPatch,
  inferContactNameFromEvent,
} from '../../lib/outlookSync'

export default function Dashboard({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [stats, setStats] = useState({ green: 0, yellow: 0, red: 0, total: 0 })
  const [recentActivity, setRecentActivity] = useState([])
  const [outlookEvents, setOutlookEvents] = useState([])
  const [unmatchedEvents, setUnmatchedEvents] = useState([])
  const [contactsForSync, setContactsForSync] = useState([])
  const [linkSelections, setLinkSelections] = useState({})
  const [createDrafts, setCreateDrafts] = useState({})
  const [outlookEnabled, setOutlookEnabled] = useState(false)
  const [outlookLoading, setOutlookLoading] = useState(true)
  const [outlookSyncing, setOutlookSyncing] = useState(false)
  const [outlookSyncSummary, setOutlookSyncSummary] = useState({ updated: 0, matched: 0, unmatched: 0 })
  const [outlookActionMessage, setOutlookActionMessage] = useState('')
  const [outlookError, setOutlookError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUnmatchedPanel, setShowUnmatchedPanel] = useState(false)

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
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  const loadContactsForOutlookSync = async () => {
    const { data, error: contactsError } = await supabase
      .from('contacts')
      .select('id, user_id, name, email, last_touchpoint, next_activity')
      .eq('user_id', session.user.id)
      .order('name')

    if (contactsError) throw contactsError
    return data || []
  }

  const applyContactSyncUpdates = async (updates = []) => {
    if (!updates.length) return 0
    let updatedCount = 0

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update(update.patch)
        .eq('id', update.contactId)
        .eq('user_id', session.user.id)

      if (updateError) {
        console.error(`Failed syncing contact ${update.contactId}:`, updateError.message)
        continue
      }
      updatedCount += 1
    }

    return updatedCount
  }

  const fetchOutlookEvents = async () => {
    setOutlookLoading(true)
    setOutlookError('')
    setOutlookActionMessage('')

    try {
      // Fetch more days to fill the calendar month view better
      const response = await fetch('/api/outlook/events?days=40&limit=100')
      const raw = await response.text()
      let payload = {}
      if (raw) {
        try {
          payload = JSON.parse(raw)
        } catch {
          payload = { error: `Unexpected API response: ${raw.slice(0, 200)}` }
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch Outlook events')
      }

      const events = payload.events || []
      setOutlookEnabled(Boolean(payload.enabled))
      setOutlookEvents(events)

      if (!payload.enabled) {
        setOutlookSyncSummary({ updated: 0, matched: 0, unmatched: 0 })
        setUnmatchedEvents([])
        setContactsForSync([])
        return
      }

      const contacts = await loadContactsForOutlookSync()
      setContactsForSync(contacts)

      const plan = buildOutlookSyncPlan(events, contacts)
      setOutlookSyncing(true)
      const updatedCount = await applyContactSyncUpdates(plan.updates)
      setOutlookSyncing(false)

      setOutlookSyncSummary({
        updated: updatedCount,
        matched: plan.matchedCount,
        unmatched: plan.unmatchedEvents.length,
      })

      setUnmatchedEvents(plan.unmatchedEvents)
      setCreateDrafts((previous) => {
        const next = { ...previous }
        for (const event of plan.unmatchedEvents) {
          if (!next[event.id]) {
            next[event.id] = {
              name: inferContactNameFromEvent(event),
              email: event.matchEmails?.[0] || '',
            }
          }
        }
        return next
      })

      if (updatedCount > 0) {
        await fetchStats()
      }
    } catch (fetchError) {
      setOutlookError(fetchError.message)
      setOutlookEnabled(false)
      setOutlookEvents([])
      setUnmatchedEvents([])
      setOutlookSyncSummary({ updated: 0, matched: 0, unmatched: 0 })
    } finally {
      setOutlookLoading(false)
      setOutlookSyncing(false)
    }
  }

  const removeUnmatchedEvent = (eventId) => {
    setUnmatchedEvents((previous) => previous.filter((event) => event.id !== eventId))
    setLinkSelections((previous) => {
      const next = { ...previous }
      delete next[eventId]
      return next
    })
  }

  const handleLinkToContact = async (eventId) => {
    setOutlookActionMessage('')
    const contactId = linkSelections[eventId]
    if (!contactId) {
      setOutlookActionMessage('Välj en kontakt först.')
      return
    }

    const event = unmatchedEvents.find((item) => item.id === eventId)
    const contact = contactsForSync.find((item) => item.id === contactId)
    if (!event || !contact) {
      setOutlookActionMessage('Kunde inte hitta event eller kontakt.')
      return
    }

    const patch = buildManualContactPatch(contact, event)
    if (Object.keys(patch).length) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update(patch)
        .eq('id', contact.id)
        .eq('user_id', session.user.id)

      if (updateError) {
        setOutlookActionMessage(updateError.message)
        return
      }
    }

    setContactsForSync((previous) => previous.map((item) => (
      item.id === contact.id
        ? { ...item, ...patch }
        : item
    )))

    removeUnmatchedEvent(eventId)
    setOutlookActionMessage(`Kopplade "${event.title}" till ${contact.name}.`)
    await fetchStats()
  }

  const handleCreateDraftChange = (eventId, field, value) => {
    setCreateDrafts((previous) => ({
      ...previous,
      [eventId]: {
        ...(previous[eventId] || {}),
        [field]: value,
      },
    }))
  }

  const handleCreateAndLinkContact = async (eventId) => {
    setOutlookActionMessage('')
    const event = unmatchedEvents.find((item) => item.id === eventId)
    if (!event) return

    const draft = createDrafts[eventId] || {}
    const trimmedName = String(draft.name || '').trim() || inferContactNameFromEvent(event)
    const trimmedEmail = String(draft.email || '').trim()

    const seed = { email: trimmedEmail, last_touchpoint: null, next_activity: null }
    const patch = buildManualContactPatch(seed, event)

    const insertPayload = {
      user_id: session.user.id,
      name: trimmedName,
      email: trimmedEmail || patch.email || null,
      last_touchpoint: patch.last_touchpoint || null,
      next_activity: patch.next_activity || null,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert(insertPayload)
      .select('id, user_id, name, email, last_touchpoint, next_activity')
      .single()

    if (insertError) {
      setOutlookActionMessage(insertError.message)
      return
    }

    setContactsForSync((previous) => [...previous, inserted].sort((a, b) => a.name.localeCompare(b.name)))
    removeUnmatchedEvent(eventId)
    setOutlookActionMessage(`Skapade kontakt "${inserted.name}" från kalenderhändelsen.`)
    await fetchStats()
  }

  const StatCard = ({ label, value, colorClass }) => (
    <div className="glass-panel p-4 flex flex-col items-center justify-center min-w-[120px]">
        <span className="text-2xl font-bold font-outfit" style={{ color: colorClass }}>
            {value}
        </span>
        <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mt-1">
            {label}
        </span>
    </div>
  )

  if (loading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
            <div className="animate-pulse flex flex-col items-center">
                <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mb-4"></div>
                <div className="text-[var(--text-secondary)] font-medium">Loading Dashboard...</div>
            </div>
        </div>
    )
  }

  return (
    <AppShell
      title="Dashboard"
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={
        <div className="flex gap-2">
            <Link href="/contacts/new" className="btn btn-primary text-xs">
                + Contact
            </Link>
            <button 
                onClick={() => setShowUnmatchedPanel(!showUnmatchedPanel)} 
                className={`btn btn-secondary text-xs ${unmatchedEvents.length > 0 ? 'border-amber-400 text-amber-500' : ''}`}
            >
                {unmatchedEvents.length > 0 ? `Unmatched (${unmatchedEvents.length})` : 'Sync Status'}
            </button>
        </div>
      }
    >
      {error && <p className="bg-[var(--danger-subtle)] text-[var(--danger)] p-3 rounded-lg mb-4">{error}</p>}

      {/* Top Stats Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active" value={stats.green} colorClass="var(--success)" />
        <StatCard label="At Risk" value={stats.yellow} colorClass="var(--warning)" />
        <StatCard label="Critical" value={stats.red} colorClass="var(--danger)" />
        <StatCard label="Total" value={stats.total} colorClass="var(--text-primary)" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-[calc(100vh-220px)] min-h-[600px]">
        {/* Main Calendar View */}
        <div className={`
            ${showUnmatchedPanel ? 'xl:col-span-8' : 'xl:col-span-12'} 
            h-full flex flex-col gap-6 transition-all duration-300
        `}>
            <div className="glass-panel p-1 flex-1 h-full overflow-hidden flex flex-col">
                {outlookLoading ? (
                    <div className="h-full flex items-center justify-center text-[var(--muted)]">Loading calendar...</div>
                ) : (
                    <Calendar 
                        events={outlookEvents} 
                        onEventClick={(e) => console.log('Clicked event', e)}
                    />
                )}
            </div>
        </div>

        {/* Side Panel: Unmatched Events / Inbox */}
        {showUnmatchedPanel && (
            <div className="xl:col-span-4 h-full flex flex-col gap-4 animate-fade-in">
                <div className="glass-panel p-4 h-full overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-outfit font-bold text-lg">Inbox</h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200">
                            {unmatchedEvents.length} Pending
                        </span>
                    </div>
                    
                    {outlookActionMessage && (
                        <div className="text-sm bg-blue-50 text-blue-700 p-2 rounded mb-3 border border-blue-100">
                            {outlookActionMessage}
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        {unmatchedEvents.length === 0 ? (
                            <div className="text-center py-10 text-[var(--text-tertiary)]">
                                <p>All caught up!</p>
                                <p className="text-sm mt-1">No unmatched calendar events.</p>
                            </div>
                        ) : (
                            unmatchedEvents.map((event) => (
                                <div key={event.id} className="p-3 bg-[var(--bg-app)] rounded-lg border border-[var(--border-subtle)] hover:border-blue-300 transition-colors">
                                    <p className="font-semibold text-sm mb-1">{event.title}</p>
                                    <p className="text-xs text-[var(--text-tertiary)] mb-3">
                                        {new Date(event.startAt).toLocaleString()}
                                    </p>
                                    
                                    <div className="flex flex-col gap-2">
                                        <select
                                            value={linkSelections[event.id] || ''}
                                            onChange={(e) => setLinkSelections((prev) => ({ ...prev, [event.id]: e.target.value }))}
                                            className="text-xs p-1.5 rounded border border-[var(--border-medium)] bg-[var(--surface)] w-full"
                                        >
                                            <option value="">Link to existing...</option>
                                            {contactsForSync.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <button 
                                            onClick={() => handleLinkToContact(event.id)}
                                            className="btn btn-secondary text-xs w-full py-1 h-8"
                                            disabled={!linkSelections[event.id]}
                                        >
                                            Link
                                        </button>
                                        
                                        <div className="h-px bg-[var(--border-subtle)] my-1"></div>
                                        
                                        <input
                                            type="text"
                                            placeholder="New contact name"
                                            value={createDrafts[event.id]?.name || ''}
                                            onChange={(e) => handleCreateDraftChange(event.id, 'name', e.target.value)}
                                            className="text-xs p-1.5 rounded border border-[var(--border-medium)] bg-[var(--surface)] w-full"
                                        />
                                        <button 
                                            onClick={() => handleCreateAndLinkContact(event.id)}
                                            className="btn btn-primary text-xs w-full py-1 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 border-none"
                                        >
                                            Create & Link
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </AppShell>
  )
}
