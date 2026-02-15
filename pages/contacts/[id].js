import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'

export default function EditContact({ session }) {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [contact, setContact] = useState({})
  const [companies, setCompanies] = useState([])

  // Activity state
  const [activities, setActivities] = useState([])
  const [newActivity, setNewActivity] = useState({ type: 'call', notes: '' })

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [status, setStatus] = useState('yellow')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    if (!id) return
    // Load contact, companies, activities
    const fetchAll = async () => {
      const [{ data: contactData }, { data: companiesData }, { data: activityData }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).single(),
        supabase.from('companies').select('id, name'),
        supabase.from('activities').select('*, contacts(*)').eq('contact_id', id).order('timestamp', { ascending: false }),
      ])
      if (contactData) {
        setContact(contactData)
        setName(contactData.name || '')
        setEmail(contactData.email || '')
        setPhone(contactData.phone || '')
        setLinkedin(contactData.linkedin_url || '')
        setCompanyId(contactData.company_id || '')
        setStatus(contactData.status || 'yellow')
      }
      setCompanies(companiesData || [])
      setActivities(activityData || [])
      setLoading(false)
    }
    fetchAll()
  }, [session, id, router])

  const handleSave = async () => {
    setLoading(true)
    const updates = {
      name,
      email: email || null,
      phone: phone || null,
      linkedin_url: linkedin || null,
      company_id: companyId || null,
      status,
    }
    await supabase.from('contacts').update(updates).eq('id', id)
    router.push('/contacts')
  }

  const handleDelete = async () => {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    router.push('/contacts')
  }

  const handleAddActivity = async (e) => {
    e.preventDefault()
    const payload = {
      contact_id: id,
      type: newActivity.type,
      notes: newActivity.notes,
      timestamp: new Date().toISOString(),
    }
    await supabase.from('activities').insert(payload)
    // Refresh activities list
    const { data } = await supabase.from('activities').select('*, contacts(*)').eq('contact_id', id).order('timestamp', { ascending: false })
    setActivities(data || [])
    setNewActivity({ type: 'call', notes: '' })
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">✏️ Edit Contact</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto py-8">
        {/* Contact form */}
        <div className="card p-6 space-y-4 mb-8">
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
            <label className="block font-medium mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input-field">
              <option value="green">🟢 Active</option>
              <option value="yellow">🟡 Recent</option>
              <option value="red">🔴 Needs Attention</option>
            </select>
          </div>
          <div className="flex justify-between pt-4">
            <button onClick={handleDelete} className="text-red-600 hover:underline">Delete</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </div>

        {/* Activity list */}
        <div className="card p-4 mb-8">
          <h3 className="text-lg font-semibold mb-3">📓 Activities</h3>
          {activities.length === 0 ? (
            <p className="text-gray-500">No activities recorded.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map(act => (
                <li key={act.id} className="border-b pb-2">
                  <p className="font-medium">{act.type.charAt(0).toUpperCase() + act.type.slice(1)}</p>
                  <p className="text-sm text-gray-600">{new Date(act.timestamp).toLocaleString()}</p>
                  {act.notes && <p className="mt-1">{act.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new activity */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-3">➕ Add Activity</h3>
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
        </div>
      </main>
    </div>
  )
}
