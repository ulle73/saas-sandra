import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import AppShell from '../../components/AppShell'
import {
  KEYWORD_PRESETS,
  parseCustomKeywords,
  buildKeywordsFromPresets,
  buildGoogleAlertsQuery,
  buildGoogleNewsTestUrl,
} from '../../lib/newsKeywords'

function toArticleBadgeClass(isRelevant) {
  return isRelevant ? 'badge badge-status-converted' : 'badge badge-status-rejected'
}

export default function EditCompany({ session, theme, toggleTheme }) {
  const router = useRouter()
  const { id } = router.query
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [selectedPresetIds, setSelectedPresetIds] = useState([])
  const [customKeywordsInput, setCustomKeywordsInput] = useState('')
  const [fetchedArticles, setFetchedArticles] = useState([])
  const [showAllArticles, setShowAllArticles] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    if (!id) return
    fetchCompany()
  }, [session, id, router])

  const fetchCompany = async () => {
    setLoading(true)
    setError('')

    const [companyResult, newsResult] = await Promise.all([
      supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single(),
      supabase
        .from('news_items')
        .select('id, title, url, source, news_type, published_at, is_relevant, matched_keyword')
        .eq('company_id', id)
        .order('published_at', { ascending: false })
        .limit(200),
    ])

    const { data, error: fetchError } = companyResult
    const { data: newsData, error: newsError } = newsResult

    if (fetchError || newsError) {
      setError(fetchError?.message || newsError?.message || 'Failed to load company')
      setLoading(false)
      return
    }

    if (!data) {
      setError('Company not found')
      setLoading(false)
      return
    }

    setName(data.name || '')
    setIndustry(data.industry || '')
    setWebsite(data.website || '')
    setSelectedPresetIds(data.news_keyword_ids || [])

    const hasNewFields = (data.news_keyword_ids?.length || 0) > 0 || (data.news_custom_keywords?.length || 0) > 0
    if (hasNewFields) {
      setCustomKeywordsInput((data.news_custom_keywords || []).join(', '))
    } else {
      // Backward compatibility: expose old keywords as custom if new fields are empty.
      setCustomKeywordsInput((data.news_keywords || []).join(', '))
    }

    setFetchedArticles(newsData || [])
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const customKeywords = parseCustomKeywords(customKeywordsInput)
    const mergedKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])
    const updates = {
      name,
      industry: industry || null,
      website: website || null,
      news_keyword_ids: selectedPresetIds,
      news_custom_keywords: customKeywords,
      news_keywords: mergedKeywords,
    }

    const { error: updateError } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    router.push('/companies')
  }

  const handleDelete = async () => {
    if (!confirm('Delete this company?')) return

    const { error: deleteError } = await supabase
      .from('companies')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/companies')
  }

  const togglePreset = (presetId) => {
    setSelectedPresetIds((current) => {
      if (current.includes(presetId)) {
        return current.filter((item) => item !== presetId)
      }
      return [...current, presetId]
    })
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const customKeywords = parseCustomKeywords(customKeywordsInput)
  const previewKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])
  const googleQuery = buildGoogleAlertsQuery(name, previewKeywords)
  const googleUrl = buildGoogleNewsTestUrl(googleQuery)

  const relevantCount = fetchedArticles.filter((article) => article.is_relevant).length
  const filteredOutCount = fetchedArticles.length - relevantCount
  const visibleArticles = showAllArticles ? fetchedArticles : fetchedArticles.slice(0, 2)

  return (
    <AppShell
      title={`Company: ${name || 'Edit'}`}
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<button type="button" onClick={() => router.push('/companies')} className="btn-secondary">Back</button>}
    >
      <div className="max-w-5xl page-stack">
        <section className="card p-6 page-stack">
          {error && <p className="text-red-600">{error}</p>}

          <div className="split-2">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block font-medium mb-1">Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="input-field" />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Website</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="input-field"
              placeholder="https://..."
            />
          </div>

          <div className="panel-soft p-4">
            <p className="section-title mb-2">Keyword Presets</p>
            <div className="space-y-2">
              {Object.values(KEYWORD_PRESETS).map((preset) => (
                <label key={preset.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedPresetIds.includes(preset.id)}
                    onChange={() => togglePreset(preset.id)}
                  />
                  <span>
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-sm muted block">{preset.keywords.join(', ')}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Custom Keywords (comma separated)</label>
            <input
              value={customKeywordsInput}
              onChange={(e) => setCustomKeywordsInput(e.target.value)}
              className="input-field"
              placeholder="t.ex. upphandling, expansion, kundcase"
            />
          </div>

          <details className="disclosure">
            <summary>Preview Query</summary>
            <div className="disclosure-content space-y-2">
              <p className="text-sm"><strong>Keywords:</strong> {previewKeywords.length ? previewKeywords.join(', ') : 'No keywords selected'}</p>
              <p className="text-sm break-all"><strong>Google query:</strong> {googleQuery}</p>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-link text-sm">
                Test in Google News
              </a>
            </div>
          </details>

          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={handleDelete} className="text-red-600 hover:underline">
              Delete
            </button>
            <button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        <section className="card p-6 page-stack">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="section-title">Fetched Articles</p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-status-accepted">Relevant: {relevantCount}</span>
              <span className="badge badge-status-rejected">Filtered: {filteredOutCount}</span>
              <span className="badge badge-confidence-medium">Total: {fetchedArticles.length}</span>
            </div>
          </div>

          {fetchedArticles.length === 0 ? (
            <p className="muted">No fetched articles yet for this company.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {visibleArticles.map((article) => (
                  <li key={article.id} className="panel-soft p-3 space-y-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className={toArticleBadgeClass(article.is_relevant)}>
                        {article.is_relevant ? 'Relevant' : 'Filtered'}
                      </span>
                      <span className="badge badge-confidence-medium">{article.news_type || 'media'}</span>
                      {article.matched_keyword && (
                        <span className="badge badge-priority-p2">Keyword: {article.matched_keyword}</span>
                      )}
                    </div>
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-link font-medium">
                      {article.title}
                    </a>
                    <p className="text-xs muted">
                      {article.source || 'Unknown source'} · {new Date(article.published_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>

              {fetchedArticles.length > 2 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAllArticles((current) => !current)}
                >
                  {showAllArticles ? 'Show latest 2' : `Show all (${fetchedArticles.length})`}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  )
}
