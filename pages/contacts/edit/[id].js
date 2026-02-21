import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../../lib/supabase'

export default function EditContact({ session }) {
  const router = useRouter()
  const { id } = router.query

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    if (!id) return

    const loadData = async () => {
      setLoading(true)
      setError('')

      try {
        const [
          { data: contactData, error: contactError },
          { data: companyData, error: companyError },
        ] = await Promise.all([
          supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .single(),
          supabase
            .from('companies')
            .select('id, name')
            .eq('user_id', session.user.id)
            .order('name'),
        ])

        if (contactError) throw contactError
        if (companyError) throw companyError

        setCompanies(companyData || [])
        setName(contactData.name || '')
        setEmail(contactData.email || '')
        setPhone(contactData.phone || '')
        setLinkedin(contactData.linkedin_url || '')
        setCompanyId(contactData.company_id || '')
      } catch (loadError) {
        setError(loadError.message || 'Failed to load contact')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id, router, session])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!id) return

    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          name,
          email: email || null,
          phone: phone || null,
          linkedin_url: linkedin || null,
          company_id: companyId || null,
        })
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (updateError) throw updateError
      router.push(`/contacts/${id}`)
    } catch (updateErr) {
      setError(updateErr.message || 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="page-medium ux-fade-in">
      <form onSubmit={handleSubmit} className="card page-form stack-lg">
        <div className="between-row">
          <h1 className="section-title">Edit Contact</h1>
          <button type="button" className="btn-secondary" onClick={() => router.push(`/contacts/${id}`)}>
            Back
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div>
          <label className="form-label">Name</label>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} required className="input-field" />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} className="input-field" />
        </div>
        <div>
          <label className="form-label">LinkedIn URL</label>
          <input type="url" value={linkedin} onChange={(event) => setLinkedin(event.target.value)} className="input-field" />
        </div>
        <div>
          <label className="form-label">Company</label>
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="input-field">
            <option value="">-- None --</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-primary btn-full" disabled={saving}>
          {saving ? 'Saving...' : 'Save Contact'}
        </button>
      </form>
    </div>
  )
}
