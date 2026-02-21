import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import StatusBadge from '../../components/StatusBadge'
import { computeContactStatus } from '../../lib/contactStatus'

export default function Contacts({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [deleteLoadingId, setDeleteLoadingId] = useState('')

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

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesFilter
  })

  if (loading) return null

  const escapeCsvCell = (value) => {
    const text = String(value ?? '')
    if (!/[",\n]/.test(text)) return text
    return `"${text.replace(/"/g, '""')}"`
  }

  const handleExport = () => {
    const header = ['Name', 'Email', 'Company', 'Status', 'Last Touchpoint', 'Next Activity']
    const rows = filteredContacts.map((contact) => [
      contact.name,
      contact.email || '',
      contact.companies?.name || '',
      contact.status || '',
      contact.last_touchpoint ? new Date(contact.last_touchpoint).toISOString() : '',
      contact.next_activity ? new Date(contact.next_activity).toISOString() : '',
    ])

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (contactId) => {
    if (!confirm('Delete this contact?')) return

    setDeleteLoadingId(contactId)
    setError('')
    try {
      const { error: deleteError } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId)
        .eq('user_id', session.user.id)

      if (deleteError) throw deleteError
      setContacts((current) => current.filter((contact) => contact.id !== contactId))
    } catch (deleteErr) {
      setError(deleteErr.message || 'Failed to delete contact')
    } finally {
      setDeleteLoadingId('')
    }
  }

  return (
    <div className="ux-page-stack ux-section-stagger">
      {/* Table Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{contacts.length} total relationships managed</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <span className="material-symbols-outlined text-lg">file_download</span>
            Export
          </button>
          <Link href="/contacts/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
            <span className="material-symbols-outlined text-lg">add</span>
            Add Contact
          </Link>
        </div>
      </div>

      {/* Filters Area */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[300px] relative group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm text-slate-700 dark:text-slate-100 transition-all"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="green">Upcoming Activity</option>
          <option value="yellow">Recent Contact</option>
          <option value="red">Stale (&gt;4 weeks)</option>
        </select>
      </div>

      {error && <p className="p-4 bg-rose-50 text-rose-600 rounded-lg border border-rose-100 mb-6">{error}</p>}

      {/* Contact Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[760px] text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Contact Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Email Address</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Linked Company</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Relationship Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">No contacts found matching your criteria.</td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{contact.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Contact</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <a className="text-sm text-primary hover:underline font-medium" href={`mailto:${contact.email}`} target="_blank" rel="noopener noreferrer">
                      {contact.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">
                    {contact.companies?.name || 'Independent'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={contact.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/contacts/${contact.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="p-2 text-slate-400 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </Link>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDelete(contact.id)
                        }}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-60"
                        disabled={deleteLoadingId === contact.id}
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
