import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import {
  KEYWORD_PRESETS,
  parseCustomKeywords,
  buildKeywordsFromPresets,
  buildGoogleAlertsQuery,
  buildGoogleNewsTestUrl,
} from '../../lib/newsKeywords'

export default function NewCompany({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [selectedPresetIds, setSelectedPresetIds] = useState([])
  const [customKeywordsInput, setCustomKeywordsInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session) {
      router.push('/')
    }
  }, [router, session])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const customKeywords = parseCustomKeywords(customKeywordsInput)
      const mergedKeywords = buildKeywordsFromPresets(selectedPresetIds, customKeywords, 10, [])

      const { error } = await supabase.from('companies').insert({
        user_id: session.user.id,
        name,
        industry: industry || null,
        website: website || null,
        news_keyword_ids: selectedPresetIds,
        news_custom_keywords: customKeywords,
        news_keywords: mergedKeywords,
      })
      if (error) throw error
      router.push('/companies')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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

  if (!session) return null

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
              <button onClick={() => router.back()} className="text-sm font-bold text-secondary hover:text-primary transition-all">Avbryt</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black text-primary tracking-tight">Lägg till företag</h2>
          <p className="text-secondary mt-2">Definiera ditt målbolag och deras bevakningsprofil.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-8 border-color shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-6">Grunduppgifter</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Företagsnamn</label>
                  <input
                    type="text"
                    required
                    placeholder="t.ex. Acme Corp"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Bransch</label>
                    <input
                      type="text"
                      placeholder="t.ex. SaaS / Tech"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Webbplats</label>
                    <input
                      type="url"
                      placeholder="https://www.acme.com"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-8 border-color shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-6">Bevakningsprofil (Keywords)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {Object.values(KEYWORD_PRESETS).map((preset) => (
                  <label 
                    key={preset.id} 
                    className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedPresetIds.includes(preset.id) 
                        ? 'border-accent-primary bg-accent-soft bg-opacity-30' 
                        : 'border-color bg-secondary hover:border-accent-primary hover:border-opacity-30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-primary">{preset.label}</span>
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-accent-primary"
                        checked={selectedPresetIds.includes(preset.id)}
                        onChange={() => togglePreset(preset.id)}
                      />
                    </div>
                    <span className="text-[10px] text-muted leading-tight">{preset.keywords.join(', ')}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">Egna Sökord (kommaseparerade)</label>
                <input
                  type="text"
                  placeholder="t.ex. expansion, rekrytering, nyemission"
                  value={customKeywordsInput}
                  onChange={e => setCustomKeywordsInput(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6 border-color bg-accent-soft bg-opacity-20 flex flex-col h-full sticky top-24 border-dashed border-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-accent-primary mb-4 flex items-center gap-2">
                <span>🔍</span> Preview: Signal-Sök
              </h3>
              
              <div className="space-y-4 flex-grow">
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-tight mb-1">Valda sökord</p>
                  <div className="flex flex-wrap gap-1">
                    {previewKeywords.length ? previewKeywords.map(k => (
                      <span key={k} className="px-2 py-0.5 bg-primary border border-color rounded text-[10px] font-medium text-secondary">{k}</span>
                    )) : <span className="text-[10px] italic text-muted">Inga sökord valda</span>}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-tight mb-1">Google Alerts Query</p>
                  <div className="p-3 bg-primary border border-color rounded text-[10px] text-primary font-mono break-all leading-relaxed">
                    {googleQuery || <span className="italic opacity-50">Väntar på företagsnamn...</span>}
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="block w-full p-2 text-center text-[10px] font-bold uppercase bg-secondary text-secondary border border-color rounded hover:bg-primary transition-all">
                  Testa i Google News
                </a>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary w-full py-3 text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-accent-soft transition-all"
                >
                  {loading ? 'Sparar...' : 'Spara Företag'}
                </button>
              </div>
              {error && <p className="mt-4 text-[10px] text-red-600 font-bold">{error}</p>}
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
