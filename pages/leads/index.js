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

function buildLinkedInPeopleSearchUrl(companyName, suggestedTitle, linkedinCompanyId) {
  const roleTerms = suggestedTitle
    ? `${suggestedTitle} OR HR-chef OR Head of People OR HR Business Partner OR VD`
    : 'HR-chef OR Head of People OR HR Business Partner OR VD'
  const params = new URLSearchParams()
  params.set('keywords', `${companyName} ${roleTerms}`)
  if (linkedinCompanyId) {
    params.set('currentCompany', JSON.stringify([String(linkedinCompanyId)]))
  }
  params.set('origin', 'FACETED_SEARCH')
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function getPriorityLabel(item) {
  const fromReason = String(item?.reason || '').match(/\[(P[1-3])\]/i)?.[1]
  if (fromReason) return fromReason.toUpperCase()
  const score = Number(item?.score || 0)
  if (score >= 80) return 'P1'
  if (score >= 60) return 'P2'
  return 'P3'
}

function getPriorityClass(priority) {
  if (priority === 'P1') return 'bg-red-100 text-red-700 border-red-200'
  if (priority === 'P2') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-sky-100 text-sky-700 border-sky-200'
}

function getSourceQuality(item) {
  const text = `${item?.source_title || ''} ${item?.source_url || ''}`.toLowerCase()
  if (text.includes('mix vale') || text.includes('vietnam.vn')) return 'Low'
  if (
    text.includes('di.se')
    || text.includes('omniekonomi')
    || text.includes('affarsvarlden')
    || text.includes('mynewsdesk')
    || text.includes('byggindustrin')
  ) {
    return 'High'
  }
  return 'Medium'
}

function getSourceQualityClass(quality) {
  if (quality === 'High') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (quality === 'Low') return 'bg-rose-100 text-rose-700 border-rose-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

function getConfidenceLabel(item) {
  const score = Number(item?.score || 0)
  if (score >= 80) return 'Hög'
  if (score >= 60) return 'Medel'
  return 'Låg'
}

function formatAgeLabel(timestamp) {
  if (!timestamp) return 'Okänd tid'
  const diffMs = Date.now() - new Date(timestamp).getTime()
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Nyss'
  const mins = Math.floor(diffMs / (1000 * 60))
  if (mins < 60) return `${mins} min sedan`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h sedan`
  const days = Math.floor(hours / 24)
  return `${days} d sedan`
}

function getContactQuality(topContact) {
  if (!topContact) return { label: 'Ingen', className: 'bg-gray-100 text-gray-700 border-gray-200', score: 0 }
  const hasEmail = Boolean(topContact.email)
  const hasPhone = Boolean(topContact.phone)
  const hasLinkedIn = Boolean(topContact.linkedin_url || topContact.profile_url)
  if (hasEmail && hasPhone) return { label: 'Stark', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', score: 3 }
  if (hasEmail || hasPhone) return { label: 'Bra', className: 'bg-blue-100 text-blue-700 border-blue-200', score: 2 }
  if (hasLinkedIn) return { label: 'Bas', className: 'bg-amber-100 text-amber-700 border-amber-200', score: 1 }
  return { label: 'Ingen', className: 'bg-gray-100 text-gray-700 border-gray-200', score: 0 }
}

function getNextAction(item, topContact) {
  if (item.status === 'converted') return 'Följ upp i CRM och sätt nästa aktivitet.'
  if (item.status === 'rejected') return 'Behåll avvisad eller återöppna om ny signal kommer.'
  const quality = getContactQuality(topContact)
  if (quality.score >= 2) return 'Acceptera och skapa kontaktutkast direkt.'
  if (quality.score === 1) return 'Acceptera och kontakta via LinkedIn först.'
  return 'Verifiera kontaktperson via LinkedIn personsök.'
}

function toContactCandidates(item) {
  const raw = item?.contact_candidates
  const parsed = Array.isArray(raw)
    ? raw
    : (() => {
      if (!raw) return []
      try {
        const json = JSON.parse(raw)
        return Array.isArray(json) ? json : []
      } catch {
        return []
      }
    })()

  return parsed.filter((entry) => entry && typeof entry === 'object')
}

export default function Leads({ session }) {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [minScore, setMinScore] = useState(50)
  const [actionMessage, setActionMessage] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [expandedContactsById, setExpandedContactsById] = useState({})

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
    const filtered = items.filter((item) => {
      const scoreOk = Number(item.score || 0) >= minScore
      const statusOk = statusFilter === 'all' || item.status === statusFilter
      return scoreOk && statusOk
    })
    return filtered.sort((a, b) => {
      const priorityRank = { P1: 3, P2: 2, P3: 1 }
      const pDiff = (priorityRank[getPriorityLabel(b)] || 0) - (priorityRank[getPriorityLabel(a)] || 0)
      if (pDiff !== 0) return pDiff
      const sDiff = Number(b.score || 0) - Number(a.score || 0)
      if (sDiff !== 0) return sDiff
      return new Date(b.source_published_at || b.created_at).getTime() - new Date(a.source_published_at || a.created_at).getTime()
    })
  }, [items, minScore, statusFilter])

  const topTodayItems = useMemo(() => filteredItems.slice(0, 5), [filteredItems])
  const remainingItems = useMemo(() => filteredItems.slice(5), [filteredItems])

  const summary = useMemo(() => {
    const all = items.length
    const fresh = items.filter((item) => item.status === 'new').length
    const p1 = items.filter((item) => getPriorityLabel(item) === 'P1').length
    const converted = items.filter((item) => item.status === 'converted').length
    return { all, fresh, p1, converted }
  }, [items])

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
      const contactCandidates = toContactCandidates(item)
      const topCandidate = contactCandidates[0]
      const linkedinPeopleUrl = topCandidate?.linkedin_url
        || topCandidate?.profile_url
        || buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title, item.linkedin_company_id)
      const draftName = topCandidate?.name
        || `${item.recommended_person_title || 'HR-chef / VD'} (${item.company_name})`
      const draftNotesParts = [
        `AI discovery lead. Källa: ${item.source_url}`,
        `Reason: ${item.reason}`,
      ]
      if (topCandidate?.title) draftNotesParts.push(`Föreslagen roll: ${topCandidate.title}`)
      if (topCandidate?.location) draftNotesParts.push(`Plats: ${topCandidate.location}`)
      if (topCandidate?.email) draftNotesParts.push(`E-post: ${topCandidate.email}`)
      if (topCandidate?.phone) draftNotesParts.push(`Telefon: ${topCandidate.phone}`)
      if (topCandidate?.linkedin_url || topCandidate?.profile_url) {
        draftNotesParts.push(`LinkedIn: ${topCandidate.linkedin_url || topCandidate.profile_url}`)
      }
      const draftNotes = draftNotesParts.join('\n')

      const { data: insertedContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          user_id: session.user.id,
          company_id: companyId,
          name: draftName,
          linkedin_url: linkedinPeopleUrl,
          email: topCandidate?.email || null,
          phone: topCandidate?.phone || null,
          notes: draftNotes,
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

  const toggleContacts = (itemId) => {
    setExpandedContactsById((previous) => ({
      ...previous,
      [itemId]: !previous[itemId],
    }))
  }

  const renderLeadCard = (item) => {
    const linkedinCompanyUrl = buildLinkedInCompanySearchUrl(item.company_name)
    const linkedinPeopleUrl = buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title, item.linkedin_company_id)
    const contactCandidates = toContactCandidates(item)
    const topContact = contactCandidates[0]
    const extraContacts = contactCandidates.slice(1)
    const isExpanded = Boolean(expandedContactsById[item.id])
    const priorityLabel = getPriorityLabel(item)
    const sourceQuality = getSourceQuality(item)
    const contactQuality = getContactQuality(topContact)
    const nextAction = getNextAction(item, topContact)
    const isBusy = actionLoadingId === item.id

    return (
      <li key={item.id} className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-semibold">{item.company_name}</h2>
            <p className="text-sm text-gray-600">
              Rekommenderad kontakt: {item.recommended_person_title || 'HR-chef / VD'}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block px-2 py-1 rounded text-sm ${toStatusBadgeClass(item.status)}`}>
              {toStatusLabel(item.status)}
            </span>
            <p className="text-sm text-gray-600 mt-1">Score: {item.score}/100</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className={`px-2 py-1 rounded border ${getPriorityClass(priorityLabel)}`}>{priorityLabel}</span>
          <span className={`px-2 py-1 rounded border ${contactQuality.className}`}>Kontaktkvalitet: {contactQuality.label}</span>
          <span className={`px-2 py-1 rounded border ${getSourceQualityClass(sourceQuality)}`}>Källkvalitet: {sourceQuality}</span>
          <span className="px-2 py-1 rounded border bg-indigo-100 text-indigo-700 border-indigo-200">Confidence: {getConfidenceLabel(item)}</span>
          <span className="px-2 py-1 rounded border bg-gray-100 text-gray-700 border-gray-200">{formatAgeLabel(item.source_published_at)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
          <p><span className="font-medium">Signal:</span> {item.growth_signal || '-'}</p>
          <p><span className="font-medium">Anställda (est):</span> {item.employee_count_estimate || '-'}</p>
          <p><span className="font-medium">Domän:</span> {item.company_domain || '-'}</p>
        </div>

        <div className="mb-3 p-3 rounded border bg-gray-50">
          <p className="text-sm font-semibold text-gray-900 mb-1">Varför nu</p>
          <p className="text-gray-900 font-medium mb-1">{item.reason}</p>
          <p className="text-gray-700">{item.pitch}</p>
        </div>

        <div className="mb-3 p-3 rounded border bg-blue-50 border-blue-100">
          <p className="text-sm font-semibold text-blue-900 mb-1">Nästa action</p>
          <p className="text-sm text-blue-900">{nextAction}</p>
        </div>

        <div className="mb-3">
          <p className="text-sm font-semibold text-gray-900 mb-2">Kontaktpersoner ({contactCandidates.length})</p>
          {!topContact ? (
            <p className="text-sm text-gray-500">Inga personer hittades ännu för detta bolag.</p>
          ) : (
            <div className="bg-gray-50 border rounded p-3 text-sm">
              <p className="font-medium">{topContact.name || 'Okänt namn'}</p>
              <p className="text-gray-700">{topContact.title || '-'}</p>
              <div className="text-gray-600 mt-1">
                <p>Plats: {topContact.location || '-'}</p>
                <p>E-post: {topContact.email || '-'}</p>
                <p>Telefon: {topContact.phone || '-'}</p>
              </div>
              {topContact.linkedin_url || topContact.profile_url ? (
                <a
                  href={topContact.linkedin_url || topContact.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-blue-600 hover:underline"
                >
                  Öppna LinkedIn-profil
                </a>
              ) : null}
            </div>
          )}

          {extraContacts.length > 0 ? (
            <div className="mt-2">
              <button onClick={() => toggleContacts(item.id)} className="btn-secondary">
                {isExpanded ? 'Dölj fler kontakter' : `Visa fler kontakter (${extraContacts.length})`}
              </button>
              {isExpanded ? (
                <ul className="space-y-2 mt-2">
                  {extraContacts.map((person, index) => (
                    <li key={`${item.id}-person-${index + 1}`} className="bg-white border rounded p-2 text-sm">
                      <p className="font-medium">{person.name || 'Okänt namn'}</p>
                      <p className="text-gray-700">{person.title || '-'}</p>
                      <p className="text-gray-600">E-post: {person.email || '-'} · Telefon: {person.phone || '-'}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="text-sm text-gray-600 mb-4">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Källa: {item.source_title}
          </a>
          {item.source_published_at && (
            <span> · {new Date(item.source_published_at).toLocaleString()}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={linkedinCompanyUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            LinkedIn bolagssök
          </a>
          <a href={linkedinPeopleUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            LinkedIn personsök
          </a>
          <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'accepted')} className="btn-secondary">
            Accept
          </button>
          <button disabled={isBusy} onClick={() => handleSetStatus(item.id, 'rejected')} className="btn-secondary">
            Reject
          </button>
          <button disabled={isBusy} onClick={() => handleCreateCompany(item)} className="btn-primary">
            Skapa bolag i CRM
          </button>
          <button disabled={isBusy} onClick={() => handleCreateContactDraft(item)} className="btn-primary">
            Skapa kontaktutkast
          </button>
        </div>
      </li>
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🎯 AI Lead Discovery</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-8">
        {error && <p className="text-red-600 mb-4">{error}</p>}
        {actionMessage && <p className="text-blue-700 mb-4">{actionMessage}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-3">
            <p className="text-xs text-gray-500">Alla leads</p>
            <p className="text-2xl font-semibold">{summary.all}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-gray-500">Nya</p>
            <p className="text-2xl font-semibold">{summary.fresh}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-gray-500">P1</p>
            <p className="text-2xl font-semibold">{summary.p1}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-gray-500">Konverterade</p>
            <p className="text-2xl font-semibold">{summary.converted}</p>
          </div>
        </div>

        <div className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
              <option value="new">New</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="converted">Converted</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min score</label>
            <input
              type="number"
              min="1"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) || 1)}
              className="input-field"
            />
          </div>
          <div className="flex items-end">
            <button onClick={loadData} className="btn-secondary w-full">Refresh</button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <p className="text-center text-gray-500">Inga discovery-leads matchar filtret.</p>
        ) : (
          <>
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Top 5 idag</h2>
                <p className="text-sm text-gray-500">Mest prioriterade först</p>
              </div>
              <ul className="space-y-4">
                {topTodayItems.map((item) => renderLeadCard(item))}
              </ul>
            </section>

            {remainingItems.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold mb-3">Övriga leads</h2>
                <ul className="space-y-4">
                  {remainingItems.map((item) => renderLeadCard(item))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
