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
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary text-primary transition-colors duration-200">
      <nav className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                <h1 className="text-xl font-bold tracking-tight text-primary">Lösen</h1>
              </div>
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium bg-accent-soft text-accent-primary">Dashboard</Link>
                <Link href="/contacts" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Contacts</Link>
                <Link href="/companies" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Companies</Link>
                <Link href="/leads" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
                title="Byt tema"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-primary leading-none">{session?.user?.email?.split('@')[0]}</span>
                <span className="text-[10px] text-muted">{session?.user?.email}</span>
              </div>
              <button onClick={handleLogout} className="btn-secondary py-1.5 px-3 text-xs">Logga ut</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-primary tracking-tight">Välkommen tillbaka</h2>
            <p className="text-secondary mt-1">Här är dagens signal och prioriterade aktiviteter.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${outlookEnabled ? 'badge-green' : 'badge-red'}`}>
              {outlookEnabled ? 'Outlook Connected' : 'Outlook Disconnected'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-3">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="card border-b-4 border-b-accent-primary">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Totalt Antal</p>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-black text-primary">{stats.total}</div>
              <div className="text-xs text-secondary font-medium">kontakter</div>
            </div>
          </div>
          <div className="card status-green-panel">
            <p className="text-xs font-bold text-status-green-text uppercase tracking-wider mb-1">Aktiv Status</p>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-black text-status-green-text">{stats.green}</div>
              <div className="badge badge-green text-[10px]">Planerad</div>
            </div>
          </div>
          <div className="card status-yellow-panel">
            <p className="text-xs font-bold text-status-yellow-text uppercase tracking-wider mb-1">Nya Touchpoints</p>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-black text-status-yellow-text">{stats.yellow}</div>
              <div className="badge badge-yellow text-[10px]">Nylig kontakt</div>
            </div>
          </div>
          <div className="card status-red-panel">
            <p className="text-xs font-bold text-status-red-text uppercase tracking-wider mb-1">Behöver Action</p>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-black text-status-red-text">{stats.red}</div>
              <div className="badge badge-red text-[10px]">Kräver fokus</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Quick Actions */}
          <section className="lg:col-span-1 space-y-6">
            <div className="card">
              <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
                <span>⚡</span> Snabba Actions
              </h3>
              <div className="grid gap-3">
                <Link href="/contacts/new" className="flex items-center justify-between p-4 bg-secondary hover:bg-accent-soft hover:border-accent-primary border border-color rounded-xl group transition-all">
                  <span className="font-semibold text-primary">Ny Kontakt</span>
                  <span className="text-xl group-hover:translate-x-1 transition-transform">➕</span>
                </Link>
                <Link href="/companies/new" className="flex items-center justify-between p-4 bg-secondary hover:bg-status-green-bg hover:border-status-green-border border border-color rounded-xl group transition-all">
                  <span className="font-semibold text-primary">Nytt Bolag</span>
                  <span className="text-xl group-hover:translate-x-1 transition-transform">🏢</span>
                </Link>
                <Link href="/leads" className="flex items-center justify-between p-4 bg-secondary hover:bg-purple-100 hover:border-purple-400 border border-color rounded-xl group transition-all dark:hover:bg-purple-900 dark:hover:bg-opacity-20">
                  <span className="font-semibold text-primary">Upptäck Leads</span>
                  <span className="text-xl group-hover:translate-x-1 transition-transform">🤖</span>
                </Link>
              </div>
            </div>

            {/* Status Legend */}
            <div className="card bg-primary bg-opacity-50">
              <h3 className="text-sm font-bold text-muted uppercase tracking-widest mb-4">Statusguide</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-1 h-8 bg-status-green-border rounded-full shrink-0"></div>
                  <div>
                    <p className="text-xs font-bold text-primary">Aktiv</p>
                    <p className="text-[10px] text-secondary">Framtida aktivitet planerad.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1 h-8 bg-status-yellow-border rounded-full shrink-0"></div>
                  <div>
                    <p className="text-xs font-bold text-primary">Nylig</p>
                    <p className="text-[10px] text-secondary">Kontaktat de senaste 4 veckorna.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1 h-8 bg-status-red-border rounded-full shrink-0"></div>
                  <div>
                    <p className="text-xs font-bold text-primary">Attention</p>
                    <p className="text-[10px] text-secondary">Ingen kontakt på över 4 veckor.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Activity & Calendar */}
          <section className="lg:col-span-2 space-y-8">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span>📅</span> Kommande Möten
                </h3>
                <button 
                  onClick={fetchOutlookEvents} 
                  className="p-2 text-accent-primary hover:bg-accent-soft rounded-lg transition-all"
                  title="Uppdatera lista"
                >
                  🔄
                </button>
              </div>

              {outlookLoading ? (
                <div className="py-12 flex flex-col items-center justify-center opacity-50">
                  <div className="w-8 h-8 border-2 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-2"></div>
                  <p className="text-xs">Synkar Outlook...</p>
                </div>
              ) : !outlookEnabled ? (
                <div className="py-10 text-center border-2 border-dashed border-color rounded-2xl">
                  <p className="text-secondary text-sm">Outlook integration saknas.</p>
                  <p className="text-xs text-muted mt-1">Kontakta admin för att aktivera realtidssynk.</p>
                </div>
              ) : outlookEvents.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-color rounded-2xl">
                  <p className="text-secondary text-sm">Inga möten de närmaste 14 dagarna.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {outlookEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="p-4 bg-secondary rounded-xl border border-color hover:border-accent-primary transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold text-primary">{event.title}</p>
                        <span className="text-[10px] font-mono bg-primary px-2 py-0.5 rounded border border-color text-secondary">
                          {event.startAt && new Date(event.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
                        <span className="flex items-center gap-1">🗓️ {event.startAt && new Date(event.startAt).toLocaleDateString()}</span>
                        {event.location && <span className="flex items-center gap-1">📍 {event.location}</span>}
                        {event.webLink && (
                          <a href={event.webLink} target="_blank" rel="noopener noreferrer" className="text-accent-primary font-semibold hover:underline">
                            Öppna länk
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {outlookEvents.length > 5 && (
                    <p className="text-center text-[10px] text-muted">Visa alla {outlookEvents.length} möten i din kalender</p>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span>⏱️</span> Nylig Aktivitet
              </h3>
              {recentActivity.length === 0 ? (
                <div className="py-8 text-center bg-secondary rounded-xl border border-dashed border-color">
                  <p className="text-muted text-sm">Ingen historik tillgänglig.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-color ml-3 pl-6 space-y-6">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="relative">
                      <div className="absolute -left-[33px] top-1 w-4 h-4 rounded-full bg-primary border-2 border-accent-primary"></div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-primary">{activity.contacts?.name || 'Okänd'}</span>
                        <div className="flex items-center gap-2 text-[10px] text-secondary mt-1">
                          <span className="px-1.5 py-0.5 rounded-md bg-secondary border border-color uppercase">
                            {activity.type}
                          </span>
                          <span>•</span>
                          <span>{new Date(activity.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Unmatched Events - Critical for Signal */}
        {outlookEnabled && unmatchedEvents.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-xl font-black text-primary tracking-tight">🔎 Omatchade Händelser</h3>
              <div className="badge badge-red">{unmatchedEvents.length} krävda kopplingar</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {unmatchedEvents.map((event) => (
                <div key={event.id} className="card border-l-4 border-l-status-red-border flex flex-col justify-between">
                  <div className="mb-6">
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <p className="text-lg font-bold text-primary leading-tight">{event.title}</p>
                      <button 
                        onClick={() => removeUnmatchedEvent(event.id)}
                        className="text-muted hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-xs text-secondary mb-4 bg-secondary p-2 rounded-lg border border-color">
                      📅 {event.startAt && new Date(event.startAt).toLocaleString()}
                    </p>
                    
                    {event.matchEmails?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {event.matchEmails.map(email => (
                          <span key={email} className="text-[10px] bg-accent-soft text-accent-primary px-2 py-0.5 rounded-md font-medium border border-accent-primary border-opacity-20">
                            {email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest pl-1">Koppla Befintlig</p>
                      <div className="flex gap-2">
                        <select
                          value={linkSelections[event.id] || ''}
                          onChange={(e) => setLinkSelections((previous) => ({ ...previous, [event.id]: e.target.value }))}
                          className="input-field py-2 text-sm"
                        >
                          <option value="">Välj kontakt...</option>
                          {contactsForSync.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleLinkToContact(event.id)}
                          className="btn-secondary py-2 px-4 text-sm shrink-0"
                          disabled={!linkSelections[event.id]}
                        >
                          Koppla
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-color">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest pl-1 mb-2">Eller Skapa Ny</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={createDrafts[event.id]?.name || ''}
                          onChange={(e) => handleCreateDraftChange(event.id, 'name', e.target.value)}
                          placeholder="Namn"
                          className="input-field py-2 text-sm"
                        />
                        <input
                          type="email"
                          value={createDrafts[event.id]?.email || ''}
                          onChange={(e) => handleCreateDraftChange(event.id, 'email', e.target.value)}
                          placeholder="E-post"
                          className="input-field py-2 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCreateAndLinkContact(event.id)}
                        className="btn-primary w-full py-2.5 text-sm"
                      >
                        Skapa & Koppla
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {outlookActionMessage && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-primary border border-color shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
            <span className="text-xl">✨</span>
            <p className="text-sm font-medium pr-8">{outlookActionMessage}</p>
            <button 
              onClick={() => setOutlookActionMessage('')}
              className="absolute right-4 text-muted hover:text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
