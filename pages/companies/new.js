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
      <div className="page-narrow ux-page-stack ux-fade-in">
        <section className="card page-form form-hero">
          <p className="form-hero-kicker">Companies</p>
          <h1 className="form-hero-title">Create Company</h1>
          <p className="form-hero-copy">Set up company profile and keyword monitoring so relevant news lands in the right account.</p>
        </section>

        <form onSubmit={handleSubmit} className="card page-form page-stack">
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

          <div className="panel-soft panel-pad">
            <p className="section-title section-title-gap">Keyword Presets</p>
            <div className="stack-sm">
              {Object.values(KEYWORD_PRESETS).map((preset) => (
                <label key={preset.id} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={selectedPresetIds.includes(preset.id)}
                    onChange={() => togglePreset(preset.id)}
                  />
                  <span>
                    <span className="copy-strong">{preset.label}</span>
                    <span className="small-copy muted force-block">{preset.keywords.join(', ')}</span>
                  </span>
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

          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Saving...' : 'Create Company'}
          </button>
        </form>
      </div>
  )
}
