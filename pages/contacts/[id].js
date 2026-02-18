import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import StatusBadge from '../../components/StatusBadge'
import { computeContactStatus } from '../../lib/contactStatus'

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

export default function ContactDetail({ session, theme, toggleTheme }) {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contact, setContact] = useState(null)
  const [company, setCompany] = useState(null)
  const [activities, setActivities] = useState([])
  const [deals, setDeals] = useState([])
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityType, setActivityType] = useState('call')
  const [activityNotes, setActivityNotes] = useState('')
  const [activitySaving, setActivitySaving] = useState(false)

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    if (!id) return
    
    const fetchAll = async () => {
      setLoading(true)
      setError('')

      try {
        const [
          { data: contactData, error: contactError },
          { data: activityData, error: activityError }
        ] = await Promise.all([
          supabase.from('contacts').select('*, companies(*)').eq('id', id).eq('user_id', session.user.id).single(),
          supabase.from('activities').select('*').eq('contact_id', id).eq('user_id', session.user.id).order('timestamp', { ascending: false }),
        ])

        if (contactError) throw contactError
        if (activityError) throw activityError

        setContact(contactData)
        setCompany(contactData.companies)
        setActivities(activityData || [])
        // Deals would normally be another table, but we can simulate or fetch if exists
        // For now, let's look for a 'deals' table or just empty array
        const { data: dealsData } = await supabase.from('deals').select('*').eq('contact_id', id).limit(5)
        setDeals(dealsData || [])

      } catch (err) {
        console.error('Error fetching contact detail:', err.message)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [session, id, router])

  if (loading || !contact) return null

  const status = computeContactStatus(contact)
  const initials = contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const companyWebsite = normalizeWebUrl(company?.website)

  const handleCreateActivity = async (event) => {
    event.preventDefault()
    if (!activityNotes.trim()) return

    setActivitySaving(true)
    setError('')

    try {
      const now = new Date().toISOString()
      const { data: createdActivity, error: createActivityError } = await supabase
        .from('activities')
        .insert({
          user_id: session.user.id,
          contact_id: contact.id,
          type: activityType,
          notes: activityNotes.trim(),
          timestamp: now,
        })
        .select('*')
        .single()

      if (createActivityError) throw createActivityError

      const { error: updateContactError } = await supabase
        .from('contacts')
        .update({ last_touchpoint: now })
        .eq('id', contact.id)
        .eq('user_id', session.user.id)

      if (updateContactError) throw updateContactError

      setActivities((current) => [createdActivity, ...current])
      setContact((current) => ({ ...current, last_touchpoint: now }))
      setActivityNotes('')
      setShowActivityForm(false)
    } catch (createErr) {
      setError(createErr.message || 'Failed to create activity')
    } finally {
      setActivitySaving(false)
    }
  }

  return (
      <main className="max-w-[1440px] mx-auto w-full flex flex-col md:flex-row gap-8">
        {/* Left Sidebar: Profile Info */}
        <aside className="w-full md:w-80 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <div className="h-32 w-32 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-black mx-auto mb-6 border-4 border-white dark:border-slate-800 shadow-xl">
              {initials}
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{contact.name}</h1>
            <p className="text-sm font-semibold text-primary mt-1 uppercase tracking-wider">{contact.job_title || 'Contact'}</p>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{company?.name || 'Independent'}</p>
            
            <div className="flex gap-3 mt-8">
              <Link href={`/contacts/edit/${contact.id}`} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                <span className="material-symbols-outlined text-lg">edit</span>
                Edit Profile
              </Link>
              <button onClick={() => document.getElementById('activity-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-100 transition-all border border-slate-200 dark:border-slate-700">
                <span className="material-symbols-outlined text-lg">history</span>
                Timeline
              </button>
            </div>

            <div className="mt-10 space-y-5 text-left">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">mail</span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[180px]">{contact.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">call</span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{contact.phone || 'Not provided'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">link</span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LinkedIn</p>
                  {contact.linkedin_url ? (
                    <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary hover:underline">View Profile</a>
                  ) : (
                    <p className="text-sm font-bold text-slate-400">None</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {company && (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest mb-6 flex justify-between items-center">
                Company Details
                <span className="material-symbols-outlined text-slate-300">corporate_fare</span>
              </h3>
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 mb-6">
                <div className="h-12 w-12 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-xs">
                  {company.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{company.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{company.industry || 'Tech'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Size</span>
                  <span className="font-black text-slate-900 dark:text-white">{company.size || '10-50'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Website</span>
                  {companyWebsite ? (
                    <a href={companyWebsite} target="_blank" rel="noopener noreferrer" className="font-black text-primary hover:underline truncate max-w-[120px]">{company.website?.replace(/^https?:\/\//i, '')}</a>
                  ) : (
                    <span className="font-black text-slate-400">N/A</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col gap-8">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Contact</p>
                <div className="h-8 w-8 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                  <span className="material-symbols-outlined text-lg">history</span>
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {contact.last_touchpoint ? new Date(contact.last_touchpoint).toLocaleDateString() : 'Never'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-500 font-black">check_circle</span>
                <p className="text-xs font-bold text-slate-500 capitalize">{activities[0]?.type || 'N/A'} completed</p>
              </div>
            </div>

            <div className="bg-primary/[0.03] dark:bg-primary/5 rounded-xl p-6 border border-primary/20 shadow-sm border-dashed">
              <div className="flex justify-between items-start mb-4">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Next Scheduled</p>
                <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-lg font-black">event</span>
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {contact.next_activity ? new Date(contact.next_activity).toLocaleDateString() : 'TBD'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary font-black">schedule</span>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Quarterly Follow-up</p>
              </div>
            </div>
          </div>

          {/* Activity Section */}
          <div id="activity-log" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Activity Log</h2>
              <button onClick={() => setShowActivityForm((current) => !current)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-black shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                <span className="material-symbols-outlined text-lg font-black">add</span>
                {showActivityForm ? 'Close Form' : 'Log New Interaction'}
              </button>
            </div>

            {showActivityForm ? (
              <form className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 stack-sm" onSubmit={handleCreateActivity}>
                <div className="split-2">
                  <div>
                    <label className="form-label">Type</label>
                    <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="input-field">
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Note</label>
                    <input value={activityNotes} onChange={(event) => setActivityNotes(event.target.value)} className="input-field" placeholder="What happened?" required />
                  </div>
                </div>
                <div className="action-row">
                  <button type="submit" className="btn-primary" disabled={activitySaving}>
                    {activitySaving ? 'Saving...' : 'Save Interaction'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowActivityForm(false)} disabled={activitySaving}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
            
            <div className="p-8 grow relative">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                  <span className="material-symbols-outlined text-5xl mb-4">history_toggle_off</span>
                  <p className="font-bold text-sm">No activity history recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-10 relative">
                  {/* Vertical Line */}
                  <div className="absolute left-[19px] top-2 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800"></div>
                  
                  {activities.map((act, i) => (
                    <div key={act.id} className="relative pl-12">
                      {/* Icon Bubble */}
                      <div className={`absolute left-0 top-0 h-10 w-10 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-900 z-10 
                        ${act.type === 'call' ? 'bg-purple-100 text-purple-600' : 
                          act.type === 'email' ? 'bg-orange-100 text-orange-600' : 
                          act.type === 'meeting' ? 'bg-blue-100 text-blue-600' : 
                          'bg-slate-100 text-slate-600'}`}>
                        <span className="material-symbols-outlined text-xl">
                          {act.type === 'call' ? 'call' : act.type === 'email' ? 'alternate_email' : act.type === 'meeting' ? 'groups' : 'description'}
                        </span>
                      </div>
                      
                      <div className="bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-black text-slate-900 dark:text-white capitalize">{act.type} interaction</h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(act.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed italic">
                          "{act.notes || 'No details provided.'}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Shortcuts & Tags */}
        <aside className="w-full md:w-72 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Relationship Status</h3>
            <StatusBadge status={status} />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex justify-between items-center">
              Active Deals
              <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{deals.length}</span>
            </h3>
            
            {deals.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 py-4 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">No active deals found</p>
            ) : (
              <div className="space-y-4">
                {deals.map(deal => (
                  <div key={deal.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">{deal.name}</p>
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] font-black text-primary">${deal.value?.toLocaleString()}</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{deal.stage}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quick Labels</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-500 font-black text-[9px] uppercase tracking-widest border border-slate-100 dark:border-slate-700">Enterprise</span>
              <span className="px-2 py-1 rounded bg-primary/5 text-primary font-black text-[9px] uppercase tracking-widest border border-primary/10">VIP Client</span>
            </div>
          </div>
        </aside>
      </main>
  )
}
