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
       <div className="flex flex-col items-center justify-center py-20">
         <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
         <p className="text-muted font-medium">Laddar kontaktdata...</p>
       </div>
     )
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="flex items-start gap-4">
          <div className={`mt-2 w-3 h-3 rounded-full glow-${computedStatus} bg-current text-${computedStatus === 'red' ? 'red-500' : computedStatus === 'yellow' ? 'yellow-500' : 'green-500'}`}></div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">{statusLabel(computedStatus)} Profile</p>
            <h1 className="text-5xl font-black text-primary tracking-tight">{name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <button 
             onClick={handleDelete} 
             className="text-[10px] font-black text-red-500/50 hover:text-red-500 transition-colors uppercase tracking-widest"
           >
             Terminera Kontakt
           </button>
           <button 
             onClick={handleSave} 
             className="btn-primary px-10 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-accent-primary/20"
           >
             Uppdatera Central
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 space-y-12">
          {/* Main Info Card */}
          <div className="card border-color p-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <span className="text-8xl font-black italic">ID: {id?.slice(0, 4)}</span>
             </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-8 pl-1">Datalager: Kontaktinfo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-3 ml-1">Fullständigt Namn</label>
                <input value={name} onChange={e => setName(e.target.value)} className="input-field py-3 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-3 ml-1">Företagsorganisation</label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="input-field py-3 text-sm appearance-none">
                  <option value="">Ingen koppling</option>
                  {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-3 ml-1">E-postadress</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field py-3 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-3 ml-1">Kontaktnummer</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="input-field py-3 text-sm font-bold" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-3 ml-1">LinkedIn Intelligence URL</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">🔗</span>
                  <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} className="input-field pl-12 py-3 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted pl-1">Operationslogg / Historik</h3>
            <div className="relative pl-8 border-l border-color space-y-8">
              {activities.length === 0 ? (
                <div className="py-12 border border-color border-dashed rounded-2xl text-center">
                  <p className="text-muted text-xs font-bold uppercase tracking-widest italic">Loggen är tom. Inga operationer registrerade.</p>
                </div>
              ) : (
                activities.map(act => (
                  <div key={act.id} className="relative group">
                    <div className="absolute -left-[41px] top-1 w-4 h-4 rounded-full bg-secondary border-4 border-card group-hover:bg-accent-primary transition-colors"></div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                       <div className="flex items-center gap-3">
                          <span className="text-[9px] font-black uppercase tracking-widest text-accent-primary bg-accent-soft/30 px-2 py-0.5 rounded border border-accent-primary/20">
                            {act.type}
                          </span>
                          <span className="text-primary text-[11px] font-black italic opacity-50 uppercase tracking-tighter">
                            Registered by System
                          </span>
                       </div>
                       <span className="text-[10px] text-muted font-black uppercase tracking-widest">
                         {new Date(act.timestamp).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                       </span>
                    </div>
                    <div className="card border-color p-5 hover:border-muted transition-colors">
                       <p className="text-sm text-primary leading-relaxed font-bold">{act.notes || <span className="italic opacity-30">Inga anteckningar registrerade...</span>}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="lg:col-span-5 space-y-8">
            <div className="card p-8 border-color bg-gradient-to-b from-card to-secondary sticky top-8 shadow-2xl border-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-accent-primary mb-8 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></span>
                Logga Ny Operation
              </h3>
              <form onSubmit={handleAddActivity} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Typ av Händelse</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['call', 'meeting', 'email', 'note'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setNewActivity({ ...newActivity, type })}
                        className={`py-3 text-[10px] font-black uppercase tracking-widest rounded-xl border-2 transition-all ${
                          newActivity.type === type ? 'border-accent-primary bg-accent-soft/20 text-accent-primary' : 'border-color hover:border-muted'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Operations-notat</label>
                  <textarea 
                    value={newActivity.notes} 
                    onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })} 
                    className="input-field bg-primary py-4 text-sm font-bold resize-none min-h-[160px]" 
                    placeholder="Sammanfatta händelsen och definiera nästa steg..."
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  ARKIVERA HÄNDELSE
                </button>
              </form>
              
              <div className="mt-12 pt-8 border-t border-color">
                 <h4 className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Sandra Intelligence Analysis</h4>
                 <div className="p-4 bg-primary/50 border border-color rounded-xl">
                    <p className="text-[10px] text-muted leading-relaxed font-bold uppercase tracking-tight">
                       Baserat på nuvarande status ({statusLabel(computedStatus)}) rekommenderar systemet en uppföljning inom 48 timmar för att bibehålla momentum i affärscykeln.
                    </p>
                 </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}
