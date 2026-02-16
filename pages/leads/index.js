import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

function toStatusLabel(status) {
  if (status === 'accepted') return 'Accepted'
  if (status === 'rejected') return 'Rejected'
  if (status === 'converted') return 'Converted'
  return 'New'
}

function toStatusBadgeClass(status) {
  if (status === 'accepted') return 'badge-yellow'
  if (status === 'rejected') return 'badge-red'
  if (status === 'converted') return 'badge-green'
  return 'badge-yellow opacity-50'
}

function buildLinkedInCompanySearchUrl(companyName) {
  const query = encodeURIComponent(companyName || '')
  return `https://www.linkedin.com/search/results/companies/?keywords=${query}`
}

function buildLinkedInPeopleSearchUrl(companyName, suggestedTitle) {
  const roleTerms = suggestedTitle
    ? `${suggestedTitle} OR HR-chef OR Head of People OR HR Business Partner OR VD`
    : 'HR-chef OR Head of People OR HR Business Partner OR VD'
  const query = encodeURIComponent(`${companyName} ${roleTerms}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${query}`
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

export default function Leads({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [minScore, setMinScore] = useState(50)
  const [actionMessage, setActionMessage] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')

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
      const [{ data: discoveryData, error: discoveryError }, { data: companyData, error: companyError }] = await Promise.all([
        supabase
          .from('lead_discovery_items')
          .select('*')
          .eq('user_id', session.user.id)
          .order('score', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('companies')
          .select('id, name')
          .eq('user_id', session.user.id)
          .order('name'),
      ])

      if (discoveryError || companyError) {
        throw new Error(discoveryError?.message || companyError?.message || 'Failed to load discovery data')
      }

      setItems(discoveryData || [])
      setCompanies(companyData || [])
    } catch (loadError) {
      console.error('Error loading lead discovery', loadError)
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const scoreOk = Number(item.score || 0) >= minScore
      const statusOk = statusFilter === 'all' || item.status === statusFilter
      return scoreOk && statusOk
    })
  }, [items, minScore, statusFilter])

  const updateItem = async (id, patch) => {
    const { error: updateError } = await supabase
      .from('lead_discovery_items')
      .update({
        ...patch,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (updateError) throw updateError
  }

  const handleSetStatus = async (itemId, status) => {
    setActionMessage('')
    setActionLoadingId(itemId)
    try {
      await updateItem(itemId, { status })
      setItems((previous) => previous.map((item) => (
        item.id === itemId ? { ...item, status, reviewed_at: new Date().toISOString() } : item
      )))
      setActionMessage(`Status uppdaterad till ${toStatusLabel(status)}.`)
    } catch (statusError) {
      setActionMessage(statusError.message)
    } finally {
      setActionLoadingId('')
    }
  }

  const ensureCompany = async (item) => {
    const existing = companies.find((company) => normalizeName(company.name) === normalizeName(item.company_name))
    if (existing) return existing.id

    const insertPayload = {
      user_id: session.user.id,
      name: item.company_name,
      website: item.company_domain ? `https://${item.company_domain}` : null,
      news_keyword_ids: [],
      news_custom_keywords: [],
      news_keywords: [],
    }

    const { data: inserted, error: insertError } = await supabase
      .from('companies')
      .insert(insertPayload)
      .select('id, name')
      .single()

    if (insertError) throw insertError

    setCompanies((previous) => [...previous, inserted].sort((a, b) => a.name.localeCompare(b.name)))
    return inserted.id
  }

  const handleCreateCompany = async (item) => {
    setActionMessage('')
    setActionLoadingId(item.id)
    try {
      const companyId = await ensureCompany(item)
      await updateItem(item.id, {
        status: 'converted',
        converted_company_id: companyId,
      })

      setItems((previous) => previous.map((row) => (
        row.id === item.id
          ? { ...row, status: 'converted', converted_company_id: companyId, reviewed_at: new Date().toISOString() }
          : row
      )))
      setActionMessage(`Bolaget "${item.company_name}" är nu skapat i CRM.`)
    } catch (createError) {
      setActionMessage(createError.message)
    } finally {
      setActionLoadingId('')
    }
  }

  const handleCreateContactDraft = async (item) => {
    setActionMessage('')
    setActionLoadingId(item.id)
    try {
      const companyId = await ensureCompany(item)
      const linkedinPeopleUrl = buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title)
      const draftName = `${item.recommended_person_title || 'HR-chef / VD'} (${item.company_name})`

      const { data: insertedContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          user_id: session.user.id,
          company_id: companyId,
          name: draftName,
          linkedin_url: linkedinPeopleUrl,
          notes: `AI discovery lead. Källa: ${item.source_url}\nReason: ${item.reason}`,
        })
        .select('id')
        .single()

      if (contactError) throw contactError

      await updateItem(item.id, {
        status: 'converted',
        converted_company_id: companyId,
        converted_contact_id: insertedContact.id,
      })

      setItems((previous) => previous.map((row) => (
        row.id === item.id
          ? {
            ...row,
            status: 'converted',
            converted_company_id: companyId,
            converted_contact_id: insertedContact.id,
            reviewed_at: new Date().toISOString(),
          }
          : row
      )))
      setActionMessage(`Kontaktutkast skapat för "${item.company_name}".`)
    } catch (draftError) {
      setActionMessage(draftError.message)
    } finally {
      setActionLoadingId('')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium">Upptäcker leads...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Lead Generation</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Lead Discovery</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="btn-secondary py-2.5 px-6 text-xs font-black">
            ↺ UPPDATERA
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Discovery Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 card flex items-center gap-8 py-4">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Statusfilter</label>
            <div className="flex gap-2">
              {['new', 'accepted', 'rejected', 'converted', 'all'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                    statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted border-color hover:border-muted'
                  }`}
                >
                  {s === 'all' ? 'Alla' : toStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
          <div className="w-64">
             <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Lägsta Score: {minScore}</label>
             <input
                type="range"
                min="1"
                max="100"
                step="5"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
          </div>
        </div>
        <div className="card flex flex-col justify-center text-center bg-accent-soft border-accent-primary/20">
            <span className="text-3xl font-black text-accent-primary">{filteredItems.length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary opacity-60">Resultat</span>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 px-4 bg-accent-soft border border-accent-primary/20 rounded-xl text-accent-primary text-xs font-bold animate-in fade-in slide-in-from-top-2">
          ✨ {actionMessage}
        </div>
      )}

      {/* Lead Cards Feed */}
      <div className="space-y-6">
        {filteredItems.map((item) => {
          const linkedinCompanyUrl = buildLinkedInCompanySearchUrl(item.company_name)
          const linkedinPeopleUrl = buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title)
          const isBusy = actionLoadingId === item.id
          const scoreColor = item.score > 80 ? 'text-status-green' : item.score > 60 ? 'text-status-yellow' : 'text-status-red'

          return (
            <div key={item.id} className="card p-0 overflow-hidden group hover:border-muted transition-all">
              <div className={`h-1.5 w-full ${
                item.score > 80 ? 'bg-status-green' : 
                item.score > 60 ? 'bg-status-yellow' : 
                'bg-status-red'
              }`}></div>
              
              <div className="p-8">
                <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-secondary border border-color flex items-center justify-center text-2xl group-hover:border-muted transition-colors overflow-hidden">
                      {item.company_domain ? (
                        <img src={`https://icon.horse/icon/${item.company_domain}`} alt="" className="w-8 h-8 opacity-80 group-hover:opacity-100" onError={(e) => e.target.style.display='none'} />
                      ) : '🎯'}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-primary tracking-tight mb-1">{item.company_name}</h3>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-accent-primary bg-accent-soft px-2.5 py-1 rounded-md uppercase tracking-widest">
                          {item.recommended_person_title || 'HR-CHEF / VD'}
                        </span>
                        <a href={`https://${item.company_domain}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted font-bold uppercase tracking-widest hover:text-primary transition-colors">
                          {item.company_domain || 'DOMÄN SAKNAS'} ↗
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 pl-8 border-l border-color">
                    <div className="text-center">
                      <p className={`text-3xl font-black ${scoreColor} leading-none mb-1`}>{item.score}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted">Match Score</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <span className={`badge ${toStatusBadgeClass(item.status)} text-[10px]`}>
                        {toStatusLabel(item.status).toUpperCase()}
                      </span>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted mt-2">Status</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-8">
                  <div className="lg:col-span-7 space-y-6">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3">AI Discovery Motivering</h4>
                      <p className="text-primary font-bold text-sm leading-relaxed">{item.reason}</p>
                    </div>
                    <div className="p-4 bg-secondary border border-color rounded-xl border-dashed">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-2 italic">Föreslagen Pitch</p>
                      <p className="text-secondary text-sm italic">"{item.pitch}"</p>
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="card bg-secondary/30 py-3 px-4">
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Signal</p>
                        <p className="text-xs font-black text-primary truncate">{item.growth_signal || 'Tillväxt'}</p>
                      </div>
                      <div className="card bg-secondary/30 py-3 px-4">
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Huvudkontor</p>
                        <p className="text-xs font-black text-primary truncate">{item.employee_count_estimate || 'Ej angivet'}</p>
                      </div>
                    </div>
                    <div className="pt-2">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3">Signal-källa</h4>
                       <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-color hover:bg-secondary transition-all group/source">
                          <div className="w-8 h-8 rounded-lg bg-card border border-color flex items-center justify-center group-hover/source:border-muted transition-colors">📄</div>
                          <div className="flex-1 truncate">
                             <p className="text-xs font-black text-primary truncate">{item.source_title}</p>
                             <p className="text-[10px] text-muted font-bold uppercase">{item.source_published_at ? new Date(item.source_published_at).toLocaleDateString() : 'Okänt datum'}</p>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-muted group-hover/source:text-primary transition-colors">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                          </svg>
                       </a>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-color flex flex-wrap items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <a href={linkedinCompanyUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary py-2 px-4 text-[10px] font-black flex items-center gap-2 tracking-widest">
                      <span>💼</span> LINKEDIN BOLAG
                    </a>
                    <a href={linkedinPeopleUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary py-2 px-4 text-[10px] font-black flex items-center gap-2 tracking-widest">
                      <span>👤</span> LINKEDIN PERSONER
                    </a>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {item.status === 'new' && (
                      <div className="flex items-center gap-3">
                        <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'rejected')} className="text-[10px] font-black text-muted hover:text-red-500 uppercase tracking-[0.2em] transition-colors pr-4">
                          Avfärda
                        </button>
                        <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'accepted')} className="btn-primary py-2.5 px-8 text-[10px] font-black tracking-widest shadow-xl shadow-accent-primary/10">
                          ACCEPTERA LEAD
                        </button>
                      </div>
                    )}
                    {item.status === 'accepted' && (
                      <div className="flex gap-3">
                        <button disabled={isBusy} onClick={() => handleCreateContactDraft(item)} className="btn-secondary py-2.5 px-6 text-[10px] font-black tracking-widest text-accent-primary border-accent-primary/30">
                          SKAPA KONTAKTUTKAST
                        </button>
                        <button disabled={isBusy} onClick={() => handleCreateCompany(item)} className="btn-primary py-2.5 px-8 text-[10px] font-black tracking-widest shadow-xl shadow-accent-primary/20">
                          SKAPA BOLAG I CRM
                        </button>
                      </div>
                    )}
                    {isBusy && (
                      <div className="w-5 h-5 border-3 border-accent-soft border-t-accent-primary rounded-full animate-spin"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center card border-dashed">
          <span className="text-6xl mb-8 grayscale opacity-20">🎯</span>
          <p className="text-primary font-black text-2xl mb-2">Inga leads matchar din profil</p>
          <p className="text-muted text-sm max-w-sm">Justera dina filter eller vänta på nästa AI-genererade batch av tillväxtsignaler.</p>
        </div>
      )}
    </div>
  )
}
