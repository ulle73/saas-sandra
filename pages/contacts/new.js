import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function NewContact({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }

    const loadCompanies = async () => {
      const { data, error: companiesError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('user_id', session.user.id)
        .order('name')

      if (companiesError) {
        setError(companiesError.message)
      } else {
        setCompanies(data || [])
      }
      setLoadingCompanies(false)
    }

    loadCompanies()
  }, [router, session])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.from('contacts').insert({
        user_id: session.user.id,
        name,
        email,
        phone,
        linkedin_url: linkedin,
        company_id: companyId || null,
        last_touchpoint: new Date().toISOString(),
      })
      if (error) throw error
      router.push('/contacts')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loadingCompanies) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium">Initialiserar formulär...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Relationship Management</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Ny Kontakt</h1>
        </div>
        <div>
          <button 
            onClick={() => router.back()} 
            className="text-xs font-black text-muted hover:text-primary transition-colors uppercase tracking-widest border-b-2 border-transparent hover:border-primary pb-1"
          >
            Avbryt & Gå tillbaka
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <div className="card border-color overflow-hidden">
            <div className="h-1.5 w-full bg-accent-primary opacity-80"></div>
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold uppercase tracking-widest">
                  {error}
                </div>
              )}
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">Identitet & Namn</label>
                  <input
                    type="text"
                    required
                    placeholder="Fullständigt namn"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="input-field py-4 text-base font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">E-postadress</label>
                    <input
                      type="email"
                      placeholder="namn@domän.se"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input-field py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">Telefonnummer</label>
                    <input
                      type="text"
                      placeholder="+46 70 000 00 00"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="input-field py-3 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">LinkedIn Intelligence</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">🔗</span>
                    <input
                      type="url"
                      placeholder="https://linkedin.com/in/..."
                      value={linkedin}
                      onChange={e => setLinkedin(e.target.value)}
                      className="input-field pl-12 py-3 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">Företagskoppling (CRM)</label>
                  <select
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    className="input-field py-3 text-sm appearance-none"
                  >
                    <option value="">Ej kopplad till bolag</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-6 border-t border-color flex justify-end">
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary py-4 px-12 text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'SPARAR...' : 'SLUTFÖR & REGISTRERA'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <div className="card bg-secondary/30 border-dashed">
              <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-4">Varför är detta viktigt?</h3>
              <p className="text-muted text-xs leading-relaxed font-medium">
                 Genom att registrera en ny kontakt med rätt LinkedIn-koppling kan SANDRA automatiskt börja bevaka signaler som rör personens roll och bolag. 
              </p>
           </div>
           <div className="card bg-accent-soft/20 border-accent-primary/20">
              <h3 className="text-xs font-black text-accent-primary uppercase tracking-widest mb-4">Sandra Tips ✨</h3>
              <p className="text-accent-primary/80 text-xs leading-relaxed font-medium">
                 Lägg till LinkedIn-URL för att möjliggöra djupare signalanalys och kontextuella pitchar i framtiden.
              </p>
           </div>
        </div>
      </div>
    </div>
  )
}
