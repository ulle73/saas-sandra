import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'

export default function Contacts({ session }) {
  const router = useRouter()
  const [contacts, setContacts] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
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
    try {
      // Fetch contacts
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('*, companies(*)')
        .eq('user_id', session.user.id)
        .order('name')
      setContacts(contactsData || [])

      // Fetch companies for dropdown
      const { data: companiesData } = await supabase
        .from('companies')
        .select('id, name')
      setCompanies(companiesData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    fetchData()
  }

  const getStatusClass = (contact) => {
    const now = new Date()
    const nextActivity = contact.next_activity ? new Date(contact.next_activity) : null
    const lastTouchpoint = contact.last_touchpoint ? new Date(contact.last_touchpoint) : null
    const weeksSinceContact = lastTouchpoint ? (now - lastTouchpoint) / (1000 * 60 * 60 * 24 * 7) : Infinity

    if (nextActivity && nextActivity > now) return 'status-green'
    if (weeksSinceContact < 4) return 'status-yellow'
    return 'status-red'
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">🔐 Lösen</h1>
              <div className="ml-8 flex space-x-4">
                <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
                <Link href="/contacts" className="text-blue-600 font-medium">Contacts</Link>
                <Link href="/companies" className="text-gray-600 hover:text-gray-900">Companies</Link>
                <Link href="/leads" className="text-gray-600 hover:text-gray-900">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center">
              <Link href="/contacts/new" className="btn-primary mr-4">+ Add Contact</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">👥 Contacts ({filteredContacts.length})</h2>
          
          {/* Filters */}
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field w-64"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-40"
            >
              <option value="all">All Status</option>
              <option value="green">🟢 Active</option>
              <option value="yellow">🟡 Recent</option>
              <option value="red">🔴 Needs Attention</option>
            </select>
          </div>
        </div>

        {/* Contacts Table */}
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Company</th>
                <th className="table-header">Email</th>
                <th className="table-header">Last Contact</th>
                <th className="table-header">Next Activity</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredContacts.map(contact => (
                <tr key={contact.id} className={getStatusClass(contact)}>
                  <td className="table-cell font-medium">{contact.name}</td>
                  <td className="table-cell">{contact.companies?.name || '-'}</td>
                  <td className="table-cell">{contact.email || '-'}</td>
                  <td className="table-cell">
                    {contact.last_touchpoint 
                      ? new Date(contact.last_touchpoint).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="table-cell">
                    {contact.next_activity 
                      ? new Date(contact.next_activity).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                      ${contact.status === 'green' ? 'bg-green-200 text-green-800' :
                        contact.status === 'yellow' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-red-200 text-red-800'}`}>
                      {contact.status === 'green' ? '🟢 Active' :
                       contact.status === 'yellow' ? '🟡 Recent' : '🔴 Needs Attention'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <Link href={`/contacts/${contact.id}`} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </Link>
                    <button
                      onClick={() => deleteContact(contact.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredContacts.length === 0 && (
            <p className="text-center py-8 text-gray-500">No contacts found</p>
          )}
        </div>
      </main>
    </div>
  )
}