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
  if (status === 'accepted') return 'bg-blue-100 text-blue-700'
  if (status === 'rejected') return 'bg-red-100 text-red-700'
  if (status === 'converted') return 'bg-green-100 text-green-700'
  return 'bg-yellow-100 text-yellow-700'
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
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Upptäcker leads...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary text-primary transition-colors duration-200">
      {/* Navigation */}
      <nav className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                <h1 className="text-xl font-bold tracking-tight text-primary">Lösen</h1>
              </div>
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Dashboard</Link>
                <Link href="/contacts" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Contacts</Link>
                <Link href="/companies" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Companies</Link>
                <Link href="/leads" className="px-3 py-2 rounded-md text-sm font-medium bg-accent-soft text-accent-primary">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <button onClick={() => router.back()} className="text-sm font-bold text-secondary hover:text-primary">Tillbaka</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎯</span>
              <h2 className="text-3xl font-extrabold text-primary tracking-tight">AI Lead Discovery</h2>
            </div>
            <p className="text-secondary mt-1">Hitta nya affärsmöjligheter baserat på tillväxtsignaler.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={loadData} className="p-2 px-4 text-xs font-bold bg-secondary text-secondary border border-color rounded-lg hover:bg-primary transition-all">↻ Uppdatera</button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {actionMessage && (
          <div className="mb-6 p-3 px-4 bg-accent-soft border border-accent-primary border-opacity-20 rounded-lg text-accent-primary text-sm font-medium flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <span>✨</span> {actionMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="md:col-span-3 card p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Filtrera Status</label>
                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)} 
                  className="input-field text-sm"
                >
                  <option value="new">Nya Leads</option>
                  <option value="accepted">Accepterade</option>
                  <option value="rejected">Nekade</option>
                  <option value="converted">Konverterade</option>
                  <option value="all">Alla</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Lägsta Score ({minScore})</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="5"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-accent-primary mt-3"
                />
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-[10px] text-muted leading-tight">Visar {filteredItems.length} leads baserat på aktiv profil och historisk data.</p>
              </div>
            </div>
          </div>
          <div className="card p-6 bg-accent-soft border-accent-primary border-opacity-10 flex flex-col justify-center text-center">
            <span className="text-2xl font-black text-accent-primary">{filteredItems.length}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-accent-primary opacity-70">Matchningar</span>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center card">
            <span className="text-5xl mb-4">🛸</span>
            <p className="text-secondary font-bold">Inga leads matchar filtret</p>
            <p className="text-muted text-xs mt-1">Testa att sänka din "Min score" eller byt statusfilter.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredItems.map((item) => {
              const linkedinCompanyUrl = buildLinkedInCompanySearchUrl(item.company_name)
              const linkedinPeopleUrl = buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title)
              const isBusy = actionLoadingId === item.id
              const scoreColor = item.score > 80 ? 'text-status-green-border' : item.score > 60 ? 'text-status-yellow-border' : 'text-status-red-border'

              return (
                <div key={item.id} className="card p-0 overflow-hidden border-color group">
                  <div className={`h-1 w-full bg-gradient-to-r ${
                    item.score > 80 ? 'from-green-400 to-green-600' : 
                    item.score > 60 ? 'from-yellow-400 to-yellow-600' : 
                    'from-red-400 to-red-600'
                  }`}></div>
                  
                  <div className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-xl shadow-inner border border-color">
                          {item.company_domain ? (
                            <img src={`https://icon.horse/icon/${item.company_domain}`} alt="" className="w-6 h-6 rounded" onError={(e) => e.target.style.display='none'} />
                          ) : '🏢'}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-primary tracking-tight">{item.company_name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-bold text-accent-primary bg-accent-soft px-2 py-0.5 rounded uppercase tracking-tighter">
                              {item.recommended_person_title || 'HR-chef / VD'}
                            </span>
                            <span className="text-muted text-xs flex items-center gap-1">
                              🌐 {item.company_domain || 'Ingen domän'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className={`text-2xl font-black ${scoreColor}`}>{item.score}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Lead Score</p>
                        </div>
                        <div className="pl-6 border-l border-color">
                          <span className={`badge ${
                            item.status === 'converted' ? 'badge-green' :
                            item.status === 'accepted' ? 'badge-yellow' :
                            item.status === 'rejected' ? 'badge-red' :
                            'badge-yellow opacity-50'
                          }`}>
                            {toStatusLabel(item.status)}
                          </span>
                          <p className="text-[10px] text-muted mt-1 font-medium">Status</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">Analys & Motiv</h4>
                          <p className="text-primary font-bold text-sm leading-relaxed">{item.reason}</p>
                        </div>
                        <div className="p-4 bg-secondary bg-opacity-50 rounded-lg border border-color italic text-sm text-secondary">
                          "{item.pitch}"
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-secondary rounded-lg border border-color">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Signal</p>
                            <p className="text-xs font-bold text-primary">{item.growth_signal || 'Generell tillväxt'}</p>
                          </div>
                          <div className="p-3 bg-secondary rounded-lg border border-color">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Anställda</p>
                            <p className="text-xs font-bold text-primary">{item.employee_count_estimate || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted pt-2">
                          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-primary flex items-center gap-2 font-medium">
                            📁 <span className="underline">{item.source_title}</span>
                          </a>
                          <span>{item.source_published_at ? new Date(item.source_published_at).toLocaleDateString() : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-color">
                      <div className="flex items-center gap-2">
                        <a href={linkedinCompanyUrl} target="_blank" rel="noopener noreferrer" className="p-2 px-3 text-xs font-bold border border-color rounded-lg hover:bg-secondary transition-all flex items-center gap-2">
                          <span>💼</span> Bolag
                        </a>
                        <a href={linkedinPeopleUrl} target="_blank" rel="noopener noreferrer" className="p-2 px-3 text-xs font-bold border border-color rounded-lg hover:bg-secondary transition-all flex items-center gap-2">
                          <span>👤</span> Personer
                        </a>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {item.status === 'new' && (
                          <>
                            <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'rejected')} className="p-2 px-4 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-all">
                              Avfärda
                            </button>
                            <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'accepted')} className="p-2 px-6 text-xs font-black bg-accent-soft text-accent-primary rounded-lg hover:bg-accent-primary hover:text-white transition-all">
                              Acceptera
                            </button>
                          </>
                        )}
                        {item.status === 'accepted' && (
                          <div className="flex gap-2">
                            <button disabled={isBusy} onClick={() => handleCreateCompany(item)} className="p-2 px-4 text-xs font-black bg-accent-primary text-white rounded-lg hover:shadow-lg transition-all">
                              Skapa Bolag
                            </button>
                            <button disabled={isBusy} onClick={() => handleCreateContactDraft(item)} className="p-2 px-4 text-xs font-black bg-primary text-primary border border-accent-primary rounded-lg hover:bg-accent-soft transition-all">
                              Skapa Kontaktutkast
                            </button>
                          </div>
                        )}
                        {isBusy && (
                          <div className="w-4 h-4 border-2 border-accent-soft border-t-accent-primary rounded-full animate-spin"></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
