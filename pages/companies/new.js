import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function NewCompany({ session }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [keywords, setKeywords] = useState('') // comma separated list
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!session) {
    router.push('/')
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.from('companies').insert({
        name,
        industry: industry || null,
        website: website || null,
        news_keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      })
      if (error) throw error
      router.push('/companies')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
            <label className="block font-medium mb-1">News Keywords (comma separated)</label>
            <input
              type="text"
              placeholder="e.g. layoff,order,acquisition"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              className="input-field"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Saving...' : 'Create Company'}
          </button>
        </form>
      </main>
    </div>
  )
}