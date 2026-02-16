import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import {
  buildKeywordsFromPresets,
  buildGoogleAlertsQuery,
  buildGoogleNewsTestUrl,
} from '../../lib/newsKeywords'

export default function Companies({ session, theme, toggleTheme }) {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-accent-soft border-t-accent-primary rounded-full animate-spin mb-4"></div>
          <p className="text-secondary font-medium">Laddar företag...</p>
        </div>
      </div>
    )
  }

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
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Dashboard</Link>
                <Link href="/contacts" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">Contacts</Link>
                <Link href="/companies" className="px-3 py-2 rounded-md text-sm font-medium bg-accent-soft text-accent-primary">Companies</Link>
                <Link href="/leads" className="px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-all">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-secondary transition-all text-secondary"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <Link href="/companies/new" className="btn-primary py-1.5 px-4 text-xs">+ Företag</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-primary tracking-tight">Företag</h2>
            <p className="text-secondary mt-1">Hantera dina målbolag och deras nyhetsbevakning.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="card p-0 overflow-hidden border-color">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-color">
              <thead>
                <tr>
                  <th className="table-header w-[30%] font-black text-xs uppercase tracking-wider">Företag</th>
                  <th className="table-header w-[20%] text-xs uppercase tracking-wider">Bransch</th>
                  <th className="table-header w-[20%] text-xs uppercase tracking-wider">Webbplats</th>
                  <th className="table-header w-[15%] text-xs uppercase tracking-wider">Research</th>
                  <th className="table-header w-[15%] text-right pr-6 text-xs uppercase tracking-wider">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="bg-primary divide-y divide-color">
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
                    <tr key={c.id} className="group hover:bg-secondary transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center text-accent-primary font-bold text-xs ring-1 ring-accent-primary ring-opacity-10">
                            {c.name.substring(0, 1)}
                          </div>
                          <span className="font-bold text-primary">{c.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-sm text-secondary font-medium">
                        {c.industry || <span className="text-muted italic">Odefinierad</span>}
                      </td>
                      <td className="table-cell">
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline text-sm font-medium inline-flex items-center gap-1">
                            {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            <span className="text-[10px]">↗</span>
                          </a>
                        ) : '-'}
                      </td>
                      <td className="table-cell">
                        <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="badge badge-yellow inline-flex items-center gap-1 hover:brightness-95 transition-all">
                          <span>🔍</span> Info-Sök
                        </a>
                      </td>
                      <td className="table-cell text-right pr-6">
                        <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                          <Link href={`/companies/${c.id}`} className="p-1 px-3 text-xs font-bold bg-accent-soft text-accent-primary rounded-md hover:bg-accent-primary hover:text-white transition-colors">
                            Edit
                          </Link>
                          <button
                            onClick={() => deleteCompany(c.id)}
                            className="p-1 px-3 text-xs font-bold bg-red-50 text-red-600 rounded-md hover:bg-red-600 hover:text-white transition-colors"
                          >
                            Radera
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {companies.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center">
              <span className="text-5xl mb-4">🏢</span>
              <p className="text-secondary font-bold text-lg">Inga företag inlagda</p>
              <p className="text-muted text-sm mt-1">Börja med att lägga till ditt första målbolag.</p>
              <Link href="/companies/new" className="mt-6 btn-primary px-6">Lägg till företag</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
