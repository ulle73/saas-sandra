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
    <div className="max-w-6xl mx-auto py-12 px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Portfolio Intelligence</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Ny Bevakning</h1>
        </div>
        <div>
          <button 
            onClick={() => router.back()} 
            className="text-xs font-black text-muted hover:text-primary transition-colors uppercase tracking-widest border-b-2 border-transparent hover:border-primary pb-1"
          >
            Avbryt & Gå tillbaka
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-8">
          {/* Section 1: Basic Info */}
          <div className="card border-color overflow-hidden">
            <div className="h-1 w-full bg-accent-primary opacity-50"></div>
            <div className="p-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-8 pl-1">Grunduppgifter</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-2 ml-1">Företagsnamn (Exakt matchning)</label>
                  <input
                    type="text"
                    required
                    placeholder="t.ex. Acme Corp"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="input-field py-4 text-xl font-black"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-2 ml-1">Bransch / Sektor</label>
                    <input
                      type="text"
                      placeholder="t.ex. SaaS / Tech / Bio-Tech"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      className="input-field py-3 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-2 ml-1">Domän / Webbplats</label>
                    <input
                      type="url"
                      placeholder="https://www.acme.com"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      className="input-field py-3 text-sm font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Keywords */}
          <div className="card border-color p-8">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-8 pl-1">Signalbevakning (Presets)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {Object.values(KEYWORD_PRESETS).map((preset) => (
                <label 
                  key={preset.id} 
                  className={`flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all group ${
                    selectedPresetIds.includes(preset.id) 
                      ? 'border-accent-primary bg-accent-soft/20 ring-1 ring-accent-primary' 
                      : 'border-color bg-secondary hover:border-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-black uppercase tracking-widest text-xs ${selectedPresetIds.includes(preset.id) ? 'text-accent-primary' : 'text-primary'}`}>{preset.label}</span>
                    <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                       selectedPresetIds.includes(preset.id) ? 'bg-accent-primary border-accent-primary' : 'border-color'
                    }`}>
                       {selectedPresetIds.includes(preset.id) && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedPresetIds.includes(preset.id)}
                      onChange={() => togglePreset(preset.id)}
                    />
                  </div>
                  <p className="text-[10px] text-muted leading-tight font-bold uppercase tracking-tighter group-hover:text-secondary">
                    {preset.keywords.join(', ')}
                  </p>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 pl-1">Externa Sökord (Kommaseparerade)</label>
              <input
                type="text"
                placeholder="t.ex. expansion, nyemission, head of sale"
                value={customKeywordsInput}
                onChange={e => setCustomKeywordsInput(e.target.value)}
                className="input-field py-3 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Floating Controls */}
        <div className="lg:col-span-4">
          <div className="card border-color bg-gradient-to-b from-card to-secondary sticky top-8 border-2 shadow-2xl overflow-hidden p-0">
            <div className="p-8 space-y-8">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-accent-primary mb-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></span>
                  Signal-Search Preview
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-3">Aktiva Signaler</p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewKeywords.length ? previewKeywords.map(k => (
                        <span key={k} className="px-2 py-1 bg-primary border border-color rounded-md text-[9px] font-black text-secondary uppercase tracking-tighter">{k}</span>
                      )) : <span className="text-[10px] italic text-muted font-bold">Välj en profil för att se signaler...</span>}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-3">Google Alerts Query</p>
                    <div className="p-4 bg-primary border border-color rounded-xl text-[10px] text-primary font-mono break-all leading-relaxed opacity-60">
                      {googleQuery || "Väntar på indata..."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-color">
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="block w-full p-3 text-center text-[10px] font-black uppercase border border-color rounded-xl hover:bg-card hover:text-primary transition-all tracking-widest">
                  Validera i Google News ↗
                </a>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary w-full py-4 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? 'SPARAR...' : 'STARTA BEVAKNING'}
                </button>
              </div>
              {error && <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-widest">{error}</p>}
            </div>
            
            <div className="bg-accent-primary/5 p-6 border-t border-color">
               <p className="text-[10px] text-accent-primary/60 font-bold uppercase tracking-widest leading-relaxed">
                  Systemet kommer att genomsöka sökresultat var 24:e timma efter matchningar mot valda profiler.
               </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
