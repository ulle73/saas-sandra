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
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar formulär...</p>
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
              <button onClick={() => router.back()} className="text-sm font-bold text-secondary hover:text-primary transition-all">Avbryt</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black text-primary tracking-tight">Skapa ny kontakt</h2>
          <p className="text-secondary mt-2">Lägg till en ny person i ditt säljnätverk.</p>
        </div>

        <div className="card max-w-xl mx-auto border-color shadow-xl overflow-hidden">
          <div className="h-1.5 w-full bg-accent-primary opacity-50"></div>
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm font-medium">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted mb-2">Fullständigt namn</label>
                <input
                  type="text"
                  required
                  placeholder="t.ex. Erik Johansson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-muted mb-2">E-post</label>
                  <input
                    type="email"
                    placeholder="erik@foretag.se"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-muted mb-2">Telefon</label>
                  <input
                    type="text"
                    placeholder="070-123 45 67"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted mb-2">LinkedIn URL</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔗</span>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    value={linkedin}
                    onChange={e => setLinkedin(e.target.value)}
                    className="input-field pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted mb-2">Företagskoppling</label>
                <select
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Ingen koppling</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4">
              <button 
                type="submit" 
                disabled={loading} 
                className="btn-primary w-full py-3 text-sm font-black uppercase tracking-widest transition-all hover:shadow-lg disabled:opacity-50"
              >
                {loading ? 'Sparar...' : 'Spara Kontakt'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
