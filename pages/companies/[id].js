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
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium italic">Ansluter till Intelligence Core...</p>
      </div>
    )
  }

  const relevantCount = fetchedArticles.filter((article) => article.is_relevant).length

  return (
    <div className="max-w-7xl mx-auto py-12 px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Portfolio Node: {id?.slice(0, 8)}</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">{name}</h1>
        </div>
        <div className="flex items-center gap-4">
           <button 
             onClick={handleDelete} 
             className="text-[10px] font-black text-red-500/50 hover:text-red-500 transition-colors uppercase tracking-widest"
           >
             Deaktivera Nod
           </button>
           <button 
             onClick={handleSave} 
             className="btn-primary px-10 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-accent-primary/20"
           >
             Spara Konfiguration
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Config Panel */}
        <div className="lg:col-span-12">
          <div className="card border-color overflow-hidden bg-gradient-to-br from-card to-secondary/30">
            <div className="h-1.5 w-full bg-accent-primary opacity-80"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-color">
              <div className="p-10 space-y-10">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted"></span> Corporate Identity
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Organisationsnamn</label>
                    <input value={name} onChange={e => setName(e.target.value)} className="input-field py-4 text-xl font-black bg-primary/20" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Sektor / Bransch</label>
                      <input value={industry} onChange={e => setIndustry(e.target.value)} className="input-field py-3 text-sm font-bold bg-primary/20" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Externa System (URL)</label>
                      <input value={website} onChange={e => setWebsite(e.target.value)} className="input-field py-3 text-sm font-bold bg-primary/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-10 space-y-10">
                <h3 className="text-xs font-black uppercase tracking-widest text-accent-primary flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse"></span> Bevakningsprofil
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(KEYWORD_PRESETS).map((preset) => (
                    <button 
                      key={preset.id} 
                      type="button"
                      onClick={() => togglePreset(preset.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                        selectedPresetIds.includes(preset.id) 
                          ? 'border-accent-primary bg-accent-soft/20 text-accent-primary ring-1 ring-accent-primary/20' 
                          : 'border-color bg-primary/20 hover:border-muted text-muted'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">{preset.label}</span>
                      <div className={`w-3 h-3 rounded-full border-2 ${selectedPresetIds.includes(preset.id) ? 'bg-accent-primary border-accent-primary' : 'border-color'}`}></div>
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Anpassade Signaler</label>
                  <input value={customKeywordsInput} onChange={e => setCustomKeywordsInput(e.target.value)} className="input-field py-3 text-sm font-bold bg-primary/20" />
                </div>
              </div>
            </div>
            
            <div className="p-10 bg-black/20 border-t border-color">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-grow max-w-2xl">
                   <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2">System Generated Query</p>
                   <div className="p-4 bg-primary/10 border border-color rounded-xl font-mono text-[10px] text-accent-primary break-all leading-relaxed whitespace-pre-wrap">
                      {googleQuery || "NULL_QUERY_EXCEPTION"}
                   </div>
                </div>
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="btn-primary px-8 py-3 text-[10px] font-black uppercase tracking-widest border border-accent-primary/50 shadow-none hover:bg-accent-primary hover:text-shades-white shrink-0">
                  Manuell Validering ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence Feed */}
        <div className="lg:col-span-12 space-y-6">
           <div className="flex items-center justify-between border-b-2 border-color pb-4 mb-8">
              <h3 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
                 Insamlade Signaler
                 <span className="text-xs font-black text-accent-primary bg-accent-soft px-3 py-1 rounded-full">{fetchedArticles.length} DATA_POINTS</span>
              </h3>
              <div className="flex items-center gap-6">
                 <div className="text-right">
                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">Relevans-kvot</p>
                    <p className="text-xs font-black text-green-500">{(relevantCount / (fetchedArticles.length || 1) * 100).toFixed(0)}% OPTIMAL</p>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fetchedArticles.length === 0 ? (
                <div className="col-span-full py-32 border border-color border-dashed rounded-3xl text-center">
                  <p className="text-muted text-xs font-black uppercase tracking-widest italic opacity-40">Väntar på första signal-träffen...</p>
                </div>
              ) : (
                fetchedArticles.map((article) => (
                  <div key={article.id} className="card border-color hover:border-muted p-6 group transition-all hover:scale-[1.01] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-6">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                          article.is_relevant 
                            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                            : 'bg-muted/10 text-muted border-muted/20'
                        }`}>
                          {article.is_relevant ? 'SIGNAL_MATCH' : 'FILTERED'}
                        </span>
                        <span className="text-[10px] font-black text-muted/50 uppercase tracking-tighter">
                          {new Date(article.published_at).toLocaleDateString('sv-SE')}
                        </span>
                      </div>
                      <a 
                        href={article.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-base font-black text-primary group-hover:text-accent-primary leading-tight transition-colors block mb-4"
                      >
                        {article.title}
                      </a>
                    </div>
                    <div className="pt-4 border-t border-color mt-4 flex items-center justify-between">
                      <span className="text-[9px] font-black text-muted uppercase tracking-widest italic">{article.source || 'N_A'}</span>
                      {article.matched_keyword && (
                        <span className="text-[9px] font-black text-accent-primary uppercase tracking-tighter bg-accent-soft/30 px-2 py-0.5 rounded">
                          REF: {article.matched_keyword}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  )
}
