import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'
import { buildKeywordsFromPresets, buildGoogleAlertsQuery, buildGoogleNewsTestUrl } from '../../lib/newsKeywords'

export default function Companies({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [filterIndustry, setFilterIndustry] = useState('All Industries')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchCompanies()
  }, [session, router])

  const fetchCompanies = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', session.user.id)
        .order('name')

      if (fetchError) throw fetchError
      setCompanies(data || [])
      if (data && data.length > 0 && !selectedCompany) {
        setSelectedCompany(data[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const industries = useMemo(() => {
    const sets = new Set(companies.map(c => c.industry).filter(Boolean))
    return ['All Industries', ...Array.from(sets)]
  }, [companies])

  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (c.industry || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesIndustry = filterIndustry === 'All Industries' || c.industry === filterIndustry
      return matchesSearch && matchesIndustry
    })
  }, [companies, searchTerm, filterIndustry])

  if (loading) return null

  const getInitials = (name) => name.substring(0, 2).toUpperCase()

  return (
    <AppShell
      title="Companies"
      session={session}
      theme={theme}
      toggleTheme={toggleTheme}
    >
      <div className="flex flex-col lg:flex-row gap-8 h-full">
        <div className="flex-1 flex flex-col gap-6">
          {/* Header & Main Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Companies</h1>
              <p className="text-sm text-slate-500 font-medium">Enterprise News & Intelligence</p>
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
              <span className="material-symbols-outlined text-lg">add</span>
              Add Company
            </button>
          </div>

          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[300px] relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input
                type="text"
                placeholder="Search companies, industries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <select 
              value={filterIndustry}
              onChange={(e) => setFilterIndustry(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
            >
              {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          {/* Data Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Industry</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Website</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCompanies.map((c) => (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedCompany(c)}
                    className={`group cursor-pointer transition-colors ${selectedCompany?.id === c.id ? 'bg-primary/[0.03] dark:bg-primary/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                          {getInitials(c.name)}
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {c.industry || 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <a href={c.website} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                        {c.website?.replace('https://', '')}
                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span> 
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Intelligence Sidebar */}
        {selectedCompany && (
          <aside className="w-full lg:w-96 flex flex-col gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden sticky top-8">
              <div className="p-8 border-b border-slate-50 dark:border-slate-800">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/20">
                    {getInitials(selectedCompany.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{selectedCompany.name}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{selectedCompany.industry}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link href={`/companies/${selectedCompany.id}`} className="flex-1 flex items-center justify-center py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md shadow-primary/10">
                    Edit Company
                  </Link>
                  <button className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-lg hover:bg-slate-100 border border-slate-100 dark:border-slate-700">
                    <span className="material-symbols-outlined text-lg">mail</span>
                  </button>
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span className="material-symbols-outlined text-base">rss_feed</span> 
                    News Monitoring
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest animate-pulse">Live</span>
                </div>

                <div className="space-y-6">
                  <div className="group cursor-pointer p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all">
                    <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-primary mb-2">
                       <span>Market Watch</span>
                       <span className="text-slate-400">2h ago</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">
                      {selectedCompany.name} evaluates strategic expansion into Nordic markets
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2 line-clamp-2">
                      Recent reports suggest a significant budget allocation for cross-border operations...
                    </p>
                  </div>

                  <div className="group cursor-pointer p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all opacity-70">
                    <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <span>PR Newswire</span>
                       <span className="text-slate-400">Yesterday</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">
                      Quarterly performance exceeds analyst expectations
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2 line-clamp-2">
                      Steady growth in core sectors provides a strong foundation for the upcoming fiscal year.
                    </p>
                  </div>
                </div>

                <button className="w-full mt-6 py-3 text-[10px] font-black text-slate-400 hover:text-primary uppercase tracking-widest transition-colors">
                  View Intelligence Report
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </AppShell>
  )
}
