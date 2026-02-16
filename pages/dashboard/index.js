import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { computeContactStatus } from '../../lib/contactStatus'

export default function Dashboard({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [stats, setStats] = useState({ green: 0, yellow: 0, red: 0, total: 0, totalValue: 0 })
  const [leads, setLeads] = useState([])
  const [recentActivities, setRecentActivities] = useState([])
  const [matchedCompanies, setMatchedCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchDashboardData()
  }, [session, router])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch stats
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', session.user.id)

      if (contactsError) throw contactsError

      const counts = { green: 0, yellow: 0, red: 0, total: contacts?.length || 0, totalValue: 0 }
      contacts?.forEach((contact) => {
        const status = computeContactStatus(contact)
        counts[status] += 1
        counts.totalValue += 25000 // Mock value for visualization
      })
      setStats(counts)

      // Fetch recent leads
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*, company:companies(name)')
        .order('published_at', { ascending: false })
        .limit(5)
      setLeads(leadsData || [])

      // Fetch matched companies
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .limit(6)
      setMatchedCompanies(companiesData || [])

      // Set mock activities for visual completeness
      setRecentActivities([
        { company: 'Acme Corp', action: 'Inbokat möte via Outlook', time: '2h sedan', type: 'meeting' },
        { company: 'Global Tech', action: 'Uppföljningssamtal genomfört', time: '5h sedan', type: 'call' },
        { company: 'Starlight Inc', action: 'Kritisk signal: Ny VD', time: '1d sedan', type: 'alert' }
      ])

    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium">Laddar kontrollcenter...</p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <header className="flex justify-between items-end">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">SaaS Overview</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Status Insight</h1>
        </div>
        <div className="flex gap-3">
          <button className="w-10 h-10 border border-color rounded-xl flex items-center justify-center hover:bg-card transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button className="w-10 h-10 border border-color rounded-xl flex items-center justify-center hover:bg-card transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card border-l-4 border-l-status-green">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Totalt värde</p>
          <div className="text-4xl font-black text-primary mb-1">
            {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(stats.totalValue)}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-green animate-pulse" />
            <span className="text-xs text-secondary font-medium">{stats.total} kontakter</span>
          </div>
        </div>

        <div className="card border-l-4 border-l-status-green">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Aktiv Status</p>
          <div className="text-4xl font-black text-status-green mb-1">{stats.green}</div>
          <p className="text-xs text-secondary font-medium">Friska konton</p>
        </div>

        <div className="card border-l-4 border-l-status-yellow">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Nya Touchpoints</p>
          <div className="text-4xl font-black text-status-yellow mb-1">{stats.yellow}</div>
          <p className="text-xs text-secondary font-medium">Behöver uppföljning</p>
        </div>

        <div className="card border-l-4 border-l-status-red">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">Behöver Action</p>
          <div className="text-4xl font-black text-status-red mb-1">{stats.red}</div>
          <p className="text-xs text-secondary font-medium">Kritiska signaler</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Feed */}
        <div className="col-span-1 lg:col-span-8 space-y-8">
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-primary">Nyligen Genererade Leads</h2>
              <Link href="/leads">
                <span className="text-xs font-bold text-muted hover:text-primary cursor-pointer transition-colors uppercase tracking-widest">Visa alla</span>
              </Link>
            </div>
            <div className="card p-0 overflow-hidden divide-y divide-color">
              {leads.map((lead) => (
                <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary border border-color flex items-center justify-center text-secondary font-bold group-hover:border-muted transition-colors">
                      {lead.company?.name?.[0] || 'L'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-primary">{lead.company?.name}</h3>
                      <p className="text-xs text-muted truncate max-w-md">{lead.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="hidden sm:block text-[10px] text-muted font-bold uppercase tracking-widest">
                      {new Date(lead.published_at).toLocaleDateString('sv-SE')}
                    </span>
                    <button className="text-xs font-black text-primary px-3 py-1.5 rounded-lg border border-color hover:bg-primary transition-colors">
                      Insikt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-primary">Viktiga Företag</h2>
              <span className="text-xs font-bold text-muted uppercase tracking-widest">Bevakning</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {matchedCompanies.slice(0, 4).map((comp) => (
                <Link key={comp.id} href={`/companies/${comp.id}`}>
                  <div className="card hover:border-muted transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-xs font-black text-primary uppercase tracking-wider">{comp.name}</div>
                      <span className="w-2 h-2 rounded-full bg-status-green shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="text-xs text-muted leading-relaxed line-clamp-2">
                       Nya signaler har detekterats för {comp.name} gällande din uppsatta bevakningslista.
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar Context */}
        <div className="col-span-1 lg:col-span-4 space-y-8">
          <section className="card bg-gradient-to-br from-card to-secondary border-color">
            <h3 className="text-sm font-bold text-primary mb-6">Aktivitetslogg</h3>
            <div className="space-y-6">
              {recentActivities.map((activity, idx) => (
                <div key={idx} className="flex gap-4 relative">
                  {idx !== recentActivities.length - 1 && (
                    <div className="absolute left-[7px] top-6 bottom-[-16px] w-[1px] bg-border" />
                  )}
                  <div className={`mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-primary ${
                    activity.type === 'meeting' ? 'bg-status-green' : 
                    activity.type === 'call' ? 'bg-status-yellow' : 'bg-status-red'
                  }`} />
                  <div>
                    <p className="text-xs font-bold text-primary leading-none mb-1">{activity.company}</p>
                    <p className="text-[10px] text-muted font-medium mb-1">{activity.action}</p>
                    <p className="text-[10px] text-muted opacity-50">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card border-color">
            <h3 className="text-sm font-bold text-primary mb-4">Snabba Filter</h3>
            <div className="flex flex-wrap gap-2">
              {['Hög prio', 'Bevakas', 'I konversation', 'Ingen kontakt'].map(tag => (
                <span key={tag} className="px-2.5 py-1 rounded-md bg-secondary border border-color text-[10px] font-bold text-muted hover:text-primary hover:border-muted cursor-pointer transition-colors">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
