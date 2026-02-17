import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import AppShell from '../../components/AppShell'
import { computeContactStatus, statusLabel } from '../../lib/contactStatus'

export default function Contacts({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchData()
  }, [session, router])

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      // Fetch contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*, companies(id, name)')
        .eq('user_id', session.user.id)
        .order('name')

      if (contactsError) throw contactsError

      const normalizedContacts = (contactsData || []).map((contact) => ({
        ...contact,
        status: computeContactStatus(contact),
      }))
      setContacts(normalizedContacts)

    } catch (error) {
      console.error('Error fetching data:', error.message)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    fetchData()
  }

  const getStatusClass = (contact) => {
    if (contact.status === 'green') return 'status-green'
    if (contact.status === 'yellow') return 'status-yellow'
    return 'status-red'
  }

  const getStatusBadgeClass = (status) => {
    if (status === 'green') return 'badge badge-status-converted'
    if (status === 'yellow') return 'badge badge-status-new'
    return 'badge badge-status-rejected'
  }

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <AppShell
      title={`Contacts (${filteredContacts.length})`}
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<Link href="/contacts/new" className="btn-primary">+ Add Contact</Link>}
    >
      <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field"
        >
          <option value="all">All Status</option>
          <option value="green">Active</option>
          <option value="yellow">Recent</option>
          <option value="red">Needs Attention</option>
        </select>
        <button onClick={fetchData} className="btn-secondary">Refresh</button>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="table-header">Contact</th>
              <th className="table-header">Company</th>
              <th className="table-header">Status</th>
              <th className="table-header">Last / Next</th>
              <th className="table-header">Quick Contact</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((contact) => (
              <tr key={contact.id} className={getStatusClass(contact)}>
                <td className="table-cell">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-xs muted">{contact.linkedin_url ? 'LinkedIn connected' : 'No LinkedIn URL'}</p>
                </td>
                <td className="table-cell">{contact.companies?.name || '-'}</td>
                <td className="table-cell">
                  <span className={getStatusBadgeClass(contact.status)}>
                    {statusLabel(contact.status)}
                  </span>
                </td>
                <td className="table-cell text-xs">
                  <p>{contact.last_touchpoint ? new Date(contact.last_touchpoint).toLocaleDateString() : '-'}</p>
                  <p className="muted">{contact.next_activity ? new Date(contact.next_activity).toLocaleDateString() : '-'}</p>
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-3 text-lg">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} title={contact.email} className="icon-btn">✉</a>
                    ) : (
                      <span className="icon-btn opacity-40">✉</span>
                    )}
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} title={contact.phone} className="icon-btn">☎</a>
                    ) : (
                      <span className="icon-btn opacity-40">☎</span>
                    )}
                  </div>
                </td>
                <td className="table-cell">
                  <Link href={`/contacts/${contact.id}`} className="mr-3 hover:underline">Edit</Link>
                  <button onClick={() => deleteContact(contact.id)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredContacts.length === 0 && (
          <p className="text-center py-8 muted">No contacts found</p>
        )}
      </div>
    </AppShell>
  )
}
