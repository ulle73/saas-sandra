import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { Search, ExternalLink, Check, X, UserSearch, Verified, Briefcase, CheckCircle, Sparkles, Quote, Archive, RefreshCw } from 'lucide-react'

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

function buildLinkedInSearchUrl(companyName, type = 'all') {
  const name = String(companyName || '').trim()
  if (!name) return null
  const encodedName = encodeURIComponent(name)
  if (type === 'jobs') {
    return `https://www.linkedin.com/jobs/search/?keywords=${encodedName}`
  }
  if (type === 'people') {
    // Include geoUrn for Sweden: ["105117694"] and origin FACETED_SEARCH
    return `https://www.linkedin.com/search/results/people/?keywords=${encodedName}&origin=FACETED_SEARCH&geoUrn=%5B%22105117694%22%5D`
  }
  // Default is global search
  return `https://www.linkedin.com/search/results/all/?keywords=${encodedName}&origin=GLOBAL_SEARCH_HEADER`
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
  const [syncUrl, setSyncUrl] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSyncInput, setShowSyncInput] = useState(false)

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
    || buildLinkedInSearchUrl(selectedLead?.company_name, 'all')
  const selectedLinkedInPeopleHrUrl = normalizeWebUrl(selectedLead?.linkedin_people_search_hr_url)
    || buildLinkedInPeopleSearchUrl(selectedLead?.linkedin_company_id, 'HR')
    || buildLinkedInSearchUrl(`${selectedLead?.company_name} HR`, 'people')
  const selectedLinkedInJobsUrl = normalizeWebUrl(selectedLead?.linkedin_jobs_url)
    || buildLinkedInSearchUrl(selectedLead?.company_name, 'jobs')
  const selectedLinkedInPeopleUrl = normalizeWebUrl(selectedLead?.linkedin_people_url)
    || buildLinkedInSearchUrl(selectedLead?.company_name, 'people')
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

  const handleManualSync = async (e) => {
    if (e) e.preventDefault()
    if (!selectedLead || !syncUrl) return
    
    setIsSyncing(true)
    try {
      const response = await fetch('/api/leads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead.id, linkedinUrl: syncUrl }),
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to sync lead')
      
      setActionInfo('Lead updated with new LinkedIn data')
      setShowSyncInput(false)
      setSyncUrl('')
      // Refresh lead
      const { data: updatedLead, error: refreshError } = await supabase
        .from('lead_discovery_items')
        .select('*')
        .eq('id', selectedLead.id)
        .single()
      if (!refreshError && updatedLead) applyLeadUpdate(selectedLead.id, updatedLead)
    } catch (error) {
      console.error('Sync error:', error)
      setActionError(error.message)
    } finally {
      setIsSyncing(false)
    }
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
        <div className="flex items-center justify-between gap-6 flex-wrap mb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              AI Sales Copilot
              <span className="h-4 w-px bg-slate-200 dark:bg-slate-800"></span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest opacity-60">Opportunities</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Discrete Status Filters */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/50 p-1 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
              {['new', 'accepted', 'rejected', 'converted'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-2 ${
                    statusFilter === status
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white ring-1 ring-slate-200/50 dark:ring-slate-600/50'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {status === 'accepted' ? 'Archived' : status}
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[14px] px-1 rounded-full text-[8px] font-black ${
                    statusFilter === status 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' 
                      : 'bg-slate-200/50 dark:bg-slate-700/20 text-slate-400 dark:text-slate-500'
                  }`}>
                    {statusCounts[status] || 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Discrete Generate Button */}
            <button
              type="button"
              onClick={handleGenerateLeads}
              disabled={generationLoading}
              className="group flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] dark:bg-white dark:text-[#0F172A] text-white rounded-full text-[9px] font-black uppercase tracking-[0.15em] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-slate-200/50 dark:shadow-none"
            >
              {generationLoading ? (
                <div className="size-3 border-2 border-current border-t-transparent animate-spin rounded-full" />
              ) : (
                <Sparkles size={11} className="group-hover:rotate-12 transition-transform" />
              )}
              {generationLoading ? 'Wait...' : 'Generate New'}
            </button>
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
        <aside className="w-full lg:w-[450px] flex flex-col bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 h-full overflow-hidden shrink-0">
          {/* Top Blue Header Section */}
          <div className="p-6 md:p-8 shrink-0 bg-[#3B82F6] dark:bg-blue-600 text-white relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-start gap-4">
                <div className="size-14 rounded-xl bg-white text-blue-500 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
                  {selectedLead.company_name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-black tracking-tight break-words">{selectedLead.company_name}</h3>
                    <button 
                      onClick={() => setShowSyncInput(!showSyncInput)}
                      className="p-1 hover:bg-white/10 rounded transition-colors text-blue-200/50 hover:text-white"
                      title="Update LinkedIn data"
                    >
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  
                  {showSyncInput && (
                    <form onSubmit={handleManualSync} className="mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={syncUrl}
                          onChange={(e) => setSyncUrl(e.target.value)}
                          placeholder="Paste LinkedIn Company URL..."
                          className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-[10px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                        />
                        <button 
                          type="submit"
                          disabled={isSyncing || !syncUrl}
                          className="px-2 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-[8px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {isSyncing ? '...' : 'Sync'}
                        </button>
                      </div>
                    </form>
                  )}
                  {selectedCompanyUrl && (
                    <a
                      href={selectedCompanyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-100 text-[10px] font-bold hover:text-white flex items-center gap-1 mt-1 break-all transition-colors"
                    >
                      {selectedLead.company_domain}
                      <ExternalLink size={10} className="ml-0.5" />
                    </a>
                  )}
                </div>
              </div>
              
              <div className="text-right flex flex-col items-end shrink-0 pl-2">
                {/* <span className="text-[7px] font-black text-blue-200 uppercase tracking-widest mb-1 opacity-80">Link</span> */}
                {selectedSourceUrl ? (
                  <a href={selectedSourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold hover:underline whitespace-nowrap text-blue-50">
                    News a  rticle
                  </a>
                ) : (
                  <span className="text-[10px] font-bold opacity-30 whitespace-nowrap">None</span>
                )}
              </div>

              {/* Match Confidence Badge */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm ${
                selectedLead.score >= 80 
                  ? 'bg-emerald-50 border-emerald-500/20 text-emerald-700' 
                  : 'bg-amber-50 border-amber-500/20 text-amber-700'
              }`}>
                <Verified size={10} strokeWidth={2.5} />
                <span className="text-[8px] font-black uppercase tracking-wider">
                  {selectedLead.score >= 80 ? 'Ultra High' : 'Strong'}
                </span>
              </div>
            </div>

            {/* Discrete Links Bar in Header */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
              {selectedLinkedInCompanyUrl && (
                <a href={selectedLinkedInCompanyUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors">
                  Company
                </a>
              )}
              {selectedLinkedInJobsUrl && (
                <a href={selectedLinkedInJobsUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors">
                  Jobs
                </a>
              )}
              {selectedLinkedInPeopleUrl && (
                <a href={selectedLinkedInPeopleUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors">
                  People
                </a>
              )}
              {selectedLead?.linkedin_about_url && (
                <a href={selectedLead.linkedin_about_url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors">
                  About
                </a>
              )}
            </div>
          </div>

          <div className="p-6 grow overflow-y-auto space-y-8 bg-[#F8FAFC]/50 dark:bg-slate-900/50">
            
            {/* 
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Target Title</p>
                <div className="flex flex-col items-center gap-2 text-slate-900 dark:text-white font-black text-xs uppercase tracking-tight">
                  <UserSearch size={18} className="text-blue-500 mb-1" strokeWidth={2.5} />
                  {selectedLead.recommended_person_title || selectedPrimaryCandidate?.title || 'Not detected'}
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Match Confidence</p>
                <div className={`flex flex-col items-center gap-2 font-black text-xs uppercase tracking-tight ${selectedLead.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Verified size={18} className="mb-1" strokeWidth={2.5} />
                  {selectedLead.score >= 80 ? 'Ultra High' : 'Strong'}
                </div>
              </div>
            </div> 
            */}

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-px bg-slate-200 dark:bg-slate-800 grow"></div>
                <h4 className="text-[9px] font-black text-amber-600/60 dark:text-amber-500/60 uppercase tracking-widest whitespace-nowrap">Best Contact Candidate</h4>
                <div className="h-px bg-slate-200 dark:bg-slate-800 grow"></div>
              </div>
              
              <div className="p-6 bg-[#FFFBEB] dark:bg-amber-900/5 border-l-4 border-amber-400 shadow-sm rounded-r-lg">
                {selectedPrimaryCandidate ? (
                  <>
                    <div className="flex items-start gap-4">
                      <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center shrink-0">
                        <UserSearch size={18} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">{selectedPrimaryCandidate.name}</p>
                        {selectedPrimaryCandidate.title && <p className="text-[10px] font-extrabold text-[#92400E] dark:text-amber-500/80 mt-0.5 uppercase tracking-wide leading-tight italic">{selectedPrimaryCandidate.title}</p>}
                        
                        <div className="mt-4 space-y-1">
                          {selectedPrimaryCandidate.email && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                              <span className="text-[8px] font-black text-slate-300 uppercase py-0.5 px-1 border border-slate-100 dark:border-slate-800 rounded">Email</span>
                              {selectedPrimaryCandidate.email}
                            </div>
                          )}
                          {selectedPrimaryCandidate.linkedinUrl && (
                            <a href={selectedPrimaryCandidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline">
                              <span className="text-[8px] font-black text-blue-100 bg-blue-600 uppercase py-0.5 px-1 rounded">LinkedIn</span>
                              View Profile
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 py-2">
                    <div className="size-8 rounded-full bg-amber-100 dark:bg-amber-900/10 text-amber-500 flex items-center justify-center shrink-0">
                      <UserSearch size={14} strokeWidth={2.5} />
                    </div>
                    <p className="text-xs font-black text-amber-700/60 dark:text-amber-500/60 uppercase tracking-widest italic">No candidate profile available yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Company Description</h4>
              <div className="p-6 bg-[#F8FAFC] dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800/50">
                {selectedLead.linkedin_about_text ? (
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed italic">
                    {selectedLead.linkedin_about_text}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 leading-relaxed italic">
                      Direct company bio not available in database.
                    </p>
                    {selectedLinkedInCompanyUrl && (
                      <a 
                        href={selectedLinkedInCompanyUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <ExternalLink size={12} className="text-blue-500" />
                        Search for bios on LinkedIn
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-4">
              <div className="p-5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  <div className="size-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"><CheckCircle size={10} strokeWidth={3} /></div>
                  Signal Evidence
                </h4>
                <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 italic leading-snug">"{selectedLead.reason}"</p>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  <div className="size-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"><Sparkles size={10} strokeWidth={3} /></div>
                  AI Pitch Vector
                </h4>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 italic leading-snug">
                  "{selectedLead.pitch || 'No pitch available'}"
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-6 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
            {actionError ? <p className="form-error w-full text-center mb-0">{actionError}</p> : null}
            {actionInfo ? <p className="form-info w-full text-center mb-0">{actionInfo}</p> : null}

            <div className="flex gap-2.5 h-[34px] w-full">
              <button
                className="flex-[1.2] rounded-md bg-[#E6F6EB] hover:bg-[#D9F2E0] border border-[#3B8E65]/30 text-[#3B8E65] flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] px-4 shadow-sm"
                onClick={handleConvert}
                disabled={Boolean(actionLoading)}
              >
                <div className="size-4 rounded-full bg-[#3B8E65] text-white flex items-center justify-center shrink-0 shadow-sm">
                   <Check size={10} strokeWidth={5} />
                </div>
                <span className="font-extrabold tracking-[0.1em] uppercase whitespace-nowrap" style={{ fontSize: '8px' }}>ACCEPT</span>
              </button>
              
              <button
                className="flex-1 rounded-md bg-[#F0EEFE] hover:bg-[#E5E1FD] border border-[#6D5DF0]/30 text-[#6D5DF0] flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] px-4 shadow-sm"
                onClick={handleArchive}
                disabled={Boolean(actionLoading)}
              >
                <Archive size={16} className="text-[#6D5DF0] shrink-0" fill="currentColor" strokeWidth={1} />
                <span className="font-extrabold tracking-[0.1em] uppercase whitespace-nowrap" style={{ fontSize: '8px' }}>ARCHIVE</span>
              </button>

              <button
                className="flex-1 rounded-md bg-[#FEEBF0] hover:bg-[#FDDCE5] border border-[#C2455A]/30 text-[#C2455A] flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] px-4 shadow-sm"
                onClick={handleReject}
                disabled={Boolean(actionLoading)}
              >
                <div className="size-4 rounded-full bg-[#C2455A] text-white flex items-center justify-center shrink-0 shadow-sm">
                   <X size={10} strokeWidth={5} />
                </div>
                <span className="font-extrabold tracking-[0.1em] uppercase whitespace-nowrap" style={{ fontSize: '8px' }}>REJECT</span>
              </button>
            </div>
            
            <div className="text-center">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.25em] select-none opacity-40">KEYBOARD: [R] Reject • [A] Archive • [Enter] Accept</span>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
