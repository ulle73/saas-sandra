import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { Search, ExternalLink, Check, X, UserSearch, Verified, Briefcase, CheckCircle, Sparkles, Quote, Archive } from 'lucide-react'

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function buildLinkedInPeopleSearchUrl(companyId, keyword = 'HR') {
  const id = String(companyId || '').trim()
  if (!id) return null
  const encodedCompany = encodeURIComponent(JSON.stringify([id]))
  const encodedKeyword = encodeURIComponent(String(keyword || '').trim() || 'HR')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodedKeyword}&currentCompany=${encodedCompany}`
}

function parseContactCandidates(rawValue) {
  if (!rawValue) return []

  const parsed = Array.isArray(rawValue)
    ? rawValue
    : (() => {
        if (typeof rawValue !== 'string') return []
        try {
          const json = JSON.parse(rawValue)
          return Array.isArray(json) ? json : []
        } catch {
          return []
        }
      })()

  return parsed
    .map((candidate) => ({
      name: String(candidate?.name || '').trim(),
      title: String(candidate?.title || '').trim(),
      linkedinUrl: normalizeWebUrl(candidate?.linkedin_url),
      email: String(candidate?.email || '').trim(),
      phone: String(candidate?.phone || '').trim(),
      location: String(candidate?.location || '').trim(),
    }))
    .filter((candidate) => candidate.name || candidate.linkedinUrl || candidate.email || candidate.phone)
}

function formatStatusLabel(status) {
  if (status === 'accepted') return 'Archived'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatLeadCreatedDate(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

export default function AILeads({ session }) {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generationLoading, setGenerationLoading] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generationInfo, setGenerationInfo] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [selectedLead, setSelectedLead] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionInfo, setActionInfo] = useState('')

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
      const nextItems = data || []
      setItems(nextItems)
      setSelectedLead(nextItems[0] || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getAccessToken = async () => {
    if (session?.access_token) return session.access_token
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || null
  }

  const parseApiPayload = async (response) => {
    const raw = await response.text()
    try {
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollGenerationStatus = async (accessToken, maxAttempts = 80) => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch('/api/leads/generate', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const payload = await parseApiPayload(response)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch generation status.')
      }

      const job = payload?.job || {}
      if (job.running) {
        setGenerationInfo('Lead generation is running...')
        await sleep(3000)
        continue
      }

      if (job.status === 'failed') {
        throw new Error(job.error || 'Lead generation failed.')
      }

      if (job.status === 'succeeded') {
        const countText = Number.isFinite(Number(job.insertedCount))
          ? ` ${job.insertedCount} new leads added.`
          : ''
        setGenerationInfo(`Lead generation completed.${countText}`)
        await loadData()
        return
      }

      return
    }

    setGenerationInfo('Lead generation is still running. Refresh in a moment.')
  }

  const handleGenerateLeads = async () => {
    setGenerationError('')
    setGenerationInfo('')
    setGenerationLoading(true)

    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You are not logged in. Please sign in again.')
      }

      const response = await fetch('/api/leads/generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const payload = await parseApiPayload(response)

      if (response.status === 409) {
        setGenerationInfo('Lead generation is already running. Waiting for completion...')
        await pollGenerationStatus(accessToken)
        return
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start lead generation.')
      }

      setGenerationInfo('Lead generation started. Fetching status...')
      await pollGenerationStatus(accessToken)
    } catch (err) {
      setGenerationError(err.message || 'Failed to generate leads.')
    } finally {
      setGenerationLoading(false)
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesSearch = item.company_name.toLowerCase().includes(searchTerm.toLowerCase())
        || (item.growth_signal || '').toLowerCase().includes(searchTerm.toLowerCase())
        || (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [items, statusFilter, searchTerm])

  useEffect(() => {
    if (!selectedLead && filteredItems.length > 0) {
      setSelectedLead(filteredItems[0])
      return
    }

    if (selectedLead && !filteredItems.some((item) => item.id === selectedLead.id)) {
      setSelectedLead(filteredItems[0] || null)
    }
  }, [filteredItems, selectedLead])

  const selectedLeadCandidates = useMemo(() => {
    return parseContactCandidates(selectedLead?.contact_candidates)
  }, [selectedLead])

  const selectedPrimaryCandidate = selectedLeadCandidates[0] || null
  const selectedCompanyUrl = normalizeWebUrl(selectedLead?.company_domain)
  const selectedLinkedInCompanyUrl = normalizeWebUrl(selectedLead?.linkedin_company_url)
  const selectedLinkedInPeopleHrUrl = normalizeWebUrl(selectedLead?.linkedin_people_search_hr_url)
    || buildLinkedInPeopleSearchUrl(selectedLead?.linkedin_company_id, 'HR')
  const selectedSourceUrl = normalizeWebUrl(selectedLead?.source_url)

  const statusCounts = useMemo(() => {
    const base = { new: 0, accepted: 0, rejected: 0, converted: 0 }
    items.forEach((item) => {
      if (base[item.status] !== undefined) base[item.status] += 1
    })
    return base
  }, [items])

  const leadSummaryCards = useMemo(() => {
    const avgScore = items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length)
      : 0

    return [
      {
        key: 'new',
        label: 'New Leads',
        value: statusCounts.new,
        meta: 'Fresh opportunities to evaluate',
      },
      {
        key: 'converted',
        label: 'Converted',
        value: statusCounts.converted,
        meta: 'Leads promoted to company/contact',
      },
      {
        key: 'avg-score',
        label: 'Average Match Score',
        value: `${avgScore}%`,
        meta: 'Across all discovered leads',
      },
      {
        key: 'visible',
        label: 'Visible in Table',
        value: filteredItems.length,
        meta: 'Current filtered result set',
      },
    ]
  }, [filteredItems.length, items, statusCounts.converted, statusCounts.new])

  const applyLeadUpdate = (leadId, patch) => {
    setItems((current) => current.map((item) => (
      item.id === leadId ? { ...item, ...patch } : item
    )))
    setSelectedLead((current) => {
      if (!current || current.id !== leadId) return current
      return { ...current, ...patch }
    })
  }

  const persistLeadUpdate = async (leadId, patch) => {
    const payload = { ...patch, reviewed_at: new Date().toISOString() }

    const { error: updateError } = await supabase
      .from('lead_discovery_items')
      .update(payload)
      .eq('id', leadId)
      .eq('user_id', session.user.id)

    if (updateError) throw updateError
    applyLeadUpdate(leadId, payload)
  }

  const handleArchive = async () => {
    if (!selectedLead) return
    setActionError('')
    setActionInfo('')
    setActionLoading('archive')
    try {
      await persistLeadUpdate(selectedLead.id, { status: 'accepted' })
      setActionInfo('Lead archived.')
    } catch (err) {
      setActionError(err.message || 'Failed to archive lead.')
    } finally {
      setActionLoading('')
    }
  }

  const handleReject = async () => {
    if (!selectedLead) return
    setActionError('')
    setActionInfo('')
    setActionLoading('reject')
    try {
      await persistLeadUpdate(selectedLead.id, { status: 'rejected' })
      setActionInfo('Lead rejected.')
    } catch (err) {
      setActionError(err.message || 'Failed to reject lead.')
    } finally {
      setActionLoading('')
    }
  }

  const handleConvert = async () => {
    if (!selectedLead) return

    setActionError('')
    setActionInfo('')
    setActionLoading('convert')

    try {
      let convertedCompanyId = selectedLead.converted_company_id || null
      let convertedContactId = selectedLead.converted_contact_id || null

      if (!convertedCompanyId) {
        const { data: existingCompany, error: existingCompanyError } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('name', selectedLead.company_name)
          .maybeSingle()

        if (existingCompanyError) throw existingCompanyError

        if (existingCompany?.id) {
          convertedCompanyId = existingCompany.id
        } else {
          const { data: createdCompany, error: createdCompanyError } = await supabase
            .from('companies')
            .insert({
              user_id: session.user.id,
              name: selectedLead.company_name,
              industry: selectedLead.growth_signal || null,
              website: selectedCompanyUrl,
            })
            .select('id')
            .single()

          if (createdCompanyError) throw createdCompanyError
          convertedCompanyId = createdCompany.id
        }
      }

      if (!convertedContactId && selectedPrimaryCandidate?.name) {
        let existingContact = null

        if (selectedPrimaryCandidate.email) {
          const { data, error: existingContactByEmailError } = await supabase
            .from('contacts')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('email', selectedPrimaryCandidate.email)
            .maybeSingle()

          if (existingContactByEmailError) throw existingContactByEmailError
          existingContact = data
        }

        if (!existingContact) {
          const { data: createdContact, error: createdContactError } = await supabase
            .from('contacts')
            .insert({
              user_id: session.user.id,
              company_id: convertedCompanyId,
              name: selectedPrimaryCandidate.name,
              email: selectedPrimaryCandidate.email || null,
              phone: selectedPrimaryCandidate.phone || null,
              linkedin_url: selectedPrimaryCandidate.linkedinUrl || null,
              notes: selectedLead.reason || null,
              last_touchpoint: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (createdContactError) throw createdContactError
          convertedContactId = createdContact.id
        } else {
          convertedContactId = existingContact.id
        }
      }

      await persistLeadUpdate(selectedLead.id, {
        status: 'converted',
        converted_company_id: convertedCompanyId,
        converted_contact_id: convertedContactId,
      })

      setActionInfo('Lead converted to company/contact.')
    } catch (err) {
      setActionError(err.message || 'Failed to convert lead.')
    } finally {
      setActionLoading('')
    }
  }

  if (loading) return null

  return (
    <div className="flex flex-col lg:flex-row min-h-0 lg:h-[calc(100vh-80px)] ux-section-stagger">
      <div className="flex-1 flex flex-col gap-6 min-w-0 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">AI Sales Copilot</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">New Potential Opportunities</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleGenerateLeads}
              disabled={generationLoading}
              className="btn-primary"
            >
              {generationLoading ? 'Generating...' : 'Generate New Leads'}
            </button>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
              {['new', 'accepted', 'rejected', 'converted'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-all capitalize ${
                    statusFilter === status
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {formatStatusLabel(status)} ({statusCounts[status] || 0})
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="dashboard-metric-strip">
          {leadSummaryCards.map((card) => (
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
              placeholder="Search leads by company, signal, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        {generationError ? <p className="form-error">{generationError}</p> : null}
        {generationInfo ? <p className="form-info">{generationInfo}</p> : null}

        <div className="glass-panel flex-1 min-h-[300px] overflow-y-auto overflow-x-hidden custom-scrollbar">
          <table className="w-full table-fixed text-left border-collapse">
            <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-[34%] py-4 px-5 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Company</th>
                <th className="w-[20%] py-4 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Match Score</th>
                <th className="w-[14%] py-4 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Priority</th>
                <th className="w-[18%] py-4 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Growth Signal</th>
                <th className="w-[14%] py-4 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedLead(item)}
                  className={`group cursor-pointer transition-all ${
                    selectedLead?.id === item.id
                      ? 'bg-slate-50 dark:bg-slate-800/80 shadow-[inset_3px_0_0_0_#2563EB]'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                        {item.company_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{item.company_name}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">{item.industry || 'Enterprise'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                        <div className={`${item.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} h-full`} style={{ width: `${item.score}%` }}></div>
                      </div>
                      <span className={`text-xs font-black ${item.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{item.score}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <span className={`px-2.5 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-widest border ${
                      item.score >= 80
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-800/50'
                        : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-800/50'
                    }`}>
                      {item.score >= 80 ? 'High' : 'Medium'}
                    </span>
                  </td>
                  <td className="py-4 px-3">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 line-clamp-1 italic">
                      "{item.growth_signal || item.reason}"
                    </p>
                  </td>
                  <td className="py-4 px-3">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatLeadCreatedDate(item.created_at)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLead && (
        <aside className="w-full lg:w-[450px] flex flex-col bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 h-full overflow-hidden">
            <div className="p-8 border-b border-slate-50 dark:border-slate-800">
              <div className="flex items-start gap-4 mb-6">
                <div className="size-14 rounded-md bg-primary text-white flex items-center justify-center text-2xl font-black shadow-sm">
                  {selectedLead.company_name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight break-words">{selectedLead.company_name}</h3>
                  {selectedCompanyUrl ? (
                    <a
                      href={selectedCompanyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs font-bold hover:underline flex items-center gap-1 mt-1 break-all"
                    >
                      {selectedLead.company_domain}
                      <ExternalLink size={14} className="ml-1" />
                    </a>
                  ) : null}
                </div>
              </div>

                <div className="flex flex-wrap gap-2">
                  {selectedLinkedInCompanyUrl && (
                    <a href={selectedLinkedInCompanyUrl} target="_blank" rel="noopener noreferrer" className="btn !font-bold uppercase tracking-wider !text-[10px] border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
                      Company
                    </a>
                  )}
                  {selectedLead.linkedin_jobs_url && (
                    <a href={selectedLead.linkedin_jobs_url} target="_blank" rel="noopener noreferrer" className="btn !font-bold uppercase tracking-wider !text-[10px] border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
                      Jobs
                    </a>
                  )}
                  {selectedLead.linkedin_people_url && (
                    <a href={selectedLead.linkedin_people_url} target="_blank" rel="noopener noreferrer" className="btn !font-bold uppercase tracking-wider !text-[10px] border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
                      LinkedIn People
                    </a>
                  )}
                  {selectedLead.linkedin_about_url && (
                    <a href={selectedLead.linkedin_about_url} target="_blank" rel="noopener noreferrer" className="btn !font-bold uppercase tracking-wider !text-[10px] border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
                      About
                    </a>
                  )}
                </div>
                {selectedSourceUrl && (
                  <a href={selectedSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-link small-copy mt-3 font-semibold text-slate-500">
                    Open source article
                  </a>
                )}
            </div>

            <div className="p-8 grow overflow-y-auto space-y-6 dashboard-subsurface">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Title</p>
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <UserSearch size={16} />
                    {selectedLead.recommended_person_title || selectedPrimaryCandidate?.title || 'Not detected'}
                  </div>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Match Confidence</p>
                  <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                    <Verified size={16} />
                    {selectedLead.score >= 80 ? 'Ultra High' : 'Strong'}
                  </div>
                </div>
                {selectedLead.linkedin_job_count !== null && (
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active LinkedIn Jobs</p>
                    <div className="flex items-center gap-2 text-primary font-black text-sm">
                      <Briefcase size={16} />
                      {selectedLead.linkedin_job_count} open positions
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Best Contact Candidate</h4>
                {selectedPrimaryCandidate ? (
                  <div className="panel-soft panel-pad stack-sm">
                    <p className="copy-strong">{selectedPrimaryCandidate.name}</p>
                    {selectedPrimaryCandidate.title ? <p className="small-copy muted">{selectedPrimaryCandidate.title}</p> : null}
                    {selectedPrimaryCandidate.email ? <p className="small-copy">Email: {selectedPrimaryCandidate.email}</p> : null}
                    {selectedPrimaryCandidate.phone ? <p className="small-copy">Phone: {selectedPrimaryCandidate.phone}</p> : null}
                    {selectedPrimaryCandidate.linkedinUrl ? (
                      <a href={selectedPrimaryCandidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-link small-copy">
                        Open LinkedIn profile
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="small-copy muted">No candidate profile available for this lead yet.</p>
                )}
              </div>

              {selectedLead.linkedin_about_text && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Description</h4>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                    {selectedLead.linkedin_about_text}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Signal Evidence</h4>
                <div className="flex gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-[1px]" />
                  <span>{selectedLead.reason}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-[10px] font-black text-slate-900 uppercase tracking-widest">
                  <Sparkles size={14} />
                  AI Pitch Vector
                </h4>
                <div className="p-5 bg-white rounded-md border border-slate-200 relative">
                  <Quote size={40} className="absolute top-3 right-4 opacity-10" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    {selectedLead.pitch || 'No AI pitch available'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-4">
              {actionError ? <p className="form-error w-full text-center">{actionError}</p> : null}
              {actionInfo ? <p className="form-info w-full text-center">{actionInfo}</p> : null}

              <button
                className="flex items-center justify-center gap-2 text-slate-800 font-medium hover:text-primary transition-colors disabled:opacity-50"
                onClick={handleConvert}
                disabled={Boolean(actionLoading)}
              >
                <Check size={18} strokeWidth={2.5} />
                {actionLoading === 'convert' ? 'Converting...' : 'Accept & Create Account'}
              </button>
              
              <div className="flex items-center justify-center gap-12 w-full mt-2">
                <button
                  className="flex items-center justify-center gap-2 text-slate-800 font-medium hover:text-slate-500 transition-colors disabled:opacity-50"
                  onClick={handleArchive}
                  disabled={Boolean(actionLoading)}
                >
                  <Archive size={16} strokeWidth={2} />
                  {actionLoading === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
                <button
                  className="flex items-center justify-center gap-2 text-slate-800 font-medium hover:text-rose-500 transition-colors disabled:opacity-50"
                  onClick={handleReject}
                  disabled={Boolean(actionLoading)}
                >
                  <X size={16} strokeWidth={2.5} />
                  {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
        </aside>
      )}
    </div>
  )
}
