import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { computeContactStatus, statusLabel } from '../../lib/contactStatus'

export default function EditContact({ session, theme, toggleTheme }) {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [companies, setCompanies] = useState([])
  const [computedStatus, setComputedStatus] = useState('red')

  // Activity state
  const [activities, setActivities] = useState([])
  const [newActivity, setNewActivity] = useState({ type: 'call', notes: '' })

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [companyId, setCompanyId] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    if (!id) return
    // Load contact, companies, activities
    const fetchAll = async () => {
      setLoading(true)
      setError('')

      const [{ data: contactData, error: contactError }, { data: companiesData, error: companiesError }, { data: activityData, error: activityError }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).eq('user_id', session.user.id).single(),
        supabase.from('companies').select('id, name').eq('user_id', session.user.id).order('name'),
        supabase
          .from('activities')
          .select('*')
          .eq('contact_id', id)
          .eq('user_id', session.user.id)
          .order('timestamp', { ascending: false }),
      ])

      if (contactError || companiesError || activityError) {
        setError(contactError?.message || companiesError?.message || activityError?.message || 'Failed to load contact')
        setLoading(false)
        return
      }

      if (contactData) {
        setName(contactData.name || '')
        setEmail(contactData.email || '')
        setPhone(contactData.phone || '')
        setLinkedin(contactData.linkedin_url || '')
        setCompanyId(contactData.company_id || '')
        setComputedStatus(computeContactStatus(contactData))
      }
      setCompanies(companiesData || [])
      setActivities(activityData || [])
      setLoading(false)
    }
    fetchAll()
  }, [session, id, router])

  const handleSave = async () => {
    setLoading(true)
    setError('')
    const updates = {
      name,
      email: email || null,
      phone: phone || null,
      linkedin_url: linkedin || null,
      company_id: companyId || null,
    }
    const { error: updateError } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/contacts')
  }

  const handleDelete = async () => {
    if (!confirm('Delete this contact?')) return
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/contacts')
  }

  const handleAddActivity = async (e) => {
    e.preventDefault()
    setError('')

    const payload = {
      user_id: session.user.id,
      contact_id: id,
      type: newActivity.type,
      notes: newActivity.notes,
      timestamp: new Date().toISOString(),
    }
    const { error: insertError } = await supabase.from('activities').insert(payload)

    if (insertError) {
      setError(insertError.message)
      return
    }

    // Refresh activities list
    const { data, error: refreshError } = await supabase
      .from('activities')
      .select('*')
      .eq('contact_id', id)
      .eq('user_id', session.user.id)
      .order('timestamp', { ascending: false })

    if (refreshError) {
      setError(refreshError.message)
      return
    }

    setActivities(data || [])
    setNewActivity({ type: 'call', notes: '' })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar kontakt...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary text-primary transition-colors duration-200">
      {/* Navigation */}
      <nav className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                <h1 className="text-xl font-bold tracking-tight text-primary">Lösen</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <button onClick={() => router.back()} className="text-sm font-bold text-secondary hover:text-primary transition-all">Gå tillbaka</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`status-badge status-${computedStatus}`}>
                {statusLabel(computedStatus)}
              </span>
              <h2 className="text-3xl font-black text-primary tracking-tight">{name}</h2>
            </div>
            <p className="text-secondary">Hantera kontaktuppgifter och se historik.</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleDelete} 
              className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-all"
            >
              Radera kontakt
            </button>
            <button 
              onClick={handleSave} 
              className="btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-accent-soft transition-all"
            >
              Spara ändringar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="card p-8 border-color shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-6 flex items-center gap-2">
                <span>👤</span> Grunduppgifter
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Namn</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Företag</label>
                  <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="input-field">
                    <option value="">Ingen koppling</option>
                    {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">E-post</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Telefon</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className="input-field" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">LinkedIn URL</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔗</span>
                    <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} className="input-field pl-9" />
                  </div>
                </div>
              </div>
            </div>

            {/* Activities List */}
            <div className="card border-color shadow-sm overflow-hidden">
              <div className="p-6 border-b border-color bg-secondary bg-opacity-30">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted flex items-center gap-2">
                  <span>📓</span> Aktivitetshistorik ({activities.length})
                </h3>
              </div>
              <div className="divide-y divide-color">
                {activities.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-muted text-sm italic">Inga aktiviteter har registrerats för denna kontakt än.</p>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    {activities.map(act => (
                      <div key={act.id} className="p-5 hover:bg-secondary transition-colors group">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary bg-accent-soft px-2 py-0.5 rounded">
                            {act.type}
                          </span>
                          <span className="text-[10px] text-muted font-bold">
                            {new Date(act.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {act.notes && <p className="text-sm text-primary leading-relaxed mt-2">{act.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar: Add Activity */}
          <div className="space-y-6">
            <div className="card p-6 border-color bg-accent-soft bg-opacity-20 border-dashed border-2 sticky top-24">
              <h3 className="text-sm font-black uppercase tracking-widest text-accent-primary mb-6 flex items-center gap-2">
                <span>➕</span> Logga Aktivitet
              </h3>
              <form onSubmit={handleAddActivity} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Typ av händelse</label>
                  <select 
                    value={newActivity.type} 
                    onChange={e => setNewActivity({ ...newActivity, type: e.target.value })} 
                    className="input-field bg-primary border-color text-sm"
                  >
                    <option value="call">Ringde</option>
                    <option value="meeting">Möte</option>
                    <option value="email">Mejlade</option>
                    <option value="note">Notering</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Anteckningar</label>
                  <textarea 
                    value={newActivity.notes} 
                    onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })} 
                    className="input-field bg-primary border-color text-sm resize-none" 
                    rows={4}
                    placeholder="Vad hände? Nästa steg?"
                  />
                </div>
                <button 
                  type="submit" 
                  className="w-full py-3 bg-accent-primary text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg hover:shadow-accent-soft transition-all"
                >
                  Registrera
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
