import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function EditCompany({ session }) {
  const router = useRouter()
  const { id } = router.query
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [keywords, setKeywords] = useState('')
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
    const { data, error: fetchError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    if (data) {
      setName(data.name)
      setIndustry(data.industry || '')
      setWebsite(data.website || '')
      setKeywords((data.news_keywords || []).join(', '))
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    const updates = {
      name,
      industry: industry || null,
      website: website || null,
      news_keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🏢 Edit Company</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto py-8">
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
            <label className="block font-medium mb-1">News keywords (comma‑separated)</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} className="input-field" placeholder="layoff,order,recruitment" />
          </div>
          <div className="flex justify-between pt-4">
            <button onClick={handleDelete} className="text-red-600 hover:underline">Delete</button>
            <button onClick={handleSave} className="btn-primary">Save</button>
          </div>
        </div>
      </main>
    </div>
  )
}
