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
    if (!confirm('Är du säker på att du vill radera denna kontakt?')) return
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

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium">Laddar kontakter...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Relationship Management</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Kontakter</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs transition-colors group-focus-within:text-primary">🔍</span>
            <input
              type="text"
              placeholder="Sök i nätverket..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 w-64 text-xs py-2.5"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-40 text-xs py-2.5"
          >
            <option value="all">Alla Statusar</option>
            <option value="green">🟢 Aktiv</option>
            <option value="yellow">🟡 Nylig</option>
            <option value="red">🔴 Attention</option>
          </select>
          <Link href="/contacts/new">
            <button className="btn-primary py-2.5 px-6 text-xs font-black">
              + NY KONTAKT
            </button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Grid view instead of table for premium feel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContacts.map(contact => (
          <div key={contact.id} className="card group hover:border-muted transition-all relative overflow-hidden">
            {/* Status Indicator Bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              contact.status === 'green' ? 'bg-status-green' :
              contact.status === 'yellow' ? 'bg-status-yellow' :
              'bg-status-red'
            }`} />
            
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 rounded-xl bg-secondary border border-color flex items-center justify-center text-xl font-bold text-primary group-hover:border-muted transition-colors">
                {contact.name[0]}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/contacts/${contact.id}`}>
                  <button className="p-2 border border-color rounded-lg hover:bg-card text-muted hover:text-primary transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                </Link>
                <button 
                  onClick={() => deleteContact(contact.id)}
                  className="p-2 border border-color rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-primary truncate">{contact.name}</h3>
              <p className="text-xs text-muted font-bold uppercase tracking-widest truncate">{contact.companies?.name || 'Inget företag'}</p>
            </div>

            <div className="mt-6 pt-6 border-t border-color grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Senast</p>
                <p className="text-[10px] text-primary font-bold">
                  {contact.last_touchpoint ? new Date(contact.last_touchpoint).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Nästa</p>
                <p className="text-[10px] text-accent-primary font-bold">
                  {contact.next_activity ? new Date(contact.next_activity).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>
            
            <div className="mt-4">
              <span className={`badge ${
                contact.status === 'green' ? 'badge-green' :
                contact.status === 'yellow' ? 'badge-yellow' :
                'badge-red'
              } text-[10px]`}>
                {statusLabel(contact.status).toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredContacts.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center card border-dashed">
          <span className="text-5xl mb-6 grayscale opacity-50">📭</span>
          <p className="text-primary font-black text-xl mb-2">Inga kontakter hittades</p>
          <p className="text-muted text-sm max-w-xs">Försök ändra din sökning eller filter för att hitta det du letar efter.</p>
          <button 
            onClick={() => {setSearchTerm(''); setFilterStatus('all');}} 
            className="mt-8 text-xs font-black text-primary border-b-2 border-primary hover:text-accent-primary hover:border-accent-primary transition-all uppercase tracking-widest"
          >
            Nollställ sökning
          </button>
        </div>
      )}
    </div>
  )
}
