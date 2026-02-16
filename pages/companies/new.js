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

export default function NewCompany({ session }) {
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🏢 New Company</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto py-8">
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && <p className="text-red-600">{error}</p>}
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
          <div>
            <label className="block font-medium mb-1">Website URL</label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="input-field"
            />
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
              type="text"
              placeholder="t.ex. upphandling, expansion, kundcase"
              value={customKeywordsInput}
              onChange={e => setCustomKeywordsInput(e.target.value)}
              className="input-field"
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
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Saving...' : 'Create Company'}
          </button>
        </form>
      </main>
    </div>
  )
}
