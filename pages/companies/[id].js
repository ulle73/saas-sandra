import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import {
  KEYWORD_PRESETS,
  parseCustomKeywords,
  buildKeywordsFromPresets,
  buildGoogleAlertsQuery,
  buildGoogleNewsTestUrl,
} from '../../lib/newsKeywords'
import { Check } from 'lucide-react'

const COMPANY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function normalizeCompanyStatus(value) {
  return value === 'inactive' ? 'inactive' : 'active'
}

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function toArticleBadgeClass(isRelevant) {
  return isRelevant ? 'badge badge-status-converted' : 'badge badge-status-rejected'
}

export default function EditCompany({ session }) {
  const router = useRouter()
  const { id } = router.query
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState('active')
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
        .eq('user_id', session.user.id)
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
    setStatus(normalizeCompanyStatus(data.status))
    setSelectedPresetIds(data.news_keyword_ids || [])

    const hasNewFields = (data.news_keyword_ids?.length || 0) > 0 || (data.news_custom_keywords?.length || 0) > 0
    if (hasNewFields) {
      setCustomKeywordsInput((data.news_custom_keywords || []).join(', '))
    } else {
      setCustomKeywordsInput((data.news_keywords || []).join(', '))
    }

    setFetchedArticles(newsData || [])
    setLoading(false)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    const customKeywords = parseCustomKeywords(customKeywordsInput)
    const mergedKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])
    const updates = {
      name,
      industry: industry || null,
      website: website || null,
      status: normalizeCompanyStatus(status),
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
      if (/column .*status/i.test(String(updateError.message || ''))) {
        setError('Company status saknas i databasen. Kör `npm run db:init` för att uppdatera schema.')
      } else {
        setError(updateError.message)
      }
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

  if (loading) return null

  const customKeywords = parseCustomKeywords(customKeywordsInput)
  const previewKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])
  const googleQuery = buildGoogleAlertsQuery(name, previewKeywords)
  const googleUrl = buildGoogleNewsTestUrl(googleQuery)

  const relevantCount = fetchedArticles.filter((article) => article.is_relevant).length
  const filteredOutCount = fetchedArticles.length - relevantCount
  const visibleArticles = showAllArticles ? fetchedArticles : fetchedArticles.slice(0, 4)
  const websitePreview = normalizeWebUrl(website)

  return (
    <div className="page-wide page-stack ux-section-stagger">
      <section className="glass-panel text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Companies</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Edit Company</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Refine account profile, status and keyword targeting to improve monitoring quality.</p>
      </section>

      <form onSubmit={handleSave} className="glass-panel space-y-6">
        <div className="between-row">
          <h2 className="section-title">Company Details</h2>
          <button type="button" className="btn-secondary" onClick={() => router.push('/companies')}>
            Back
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="split-2">
          <div>
            <label className="form-label">Company Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="form-label">Industry</label>
            <input value={industry} onChange={(event) => setIndustry(event.target.value)} className="input-field" />
          </div>
        </div>

        <div className="split-2">
          <div>
            <label className="form-label">Website</label>
            <input value={website} onChange={(event) => setWebsite(event.target.value)} className="input-field" placeholder="https://example.com" />
            {websitePreview ? (
              <a href={websitePreview} target="_blank" rel="noopener noreferrer" className="inline-link tiny-copy top-gap-xs">
                Open website
              </a>
            ) : null}
          </div>
          <div>
            <label className="form-label">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="input-field">
              {COMPANY_STATUSES.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>
              ))}
            </select>
            <p className="tiny-copy muted top-gap-xs">
              Set to Inactive when you stop working with this company.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="font-bold text-slate-900 dark:text-white mb-4">Keyword Presets</p>
          <div className="space-y-3 max-h-[240px] overflow-y-auto px-2 custom-scrollbar">
            {Object.values(KEYWORD_PRESETS).map((preset) => (
              <label key={preset.id} className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-start mt-1">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={selectedPresetIds.includes(preset.id)}
                    onChange={() => togglePreset(preset.id)}
                  />
                  <div className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center transition-colors">
                    {selectedPresetIds.includes(preset.id) && <Check size={12} className="text-white font-black" />}
                  </div>
                </div>
                <div>
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">{preset.label}</span>
                  <span className="block text-xs font-medium text-slate-500 mt-1">{preset.keywords.join(', ')}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Custom Keywords (comma separated)</label>
          <input
            value={customKeywordsInput}
            onChange={(event) => setCustomKeywordsInput(event.target.value)}
            className="input-field"
            placeholder="e.g. procurement, expansion, customer case"
          />
        </div>

        <details className="disclosure" open>
          <summary>Preview Query</summary>
          <div className="disclosure-content stack-sm">
            <p className="small-copy"><strong>Keywords:</strong> {previewKeywords.length ? previewKeywords.join(', ') : 'No keywords selected'}</p>
            <p className="small-copy break-anywhere"><strong>Google query:</strong> {googleQuery}</p>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-link small-copy">
              Test in Google News
            </a>
          </div>
        </details>

        <div className="flex justify-between items-center mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={handleDelete} className="text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors">
            Delete Company
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Company'}
          </button>
        </div>
      </form>

      <section className="glass-panel">
        <div className="between-row wrap-row">
          <p className="section-title">Fetched Articles</p>
          <div className="action-row">
            <span className="badge badge-status-accepted">Relevant: {relevantCount}</span>
            <span className="badge badge-status-rejected">Filtered: {filteredOutCount}</span>
            <span className="badge badge-confidence-medium">Total: {fetchedArticles.length}</span>
          </div>
        </div>

        {fetchedArticles.length === 0 ? (
          <p className="muted">No fetched articles yet for this company.</p>
        ) : (
          <>
            <ul className="stack-sm">
              {visibleArticles.map((article) => (
                <li key={article.id} className="panel-soft panel-pad stack-sm">
                  <div className="action-row align-center">
                    <span className={toArticleBadgeClass(article.is_relevant)}>
                      {article.is_relevant ? 'Relevant' : 'Filtered'}
                    </span>
                    <span className="badge badge-confidence-medium">{article.news_type || 'media'}</span>
                    {article.matched_keyword ? <span className="badge badge-priority-p2">Keyword: {article.matched_keyword}</span> : null}
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-link copy-strong">
                    {article.title}
                  </a>
                  <p className="tiny-copy muted">
                    {article.source || 'Unknown source'} · {new Date(article.published_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>

            {fetchedArticles.length > 4 ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAllArticles((current) => !current)}
              >
                {showAllArticles ? 'Show latest 4' : `Show all (${fetchedArticles.length})`}
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
