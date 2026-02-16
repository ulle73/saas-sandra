import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import {
  buildKeywordsFromPresets,
  buildGoogleAlertsQuery,
  buildGoogleNewsTestUrl,
} from '../../lib/newsKeywords'

export default function Companies({ session }) {
  const router = useRouter()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchCompanies()
  }, [session, router])

  const fetchCompanies = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', session.user.id)
      .order('name')

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setCompanies(data || [])
    }
    setLoading(false)
  }

  const deleteCompany = async (id) => {
    if (!confirm('Delete this company? All contacts will lose link.')) return
    const { error: deleteError } = await supabase
      .from('companies')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    fetchCompanies()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🏢 Companies</h1>
          <Link href="/companies/new" className="btn-primary">+ New Company</Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto py-6">
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <table className="min-w-full bg-white shadow rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Industry</th>
              <th className="px-4 py-2 text-left">Website</th>
              <th className="px-4 py-2 text-left">Google News Test</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => {
              const keywords = buildKeywordsFromPresets(
                c.news_keyword_ids,
                c.news_custom_keywords,
                10,
                c.news_keywords || []
              )
              const query = buildGoogleAlertsQuery(c.name, keywords)
              const googleUrl = buildGoogleNewsTestUrl(query)

              return (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.industry || '-'}</td>
                  <td className="px-4 py-2"><a href={c.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c.website}</a></td>
                  <td className="px-4 py-2">
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      Test query
                    </a>
                  </td>
                  <td className="px-4 py-2 space-x-2">
                  <Link href={`/companies/${c.id}`} className="text-blue-600 hover:underline">Edit</Link>
                  <button onClick={() => deleteCompany(c.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {companies.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No companies added yet.</p>
        )}
      </main>
    </div>
  )
}
