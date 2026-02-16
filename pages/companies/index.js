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
    if (!confirm('Radera detta företag? Alla kontakter kommer att förlora sin koppling.')) return
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
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-medium">Laddar målbolag...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mb-2">Portfolio Intelligence</p>
          <h1 className="text-5xl font-black text-primary tracking-tight">Företag</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/companies/new">
            <button className="btn-primary py-2.5 px-6 text-xs font-black">
              + NYTT FÖRETAG
            </button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Grid View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <div key={c.id} className="card group hover:border-muted transition-all relative">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-xl bg-secondary border border-color flex items-center justify-center text-xl font-bold text-primary group-hover:border-muted transition-colors">
                  {c.name[0]}
                </div>
                <div className="flex gap-2">
                  <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                    <button className="p-2 border border-color rounded-lg hover:bg-card text-muted hover:text-accent-primary transition-colors" title="Signalspaning">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </button>
                  </a>
                  <Link href={`/companies/${c.id}`}>
                    <button className="p-2 border border-color rounded-lg hover:bg-card text-muted hover:text-primary transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  </Link>
                  <button 
                    onClick={() => deleteCompany(c.id)}
                    className="p-2 border border-color rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-primary truncate">{c.name}</h3>
                <p className="text-xs text-muted font-bold uppercase tracking-widest">{c.industry || 'Bransch ej definierad'}</p>
              </div>

              <div className="mt-8 pt-6 border-t border-color flex items-center justify-between">
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-accent-primary hover:text-primary transition-colors tracking-widest uppercase flex items-center gap-1">
                    {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                    </svg>
                  </a>
                ) : (
                  <span className="text-[10px] text-muted font-bold uppercase tracking-widest">Ingen webbplats</span>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-status-green shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span>
                  <span className="text-[10px] text-secondary font-bold uppercase tracking-widest">Bevakas</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {companies.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center card border-dashed">
          <span className="text-5xl mb-6 grayscale opacity-50">🏢</span>
          <p className="text-primary font-black text-xl mb-2">Inga företag bevakas</p>
          <p className="text-muted text-sm max-w-xs">Börja med att lägga till ditt första målbolag för att starta signalspaningen.</p>
          <Link href="/companies/new">
            <button className="mt-8 btn-primary px-8 py-3 text-xs font-black">LÄGG TILL FÖRETAG</button>
          </Link>
        </div>
      )}
    </div>
  )
}
