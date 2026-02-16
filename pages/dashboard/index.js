import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { computeContactStatus } from '../../lib/contactStatus'
import {
  buildOutlookSyncPlan,
  buildManualContactPatch,
  inferContactNameFromEvent,
} from '../../lib/outlookSync'

export default function Dashboard({ session }) {
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
      const response = await fetch('/api/outlook/events?days=14&limit=20')
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">🔐 Lösen</h1>
              <div className="ml-8 flex space-x-4">
                <Link href="/dashboard" className="text-blue-600 font-medium">Dashboard</Link>
                <Link href="/contacts" className="text-gray-600 hover:text-gray-900">Contacts</Link>
                <Link href="/companies" className="text-gray-600 hover:text-gray-900">Companies</Link>
                <Link href="/leads" className="text-gray-600 hover:text-gray-900">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-4">{session?.user?.email}</span>
              <button onClick={handleLogout} className="btn-secondary text-sm">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Dashboard</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card text-center">
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-gray-500">Total Contacts</div>
          </div>
          <div className="card text-center border-l-4 border-green-500">
            <div className="text-3xl font-bold text-green-600">{stats.green}</div>
            <div className="text-gray-500">🟢 Active (scheduled)</div>
          </div>
          <div className="card text-center border-l-4 border-yellow-500">
            <div className="text-3xl font-bold text-yellow-600">{stats.yellow}</div>
            <div className="text-gray-500">🟡 Recent touch</div>
          </div>
          <div className="card text-center border-l-4 border-red-500">
            <div className="text-3xl font-bold text-red-600">{stats.red}</div>
            <div className="text-gray-500">🔴 Needs attention</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">🚀 Quick Actions</h3>
            <div className="space-y-3">
              <Link href="/contacts/new" className="block p-3 bg-blue-50 rounded hover:bg-blue-600">
                + Add New Contact
              </Link>
              <Link href="/companies/new" className="block p-3 bg-green-50 rounded hover:bg-green-500">
                + Add New Company
              </Link>
              <Link href="/leads" className="block p-3 bg-purple-50 rounded hover:bg-purple-100">
                🤖 Generate Weekly Leads
              </Link>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">📅 Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-gray-500">No recent activity</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((activity) => (
                  <li key={activity.id} className="flex items-start space-x-3">
                    <span className="text-2xl">
                      {activity.type === 'meeting' ? '📅' : activity.type === 'call' ? '📞' : '✉️'}
                    </span>
                    <div>
                      <p className="font-medium">{activity.contacts?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">
                        {activity.type} - {new Date(activity.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">🗓️ Outlook Calendar (Read-only)</h3>
            <button onClick={fetchOutlookEvents} className="btn-secondary text-sm">Refresh</button>
          </div>

          {outlookActionMessage && <p className="text-sm text-blue-700 mb-3">{outlookActionMessage}</p>}
          {outlookSyncing && <p className="text-sm text-gray-600 mb-3">Synkar kontakter från Outlook...</p>}

          {!outlookLoading && outlookEnabled && !outlookError && (
            <p className="text-sm text-gray-600 mb-4">
              Matchade events: {outlookSyncSummary.matched} | Uppdaterade kontakter: {outlookSyncSummary.updated} | Omatchade events: {outlookSyncSummary.unmatched}
            </p>
          )}

          {outlookLoading ? (
            <p className="text-gray-500">Loading Outlook events...</p>
          ) : outlookError ? (
            <p className="text-red-600">{outlookError}</p>
          ) : !outlookEnabled ? (
            <p className="text-gray-500">
              Outlook integration is not configured yet. Add Outlook env vars to enable read-only sync.
            </p>
          ) : outlookEvents.length === 0 ? (
            <p className="text-gray-500">No upcoming events in the next 14 days.</p>
          ) : (
            <ul className="space-y-3">
              {outlookEvents.map((event) => (
                <li key={event.id} className="border rounded p-3">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-gray-600">
                    {event.startAt ? new Date(event.startAt).toLocaleString() : 'Unknown start'}{' '}
                    - {event.endAt ? new Date(event.endAt).toLocaleString() : 'Unknown end'}
                  </p>
                  {event.location && <p className="text-sm text-gray-600">Location: {event.location}</p>}
                  {event.organizer && <p className="text-sm text-gray-600">Organizer: {event.organizer}</p>}
                  {event.attendeeEmails?.length > 0 && (
                    <p className="text-sm text-gray-600">Attendees: {event.attendeeEmails.join(', ')}</p>
                  )}
                  {event.webLink && (
                    <a href={event.webLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                      Open in Outlook
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {outlookEnabled && !outlookLoading && !outlookError && (
          <div className="card mb-8">
            <h3 className="text-lg font-semibold mb-4">🔎 Omatchade Outlook-händelser</h3>
            {unmatchedEvents.length === 0 ? (
              <p className="text-gray-500">Alla hämtade events kunde matchas mot en kontakt.</p>
            ) : (
              <div className="space-y-4">
                {unmatchedEvents.map((event) => (
                  <div key={event.id} className="border rounded p-4">
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-sm text-gray-600 mb-2">
                      {event.startAt ? new Date(event.startAt).toLocaleString() : 'Unknown start'}{' '}
                      - {event.endAt ? new Date(event.endAt).toLocaleString() : 'Unknown end'}
                    </p>
                    {event.matchEmails?.length > 0 ? (
                      <p className="text-sm text-gray-600 mb-3">E-post i event: {event.matchEmails.join(', ')}</p>
                    ) : (
                      <p className="text-sm text-gray-600 mb-3">Ingen deltagar-e-post hittades i eventet.</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <select
                        value={linkSelections[event.id] || ''}
                        onChange={(e) => setLinkSelections((previous) => ({ ...previous, [event.id]: e.target.value }))}
                        className="input-field md:col-span-2"
                      >
                        <option value="">Välj befintlig kontakt...</option>
                        {contactsForSync.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}{contact.email ? ` (${contact.email})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleLinkToContact(event.id)}
                        className="btn-secondary"
                      >
                        Koppla till kontakt
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={createDrafts[event.id]?.name || ''}
                        onChange={(e) => handleCreateDraftChange(event.id, 'name', e.target.value)}
                        placeholder="Namn för ny kontakt"
                        className="input-field"
                      />
                      <input
                        type="email"
                        value={createDrafts[event.id]?.email || ''}
                        onChange={(e) => handleCreateDraftChange(event.id, 'email', e.target.value)}
                        placeholder="E-post (valfritt)"
                        className="input-field"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateAndLinkContact(event.id)}
                        className="btn-primary"
                      >
                        Skapa kontakt + koppla
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">📋 Status Legend</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-green-100 rounded-lg border-l-4 border-green-500">
              <p className="font-semibold">🟢 Active</p>
              <p className="text-sm text-gray-600">Activity scheduled in the future</p>
            </div>
            <div className="p-4 bg-yellow-100 rounded-lg border-l-4 border-yellow-500">
              <p className="font-semibold">🟡 Recent</p>
              <p className="text-sm text-gray-600">Contacted within 4 weeks, no follow-up scheduled</p>
            </div>
            <div className="p-4 bg-red-100 rounded-lg border-l-4 border-red-500">
              <p className="font-semibold">🔴 Needs Attention</p>
              <p className="text-sm text-gray-600">No contact for more than 4 weeks</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
