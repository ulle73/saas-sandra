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

export default function EditCompany({ session }) {
  const router = useRouter()
  const { id } = router.query
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [selectedPresetIds, setSelectedPresetIds] = useState([])
  const [customKeywordsInput, setCustomKeywordsInput] = useState('')
  const [fetchedArticles, setFetchedArticles] = useState([])
  const [loading, setLoading] = useState(true)
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

    if (data) {
      setName(data.name)
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
    }

    setFetchedArticles(newsData || [])
    setLoading(false)
  }

  const handleSave = async () => {
    setLoading(true)
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
      setLoading(false)
      return
    }

    router.push('/companies')
  }

  const customKeywords = parseCustomKeywords(customKeywordsInput)
  const previewKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])
  const googleQuery = buildGoogleAlertsQuery(name, previewKeywords)
  const googleUrl = buildGoogleNewsTestUrl(googleQuery)

  const togglePreset = (presetId) => {
    setSelectedPresetIds((current) => {
      if (current.includes(presetId)) {
        return current.filter((id) => id !== presetId)
      }
      return [...current, presetId]
    })
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

  if (loading) return <div className="p-8 text-center">Loading...</div>

  const relevantCount = fetchedArticles.filter((article) => article.is_relevant).length
  const filteredOutCount = fetchedArticles.length - relevantCount

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🏢 Edit Company</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto py-8">
        <div className="card p-6 space-y-4">
          {error && <p className="text-red-600">{error}</p>}
          <div>
            <label className="block font-medium mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">Industry</label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block font-medium mb-1">Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} className="input-field" placeholder="https://..." />
          </div>
          <div>
            <label className="block font-medium mb-2">Keyword Presets</label>
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
                    <span className="text-sm text-gray-500 block">{preset.keywords.join(', ')}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Custom Keywords (comma separated)</label>
            <input
              value={customKeywordsInput}
              onChange={e => setCustomKeywordsInput(e.target.value)}
              className="input-field"
              placeholder="t.ex. upphandling, expansion, kundcase"
            />
          </div>
          <div className="bg-gray-50 border rounded p-3 space-y-2">
            <p className="text-sm font-medium">Preview keywords:</p>
            <p className="text-sm text-gray-600">{previewKeywords.length ? previewKeywords.join(', ') : 'No keywords selected'}</p>
            <p className="text-sm font-medium">Google Alerts query:</p>
            <p className="text-sm text-gray-700 break-all">{googleQuery}</p>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
              Test in Google News
            </a>
          </div>
          <div className="flex justify-between pt-4">
            <button onClick={handleDelete} className="text-red-600 hover:underline">Delete</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </div>
        <div className="card p-6 mt-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Fetched Articles (All)</h2>
            <p className="text-sm text-gray-500">
              Total: {fetchedArticles.length} | Relevant: {relevantCount} | Filtered out: {filteredOutCount}
            </p>
          </div>
          {fetchedArticles.length === 0 ? (
            <p className="text-gray-500">No fetched articles yet for this company.</p>
          ) : (
            <ul className="space-y-3">
              {fetchedArticles.map((article) => (
                <li key={article.id} className="border rounded p-3">
                  <div className="flex gap-2 items-center mb-1">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        article.is_relevant ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {article.is_relevant ? 'relevant' : 'filtered'}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
                      {article.news_type || 'media'}
                    </span>
                    {article.matched_keyword && (
                      <span className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700">
                        keyword: {article.matched_keyword}
                      </span>
                    )}
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                    {article.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    {article.source || 'Unknown source'} · {new Date(article.published_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
