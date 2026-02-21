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
        <section className="card page-form form-hero">
          <p className="form-hero-kicker">Contacts</p>
          <h1 className="form-hero-title">Create Contact</h1>
          <p className="form-hero-copy">Add a clean profile and optionally link it to a company for better follow-up accuracy.</p>
        </section>

        <form onSubmit={handleSubmit} className="card page-form stack-lg">
          {error && <p className="form-error">{error}</p>}
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
              <p className="tiny-copy muted top-gap-xs">No companies yet. Create one first if you want account-level tracking.</p>
            )}
          </div>
          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Saving...' : 'Create Contact'}
          </button>
          {loadingCompanies && <p className="small-copy muted">Loading companies...</p>}
        </form>
      </div>
  )
}
