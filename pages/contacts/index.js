import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
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

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar kontakter...</p>
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
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Dashboard</Link>
                <Link href="/contacts" className="px-3 py-2 rounded-md text-sm font-medium bg-accent-soft text-accent-primary">Contacts</Link>
                <Link href="/companies" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Companies</Link>
                <Link href="/leads" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <Link href="/contacts/new" className="btn-primary py-1.5 px-4 text-xs">+ Kontakt</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-primary tracking-tight">Kontakter</h2>
            <p className="text-secondary mt-1">Hantera dina kundrelationer och deras status.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">🔍</span>
              <input
                type="text"
                placeholder="Sök namn, e-post..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-9 w-64 text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-40 text-sm"
            >
              <option value="all">Alla Statusar</option>
              <option value="green">🟢 Aktiv</option>
              <option value="yellow">🟡 Nylig</option>
              <option value="red">🔴 Attention</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="card p-0 overflow-hidden border-color">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-color">
              <thead>
                <tr>
                  <th className="table-header w-[25%] font-black">Namn</th>
                  <th className="table-header w-[20%]">Företag</th>
                  <th className="table-header w-[15%]">Senast</th>
                  <th className="table-header w-[15%]">Nästa</th>
                  <th className="table-header w-[15%]">Status</th>
                  <th className="table-header w-[10%] text-right pr-6">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="bg-primary divide-y divide-color">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="group hover:bg-secondary transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          contact.status === 'green' ? 'bg-status-green-border' :
                          contact.status === 'yellow' ? 'bg-status-yellow-border' :
                          'bg-status-red-border'
                        }`}></div>
                        <span className="font-bold text-primary">{contact.name}</span>
                      </div>
                      <div className="text-[10px] text-muted ml-5">{contact.email || 'Ingen e-post'}</div>
                    </td>
                    <td className="table-cell font-medium text-secondary">
                      {contact.companies?.name || '-'}
                    </td>
                    <td className="table-cell text-sm text-secondary">
                      {contact.last_touchpoint 
                        ? new Date(contact.last_touchpoint).toLocaleDateString()
                        : <span className="text-muted">Inget data</span>}
                    </td>
                    <td className="table-cell text-sm text-secondary">
                      {contact.next_activity 
                        ? <span className="font-semibold text-accent-primary">{new Date(contact.next_activity).toLocaleDateString()}</span>
                        : '-'}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        contact.status === 'green' ? 'badge-green' :
                        contact.status === 'yellow' ? 'badge-yellow' :
                        'badge-red'
                      }`}>
                        {statusLabel(contact.status)}
                      </span>
                    </td>
                    <td className="table-cell text-right pr-6">
                      <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                        <Link href={`/contacts/${contact.id}`} className="p-1 px-2 text-xs font-bold bg-accent-soft text-accent-primary rounded-md hover:bg-accent-primary hover:text-white transition-colors">
                          Edit
                        </Link>
                        <button
                          onClick={() => deleteContact(contact.id)}
                          className="p-1 px-2 text-xs font-bold bg-red-50 text-red-600 rounded-md hover:bg-red-600 hover:text-white transition-colors"
                        >
                          Radera
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredContacts.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center">
              <span className="text-5xl mb-4">📭</span>
              <p className="text-secondary font-bold">Inga kontakter hittades</p>
              <p className="text-muted text-xs mt-1">Försök ändra din sökning eller filter.</p>
              <button onClick={() => {setSearchTerm(''); setFilterStatus('all');}} className="mt-4 text-accent-primary text-xs font-bold underline">Rensa filter</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
