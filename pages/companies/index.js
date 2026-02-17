import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import AppShell from '../../components/AppShell'
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
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchCompanies()
  }, [session, router])

  const fetchCompanies = async () => {
    setLoading(true)
    setError('')

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

  const filteredCompanies = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return companies
    return companies.filter((company) => {
      return (
        String(company.name || '').toLowerCase().includes(term)
        || String(company.industry || '').toLowerCase().includes(term)
        || String(company.website || '').toLowerCase().includes(term)
      )
    })
  }, [companies, searchTerm])

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <AppShell
      title={`Companies (${filteredCompanies.length})`}
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      actions={<Link href="/companies/new" className="btn-primary">+ New Company</Link>}
    >
      <div className="page-stack">
        <section className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, industry or website..."
            className="input-field md:col-span-2"
          />
          <button type="button" onClick={fetchCompanies} className="btn-secondary">Refresh</button>
        </section>

        {error && <p className="text-red-600">{error}</p>}

        {filteredCompanies.length === 0 ? (
          <p className="card p-6 muted">No companies added yet.</p>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCompanies.map((company) => {
              const keywords = buildKeywordsFromPresets(
                company.news_keyword_ids,
                company.news_custom_keywords,
                10,
                company.news_keywords || []
              )
              const query = buildGoogleAlertsQuery(company.name, keywords)
              const googleUrl = buildGoogleNewsTestUrl(query)

              return (
                <article key={company.id} className="card p-5 page-stack">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{company.name}</h2>
                      <p className="section-meta">{company.industry || 'No industry set'}</p>
                    </div>
                    <span className="badge badge-confidence-medium">
                      Keywords: {keywords.length}
                    </span>
                  </div>

                  <div className="text-sm">
                    <p className="muted mb-1">Website</p>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-link break-all">
                        {company.website}
                      </a>
                    ) : (
                      <p className="muted">Not set</p>
                    )}
                  </div>

                  <details className="disclosure">
                    <summary>Signal Query Tools</summary>
                    <div className="disclosure-content space-y-2">
                      <p className="text-sm break-all"><strong>Query:</strong> {query}</p>
                      <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-link text-sm">
                        Test in Google News
                      </a>
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-2">
                    <Link href={`/companies/${company.id}`} className="btn-secondary">Edit</Link>
                    <button type="button" onClick={() => deleteCompany(company.id)} className="btn-secondary text-red-600">
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </AppShell>
  )
}
