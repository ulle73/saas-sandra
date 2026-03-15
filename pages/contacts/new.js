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

  if (!session) {
    return null
  }

  return (
      <div className="page-medium ux-page-stack ux-fade-in">
        <section className="glass-panel text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contacts</p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Create Contact</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Add a clean profile and optionally link it to a company for better follow-up accuracy.</p>
        </section>

        <form onSubmit={handleSubmit} className="glass-panel space-y-5">
          {error && <p className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-500/10 p-3 rounded-lg border border-rose-100 dark:border-rose-500/20">{error}</p>}
          <div>
            <label className="form-label">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input
              type="url"
              value={linkedin}
              onChange={e => setLinkedin(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="form-label">Company</label>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="input-field"
            >
              <option value="">-- None --</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!loadingCompanies && companies.length === 0 && (
              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">No companies yet. Create one first if you want account-level tracking.</p>
            )}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Saving...' : 'Create Contact'}
          </button>
          {loadingCompanies && <p className="text-slate-400 text-xs text-center mt-2">Loading companies...</p>}
        </form>
      </div>
  )
}
