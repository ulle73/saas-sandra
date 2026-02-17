import { useEffect, useState } from 'react'
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
    <AppShell
      title="New Company"
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<button type="button" onClick={() => router.push('/companies')} className="btn-secondary">Back</button>}
    >
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit} className="card p-6 page-stack">
          {error && <p className="text-red-600">{error}</p>}
          <div className="split-2">
            <div>
              <label className="block font-medium mb-1">Company Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Industry (optional)</label>
              <input
                type="text"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Website URL</label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="input-field"
              placeholder="https://example.com"
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
              type="text"
              placeholder="t.ex. upphandling, expansion, kundcase"
              value={customKeywordsInput}
              onChange={e => setCustomKeywordsInput(e.target.value)}
              className="input-field"
            />
          </div>

          <details className="disclosure" open>
            <summary>Preview Query</summary>
            <div className="disclosure-content space-y-2">
              <p className="text-sm"><strong>Keywords:</strong> {previewKeywords.length ? previewKeywords.join(', ') : 'No keywords selected'}</p>
              <p className="text-sm break-all"><strong>Google query:</strong> {googleQuery}</p>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-link text-sm">
                Test in Google News
              </a>
            </div>
          </details>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Saving...' : 'Create Company'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
