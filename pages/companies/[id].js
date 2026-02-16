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

export default function EditCompany({ session, theme, toggleTheme }) {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar företag...</p>
        </div>
      </div>
    )
  }

  const relevantCount = fetchedArticles.filter((article) => article.is_relevant).length
  const filteredOutCount = fetchedArticles.length - relevantCount

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
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <button onClick={() => router.back()} className="text-sm font-bold text-secondary hover:text-primary transition-all">Gå tillbaka</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-black text-primary tracking-tight">{name}</h2>
            <p className="text-secondary mt-1">Hantera bevakningsprofil och se insamlade signaler.</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleDelete} 
              className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-all"
            >
              Radera företag
            </button>
            <button 
              onClick={handleSave} 
              className="btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-accent-soft transition-all"
            >
              Spara ändringar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Settings Section */}
          <div className="lg:col-span-12 space-y-8">
            <div className="card p-8 border-color shadow-sm">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-6 flex items-center gap-2">
                    <span>🏢</span> Grunduppgifter
                  </h3>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Företagsnamn</label>
                    <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Bransch</label>
                    <input value={industry} onChange={e => setIndustry(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Webbplats</label>
                    <input value={website} onChange={e => setWebsite(e.target.value)} className="input-field" />
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-6 flex items-center gap-2">
                    <span>📡</span> Bevakningsprofil
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.values(KEYWORD_PRESETS).map((preset) => (
                      <label 
                        key={preset.id} 
                        className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedPresetIds.includes(preset.id) 
                            ? 'border-accent-primary bg-accent-soft bg-opacity-10' 
                            : 'border-color bg-secondary hover:border-accent-primary hover:border-opacity-30'
                        }`}
                      >
                        <div className="flex items-center justify-between pointer-events-none">
                          <span className="text-[10px] font-bold text-primary">{preset.label}</span>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={selectedPresetIds.includes(preset.id)}
                            readOnly
                          />
                        </div>
                        <button 
                          type="button"
                          onClick={() => togglePreset(preset.id)}
                          className="absolute inset-0 z-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Egna Sökord</label>
                    <input value={customKeywordsInput} onChange={e => setCustomKeywordsInput(e.target.value)} className="input-field" />
                  </div>
                </div>
              </div>

              <div className="mt-12 p-6 bg-secondary border border-color rounded-2xl">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">Aktiv Query (Google Alerts)</p>
                    <code className="text-[10px] text-accent-primary font-mono break-all">{googleQuery}</code>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-primary border border-color rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:text-primary transition-all">
                      Testa Live ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* News Section */}
            <div className="card border-color shadow-sm overflow-hidden">
              <div className="p-6 border-b border-color bg-secondary bg-opacity-30 flex justify-between items-center">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted flex items-center gap-2">
                  <span>📰</span> Insamlade Signaler ({fetchedArticles.length})
                </h3>
                <div className="flex items-center gap-4 text-[10px] font-bold">
                  <span className="text-green-500">RELEVANT: {relevantCount}</span>
                  <span className="text-muted">FILTERED: {filteredOutCount}</span>
                </div>
              </div>
              
              <div className="divide-y divide-color">
                {fetchedArticles.length === 0 ? (
                  <div className="p-12 text-center text-muted italic text-sm">
                    Inga artiklar har samlats in ännu.
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    {fetchedArticles.map((article) => (
                      <div key={article.id} className="p-6 hover:bg-secondary transition-colors">
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                            article.is_relevant ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {article.is_relevant ? 'RELEVANT-MATCH' : 'FILTERED-OFF'}
                          </span>
                          {article.matched_keyword && (
                            <span className="px-2 py-0.5 bg-accent-soft text-accent-primary rounded text-[8px] font-black uppercase tracking-widest">
                              Signal: {article.matched_keyword}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-muted font-bold">
                            {new Date(article.published_at).toLocaleDateString()}
                          </span>
                        </div>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-primary hover:text-accent-primary leading-snug block mb-2 transition-colors">
                          {article.title}
                        </a>
                        <p className="text-xs text-muted font-medium italic">Källa: {article.source || 'Okänd'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
