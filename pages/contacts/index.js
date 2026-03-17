import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import StatusBadge from '../../components/StatusBadge'
import { computeContactStatus } from '../../lib/contactStatus'
import { Download, Plus, Search, Filter, ChevronDown, Pen, Trash2 } from 'lucide-react'

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

  const summaryCards = useMemo(() => {
    const totals = { green: 0, yellow: 0, red: 0 }
    contacts.forEach((contact) => {
      if (totals[contact.status] !== undefined) totals[contact.status] += 1
    })

    return [
      {
        key: 'active',
        label: 'Upcoming Activity',
        value: totals.green,
        meta: 'Contacts with planned next step',
      },
      {
        key: 'recent',
        label: 'Recent Contact',
        value: totals.yellow,
        meta: 'Touched recently, no new follow-up yet',
      },
      {
        key: 'stale',
        label: 'Stale >4 Weeks',
        value: totals.red,
        meta: 'Needs immediate reactivation',
      },
      {
        key: 'filtered',
        label: 'Visible in Table',
        value: filteredContacts.length,
        meta: 'Current filtered result set',
      },
    ]
  }, [contacts, filteredContacts.length])

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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{contacts.length} total relationships managed</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="btn-secondary">
            <Download size={18} />
            Export
          </button>
          <Link href="/contacts/new" className="btn-primary">
            <Plus size={18} />
            Add Contact
          </Link>
        </div>
      </div>

      <section className="dashboard-metric-strip">
        {summaryCards.map((card) => (
          <article key={card.key} className="glass-panel dashboard-metric-card">
            <p className="dashboard-metric-label">{card.label}</p>
            <p className="dashboard-metric-value">{card.value}</p>
            <p className="dashboard-metric-meta">{card.meta}</p>
          </article>
        ))}
      </section>

      {/* Filters Area */}
      <div className="glass-panel p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[300px] relative group">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="relative group">
          <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-auto min-w-[150px] pl-9 pr-8 appearance-none cursor-pointer bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors"
          >
            <option value="all">Filter</option>
            <option value="all">— All Statuses —</option>
            <option value="green">Upcoming Activity</option>
            <option value="yellow">Recent Contact</option>
            <option value="red">Stale (&gt;4 weeks)</option>
          </select>
          <ChevronDown size={18} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {error && <p className="p-4 bg-rose-50 text-rose-600 rounded-lg border border-rose-100 mb-6">{error}</p>}

      {/* Contact Data Table */}
      <div className="glass-panel overflow-hidden overflow-x-hidden custom-scrollbar">
        <table className="w-full table-fixed text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="w-[28%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Contact Name</th>
              <th className="w-[26%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Email Address</th>
              <th className="w-[20%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Linked Company</th>
              <th className="w-[18%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Relationship Status</th>
              <th className="w-[8%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">No contacts found matching your criteria.</td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-white font-bold">
                        {contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{contact.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Contact</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 truncate">
                    <a className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:underline transition-colors font-medium truncate inline-block max-w-full" href={`mailto:${contact.email}`} target="_blank" rel="noopener noreferrer">
                      {contact.email}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 font-medium truncate">
                    {contact.companies?.name || 'Independent'}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={contact.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/contacts/${contact.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="p-2 text-slate-400 hover:text-primary transition-colors"
                      >
                        <Pen size={18} />
                      </Link>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDelete(contact.id)
                        }}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-60"
                        disabled={deleteLoadingId === contact.id}
                      >
                        <Trash2 size={18} />
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
