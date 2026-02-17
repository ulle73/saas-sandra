import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'

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
    <AppShell
      title="New Contact"
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<button type="button" onClick={() => router.push('/contacts')} className="btn-secondary">Back</button>}
    >
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5 card p-6">
          {error && <p className="text-red-600">{error}</p>}
          <div>
            <label className="block font-medium mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">LinkedIn URL</label>
            <input
              type="url"
              value={linkedin}
              onChange={e => setLinkedin(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Company</label>
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
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Saving...' : 'Create Contact'}
          </button>
          {loadingCompanies && <p className="text-sm muted">Loading companies...</p>}
        </form>
      </div>
    </AppShell>
  )
}
