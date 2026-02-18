import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AILeads({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [selectedLead, setSelectedLead] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    loadData()
  }, [session, router])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: discoveryError } = await supabase
        .from('lead_discovery_items')
        .select('*')
        .eq('user_id', session.user.id)
        .order('score', { ascending: false })
      
      if (discoveryError) throw discoveryError
      setItems(data || [])
      if (data && data.length > 0) setSelectedLead(data[0])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesSearch = item.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (item.growth_signal || '').toLowerCase().includes(searchTerm.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [items, statusFilter, searchTerm])

  if (loading) return null

  const stats = {
    new: items.filter(i => i.status === 'new').length,
    accepted: items.filter(i => i.status === 'accepted').length,
    p1: items.filter(i => i.score >= 80).length
  }

  return (
      <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-160px)]">
        {/* Main List Column */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Sales Copilot</h1>
              <p className="text-sm text-slate-500 font-medium">New Potential Opportunities</p>
            </div>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {['new', 'accepted', 'rejected', 'converted'].map(s => (
                <button 
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all capitalize
                    ${statusFilter === s ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {s} ({items.filter(i => i.status === s).length})
                </button>
              ))}
            </div>
          </div>

          {/* Search & Bulk */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input 
              type="text" 
              placeholder="Search leads by company or signal..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Leads Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Company</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Match Score</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Priority</th>
                  <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Growth Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.map(item => (
                  <tr 
                    key={item.id}
                    onClick={() => setSelectedLead(item)}
                    className={`group cursor-pointer transition-all ${selectedLead?.id === item.id ? 'bg-primary/[0.04] dark:bg-primary/10 border-l-4 border-primary' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'}`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                          {item.company_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{item.company_name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">{item.industry || 'Enterprise'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${item.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${item.score}%` }}></div>
                        </div>
                        <span className={`text-xs font-black ${item.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{item.score}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border
                        ${item.score >= 80 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {item.score >= 80 ? 'High' : 'Medium'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 line-clamp-1 italic">
                         "{item.growth_signal || item.reason}"
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Inspector Sidebar */}
        {selectedLead && (
          <aside className="w-full lg:w-[450px] flex flex-col gap-6 sticky top-0">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
               <div className="p-8 border-b border-slate-50 dark:border-slate-800">
                  <div className="flex items-start justify-between mb-8">
                     <div className="flex items-center gap-4">
                        <div className="size-14 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-black shadow-xl shadow-primary/20">
                          {selectedLead.company_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{selectedLead.company_name}</h3>
                          <a href={`https://${selectedLead.company_domain}`} className="text-primary text-xs font-bold hover:underline flex items-center gap-1 mt-1">
                            {selectedLead.company_domain}
                            <span className="material-symbols-outlined text-xs">public</span>
                          </a>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest">
                       <span className="material-symbols-outlined text-base">auto_awesome</span>
                       AI Pitch Vector
                    </h4>
                    <div className="p-5 bg-primary/[0.03] dark:bg-primary/5 rounded-2xl border border-primary/10 relative">
                       <span className="material-symbols-outlined absolute top-2 right-4 opacity-10 text-4xl">format_quote</span>
                       <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">
                         {selectedLead.pitch || "I noticed your recent growth signals. Based on our analysis, your team could benefit from automated CRM workflows during this expansion phase."}
                       </p>
                    </div>
                  </div>
               </div>

               <div className="p-8 grow overflow-y-auto space-y-8 bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Title</p>
                      <div className="flex items-center gap-2 text-primary font-bold text-sm">
                        <span className="material-symbols-outlined text-sm">person_search</span>
                        {selectedLead.recommended_person_title || "VP Sales"}
                      </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Match Confidence</p>
                      <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        {selectedLead.score >= 80 ? 'Ultra High' : 'Strong'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Signal Evidence</h4>
                    <div className="space-y-3">
                       <div className="flex gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                          <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                          <span>{selectedLead.reason}</span>
                       </div>
                    </div>
                  </div>
               </div>

               <div className="p-8 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <button className="w-full py-4 bg-primary text-white font-black rounded-xl shadow-xl shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]">
                    <span className="material-symbols-outlined">add_business</span>
                    Accept & Create Account
                  </button>
                  <div className="flex gap-3">
                    <button className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Archive</button>
                    <button className="flex-1 py-3 border border-rose-100 text-rose-500 font-bold rounded-xl hover:bg-rose-50 transition-colors">Reject</button>
                  </div>
               </div>
            </div>
          </aside>
        )}
      </div>
  )
}
