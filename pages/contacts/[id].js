import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'
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

  if (loading) return <div className="screen-center">Loading...</div>

  return (
    <AppShell
      title="Edit Contact"
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<button type="button" onClick={() => router.push('/contacts')} className="btn-secondary">Back</button>}
    >
      <div className="page-narrow page-stack">
        <section className="card page-form stack-md">
          {error && <p className="form-error">{error}</p>}
          <div>
            <label className="form-label">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="form-label">Company</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="input-field">
              <option value="">-- None --</option>
              {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
        <div>
          <label className="form-label">Status (auto-calculated)</label>
          <p className="panel-soft panel-pad">{statusLabel(computedStatus)}</p>
        </div>
          <div className="between-row top-gap-md">
            <button onClick={handleDelete} className="danger-link">Delete</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </section>

        <section className="card panel-pad">
          <h3 className="section-title section-title-gap">Activities</h3>
          {activities.length === 0 ? (
            <p className="muted">No activities recorded.</p>
          ) : (
            <ul className="stack-sm">
              {activities.map(act => (
                <li key={act.id} className="activity-row">
                  <p className="copy-strong">{act.type.charAt(0).toUpperCase() + act.type.slice(1)}</p>
                  <p className="small-copy muted">{new Date(act.timestamp).toLocaleString()}</p>
                  {act.notes && <p className="top-gap-xs">{act.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card page-form">
          <h3 className="section-title section-title-gap">Add Activity</h3>
          <form onSubmit={handleAddActivity} className="stack-md">
            <div>
              <label className="form-label">Type</label>
              <select value={newActivity.type} onChange={e => setNewActivity({ ...newActivity, type: e.target.value })} className="input-field">
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="email">Email</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })} className="input-field" rows={3} />
            </div>
            <button type="submit" className="btn-primary btn-full">Add Activity</button>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
