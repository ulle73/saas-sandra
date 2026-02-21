import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
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

export default function AILeads({ session }) {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
  const selectedSourceUrl = normalizeWebUrl(selectedLead?.source_url)

  const statusCounts = useMemo(() => {
    const base = { new: 0, accepted: 0, rejected: 0, converted: 0 }
    items.forEach((item) => {
      if (base[item.status] !== undefined) base[item.status] += 1
    })
    return base
  }, [items])

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
    <div className="flex flex-col lg:flex-row gap-8 min-h-0 lg:h-[calc(100vh-160px)] ux-section-stagger">
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Sales Copilot</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">New Potential Opportunities</p>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['new', 'accepted', 'rejected', 'converted'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all capitalize ${
                  statusFilter === status
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-primary'
                    : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
                }`}
              >
                {formatStatusLabel(status)} ({statusCounts[status] || 0})
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            type="text"
            placeholder="Search leads by company, signal, reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Company</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Match Score</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Priority</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Growth Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedLead(item)}
                  className={`group cursor-pointer transition-all ${
                    selectedLead?.id === item.id
                      ? 'bg-primary/[0.04] dark:bg-primary/10 border-l-4 border-primary'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                  }`}
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
                        <div className={`${item.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} h-full`} style={{ width: `${item.score}%` }}></div>
                      </div>
                      <span className={`text-xs font-black ${item.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{item.score}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      item.score >= 80 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
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

      {selectedLead && (
        <aside className="w-full lg:w-[450px] flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="p-8 border-b border-slate-50 dark:border-slate-800">
              <div className="flex items-start gap-4 mb-6">
                <div className="size-14 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-black shadow-xl shadow-primary/20">
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
                      <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                {selectedLinkedInCompanyUrl ? (
                  <a href={selectedLinkedInCompanyUrl} target="_blank" rel="noopener noreferrer" className="inline-link small-copy">
                    Open LinkedIn company
                  </a>
                ) : null}
                {selectedSourceUrl ? (
                  <a href={selectedSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-link small-copy">
                    Open source article
                  </a>
                ) : null}
              </div>
            </div>

            <div className="p-8 grow overflow-y-auto space-y-6 bg-slate-50/50 dark:bg-slate-800/20">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Title</p>
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <span className="material-symbols-outlined text-sm">person_search</span>
                    {selectedLead.recommended_person_title || selectedPrimaryCandidate?.title || 'Not detected'}
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

              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Signal Evidence</h4>
                <div className="flex gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                  <span>{selectedLead.reason}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest">
                  <span className="material-symbols-outlined text-base">auto_awesome</span>
                  AI Pitch Vector
                </h4>
                <div className="p-5 bg-primary/[0.03] dark:bg-primary/5 rounded-2xl border border-primary/10 relative">
                  <span className="material-symbols-outlined absolute top-2 right-4 opacity-10 text-4xl">format_quote</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    {selectedLead.pitch || 'No AI pitch available'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-slate-800 space-y-3">
              {actionError ? <p className="form-error">{actionError}</p> : null}
              {actionInfo ? <p className="form-info">{actionInfo}</p> : null}

              <button
                className="w-full py-4 bg-primary text-white font-black rounded-xl shadow-xl shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-3 transition-transform active:scale-[0.98] disabled:opacity-60"
                onClick={handleConvert}
                disabled={Boolean(actionLoading)}
              >
                <span className="material-symbols-outlined">add_business</span>
                {actionLoading === 'convert' ? 'Converting...' : 'Accept & Create Account'}
              </button>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                  onClick={handleArchive}
                  disabled={Boolean(actionLoading)}
                >
                  {actionLoading === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
                <button
                  className="flex-1 py-3 border border-rose-100 text-rose-500 font-bold rounded-xl hover:bg-rose-50 transition-colors disabled:opacity-60"
                  onClick={handleReject}
                  disabled={Boolean(actionLoading)}
                >
                  {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
