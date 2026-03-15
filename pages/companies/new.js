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
    <div className="page-wide page-stack ux-section-stagger">
      <section className="glass-panel text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Companies</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Create Company</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Set up company profile and keyword monitoring so relevant news lands in the right account.</p>
      </section>

      <form onSubmit={handleSubmit} className="glass-panel space-y-6">
          {error && <p className="form-error">{error}</p>}
          <div className="split-2">
            <div>
              <label className="form-label">Company Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="form-label">Industry (optional)</label>
              <input
                type="text"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Website URL</label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="input-field"
              placeholder="https://example.com"
            />
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
                      {selectedPresetIds.includes(preset.id) && <span className="material-symbols-outlined text-[12px] text-white font-black">check</span>}
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
              type="text"
              placeholder="t.ex. upphandling, expansion, kundcase"
              value={customKeywordsInput}
              onChange={e => setCustomKeywordsInput(e.target.value)}
              className="input-field"
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

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Saving...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
  )
}
