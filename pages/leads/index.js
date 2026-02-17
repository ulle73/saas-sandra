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
      const contactCandidates = toContactCandidates(item)
      const topCandidate = contactCandidates[0]
      const linkedinPeopleUrl = topCandidate?.linkedin_url || topCandidate?.profile_url || buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title)
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
          <ul className="space-y-4">
            {filteredItems.map((item) => {
              const linkedinCompanyUrl = buildLinkedInCompanySearchUrl(item.company_name)
              const linkedinPeopleUrl = buildLinkedInPeopleSearchUrl(item.company_name, item.recommended_person_title)
              const contactCandidates = toContactCandidates(item)
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
                    <p><span className="font-medium">Signal:</span> {item.growth_signal || '-'}</p>
                    <p><span className="font-medium">Anställda (est):</span> {item.employee_count_estimate || '-'}</p>
                    <p><span className="font-medium">Domän:</span> {item.company_domain || '-'}</p>
                  </div>

                  <p className="text-gray-900 font-medium mb-1">{item.reason}</p>
                  <p className="text-gray-700 mb-2">{item.pitch}</p>

                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-900 mb-2">
                      Kontaktpersoner ({contactCandidates.length})
                    </p>
                    {contactCandidates.length === 0 ? (
                      <p className="text-sm text-gray-500">Inga personer hittades ännu för detta bolag.</p>
                    ) : (
                      <ul className="space-y-2">
                        {contactCandidates.map((person, index) => (
                          <li key={`${item.id}-person-${index}`} className="bg-gray-50 border rounded p-2 text-sm">
                            <p className="font-medium">{person.name || 'Okänt namn'}</p>
                            <p className="text-gray-700">{person.title || '-'}</p>
                            <div className="text-gray-600 mt-1">
                              <p>Plats: {person.location || '-'}</p>
                              <p>E-post: {person.email || '-'}</p>
                              <p>Telefon: {person.phone || '-'}</p>
                            </div>
                            {person.linkedin_url || person.profile_url ? (
                              <a
                                href={person.linkedin_url || person.profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block mt-1 text-blue-600 hover:underline"
                              >
                                Öppna LinkedIn-profil
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
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
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
