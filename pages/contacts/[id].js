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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <AppShell
      title="Edit Contact"
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<button type="button" onClick={() => router.push('/contacts')} className="btn-secondary">Back</button>}
    >
      <div className="max-w-3xl page-stack">
        <section className="card p-6 space-y-4">
          {error && <p className="text-red-600">{error}</p>}
          <div>
            <label className="block font-medium mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">LinkedIn URL</label>
            <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">Company</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="input-field">
              <option value="">-- None --</option>
              {companies.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
        <div>
          <label className="block font-medium mb-1">Status (auto-calculated)</label>
          <p className="panel-soft p-3">{statusLabel(computedStatus)}</p>
        </div>
          <div className="flex justify-between pt-4">
            <button onClick={handleDelete} className="text-red-600 hover:underline">Delete</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="section-title mb-3">Activities</h3>
          {activities.length === 0 ? (
            <p className="muted">No activities recorded.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map(act => (
                <li key={act.id} className="border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-medium">{act.type.charAt(0).toUpperCase() + act.type.slice(1)}</p>
                  <p className="text-sm muted">{new Date(act.timestamp).toLocaleString()}</p>
                  {act.notes && <p className="mt-1">{act.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h3 className="section-title mb-3">Add Activity</h3>
          <form onSubmit={handleAddActivity} className="space-y-4">
            <div>
              <label className="block font-medium mb-1">Type</label>
              <select value={newActivity.type} onChange={e => setNewActivity({ ...newActivity, type: e.target.value })} className="input-field">
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="email">Email</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Notes</label>
              <textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })} className="input-field" rows={3} />
            </div>
            <button type="submit" className="btn-primary w-full">Add Activity</button>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
