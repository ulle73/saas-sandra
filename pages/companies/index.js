import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { Plus, Search, ExternalLink, Building2, Rss } from 'lucide-react'

const COMPANY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function normalizeCompanyStatus(value) {
  return value === 'inactive' ? 'inactive' : 'active'
}

function getStatusBadgeClass(status) {
  if (status === 'inactive') return 'text-slate-500 dark:text-slate-300'
  return 'text-emerald-600 dark:text-emerald-300'
}

export default function Companies({ session }) {
  const router = useRouter()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [filterIndustry, setFilterIndustry] = useState('All Industries')
  const [companyNews, setCompanyNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState('')
  const [statusSavingId, setStatusSavingId] = useState('')

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

      const nextCompanies = data || []
      setCompanies(nextCompanies)
      setSelectedCompany(nextCompanies[0] || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const industries = useMemo(() => {
    const sets = new Set(companies.map((company) => company.industry).filter(Boolean))
    return ['All Industries', ...Array.from(sets)]
  }, [companies])

  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => {
      const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase())
        || (company.industry || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesIndustry = filterIndustry === 'All Industries' || company.industry === filterIndustry
      return matchesSearch && matchesIndustry
    })
  }, [companies, searchTerm, filterIndustry])

  useEffect(() => {
    if (!selectedCompany && filteredCompanies.length > 0) {
      setSelectedCompany(filteredCompanies[0])
      return
    }

    if (selectedCompany && !filteredCompanies.some((company) => company.id === selectedCompany.id)) {
      setSelectedCompany(filteredCompanies[0] || null)
    }
  }, [filteredCompanies, selectedCompany])

  useEffect(() => {
    if (!selectedCompany || !session) {
      setCompanyNews([])
      setNewsError('')
      return
    }

    const fetchCompanyNews = async () => {
      setNewsLoading(true)
      setNewsError('')
      try {
        const { data, error: fetchNewsError } = await supabase
          .from('news_items')
          .select('id, title, url, source, published_at, is_relevant')
          .eq('user_id', session.user.id)
          .eq('company_id', selectedCompany.id)
          .order('published_at', { ascending: false })
          .limit(8)

        if (fetchNewsError) throw fetchNewsError
        setCompanyNews(data || [])
      } catch (err) {
        setNewsError(err.message || 'Failed to load news')
      } finally {
        setNewsLoading(false)
      }
    }

    fetchCompanyNews()
  }, [selectedCompany, session])

  const getInitials = (name) => name.substring(0, 2).toUpperCase()
  const selectedCompanyWebsite = normalizeWebUrl(selectedCompany?.website)
  const selectedCompanyStatus = normalizeCompanyStatus(selectedCompany?.status)

  const handleStatusChange = async (companyId, nextStatus) => {
    const normalizedStatus = normalizeCompanyStatus(nextStatus)
    setStatusSavingId(companyId)
    setError('')

    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({ status: normalizedStatus })
        .eq('id', companyId)
        .eq('user_id', session.user.id)

      if (updateError) throw updateError

      setCompanies((current) => current.map((company) => (
        company.id === companyId ? { ...company, status: normalizedStatus } : company
      )))
      setSelectedCompany((current) => {
        if (!current || current.id !== companyId) return current
        return { ...current, status: normalizedStatus }
      })
    } catch (updateErr) {
      if (/column .*status/i.test(String(updateErr.message || ''))) {
        setError('Company status saknas i databasen. Kör `npm run db:init` för att uppdatera schema.')
      } else {
        setError(updateErr.message || 'Failed to update company status')
      }
    } finally {
      setStatusSavingId('')
    }
  }

  const summaryCards = useMemo(() => {
    const activeCount = companies.filter((company) => normalizeCompanyStatus(company.status) === 'active').length
    const inactiveCount = companies.length - activeCount
    const monitoredCount = companies.filter((company) => (company.news_keywords || []).length > 0).length

    return [
      {
        key: 'active',
        label: 'Active Accounts',
        value: activeCount,
        meta: 'Companies currently in motion',
      },
      {
        key: 'inactive',
        label: 'Inactive Accounts',
        value: inactiveCount,
        meta: 'Paused or deprioritized accounts',
      },
      {
        key: 'monitoring',
        label: 'Keyword Monitoring',
        value: monitoredCount,
        meta: 'Companies with configured news signals',
      },
      {
        key: 'visible',
        label: 'Visible in Table',
        value: filteredCompanies.length,
        meta: 'Current filtered result set',
      },
    ]
  }, [companies, filteredCompanies.length])

  if (loading) return null

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-full min-h-0 ux-section-stagger">
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Companies</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Enterprise News & Intelligence</p>
          </div>
          <Link href="/companies/new" className="btn-primary">
            <Plus size={18} />
            Add Company
          </Link>
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

        <div className="glass-panel p-4 flex flex-wrap gap-4 items-center mb-2">
          <div className="flex-1 min-w-[280px] relative group">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
            <input
              type="text"
              placeholder="Search companies, industries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="input-field w-auto min-w-[200px]"
          >
            {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
          </select>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="glass-panel overflow-hidden overflow-x-hidden custom-scrollbar">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-[34%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Company Name</th>
                <th className="w-[23%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Industry</th>
                <th className="w-[23%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Website</th>
                <th className="w-[20%] px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredCompanies.map((company) => {
                const companyUrl = normalizeWebUrl(company.website)
                return (
                  <tr
                    key={company.id}
                    onClick={() => setSelectedCompany(company)}
                    className={`group cursor-pointer transition-colors ${selectedCompany?.id === company.id ? 'bg-primary/8 dark:bg-primary/25 shadow-[inset_0_0_0_1px_rgba(94,177,255,0.45)]' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                          {getInitials(company.name)}
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">{company.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {company.industry || 'General'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {companyUrl ? (
                        <a
                          href={companyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          {company.website?.replace(/^https?:\/\//i, '')}
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
                        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${getStatusBadgeClass(normalizeCompanyStatus(company.status))}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${normalizeCompanyStatus(company.status) === 'inactive' ? 'bg-slate-400' : 'bg-emerald-500 shadow-sm shadow-emerald-200'}`}></span>
                          {normalizeCompanyStatus(company.status)}
                        </span>
                        <select
                          value={normalizeCompanyStatus(company.status)}
                          onChange={(event) => handleStatusChange(company.id, event.target.value)}
                          disabled={statusSavingId === company.id}
                          className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-200"
                        >
                          {COMPANY_STATUSES.map((statusOption) => (
                            <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCompany && (
        <aside className="w-full lg:w-96 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden sticky top-8">
            <div className="p-8 border-b border-slate-50 dark:border-slate-800">
                <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/20">
                  {getInitials(selectedCompany.name)}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{selectedCompany.name}</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{selectedCompany.industry || 'General'}</p>
                </div>
                </div>
                <div className="top-gap-sm">
                  <span className={`badge ${selectedCompanyStatus === 'inactive' ? 'badge-status-rejected' : 'badge-status-accepted'}`}>
                    {selectedCompanyStatus === 'inactive' ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <div className="flex gap-3">
                <Link href={`/companies/${selectedCompany.id}`} className="flex-1 flex items-center justify-center py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md shadow-primary/10">
                  Edit Company
                </Link>
                {selectedCompanyWebsite ? (
                  <a href={selectedCompanyWebsite} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                    Website
                  </a>
                ) : null}
              </div>
            </div>

            <div className="p-8 news-surface">
              <div className="flex items-center justify-between mb-6">
                <h3 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Rss size={16} />
                  News Monitoring
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">
                  Live
                </span>
              </div>

              {newsLoading ? (
                <p className="small-copy muted">Loading news...</p>
              ) : newsError ? (
                <p className="form-error">{newsError}</p>
              ) : companyNews.length === 0 ? (
                <p className="small-copy muted">No fetched articles for this company yet.</p>
              ) : (
                <div className="space-y-4">
                  {companyNews.map((article) => (
                    <a
                      key={article.id}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block p-4 news-card-surface rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all"
                    >
                      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-primary mb-2">
                        <span>{article.source || 'Unknown source'}</span>
                        <span className="text-slate-400">
                          {article.published_at ? new Date(article.published_at).toLocaleDateString('sv-SE') : 'N/A'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors">
                        {article.title}
                      </h4>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
