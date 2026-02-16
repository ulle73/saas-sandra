import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function Leads({ session }) {
  const router = useRouter()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchLeads()
  }, [session, router])

  const fetchLeads = async () => {
    try {
      setError('')
      const { data, error: fetchError } = await supabase
        .from('weekly_leads')
        .select('*')
        .eq('user_id', session.user.id)
        .order('generated_at', { ascending: false })
        .limit(50)

      if (fetchError) throw fetchError

      const rows = data || []
      const discoveryLeads = rows.filter((lead) => (
        lead.is_new_prospect === true
        || Boolean(lead.prospect_company)
        || Boolean(lead.source_url)
      ))
      setLeads(discoveryLeads)
    } catch (error) {
      console.error('Error loading leads', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🤖 Weekly AI Leads</h1>
          <button onClick={() => router.back()} className="btn-secondary">Back</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8">
        {error && <p className="text-red-600 mb-4">{error}</p>}
        {leads.length === 0 ? (
          <p className="text-center text-gray-500">No leads generated yet.</p>
        ) : (
          <ul className="space-y-4">
            {leads.map(lead => (
              <li key={lead.id} className="card">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {lead.prospect_company || 'Prospect'}
                    </h2>
                    {lead.prospect_person && (
                      <p className="text-sm text-gray-600">Kontaktroll: {lead.prospect_person}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {lead.is_new_prospect ? (
                      <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-700">Ny potentiell kund</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700">Befintlig kontakt</span>
                    )}
                    {typeof lead.score === 'number' && <p className="mt-1">Score: {lead.score}/100</p>}
                  </div>
                </div>
                <p className="text-gray-800 font-medium mb-1">{lead.reason}</p>
                <p className="text-gray-700 mb-2">{lead.pitch}</p>
                {lead.source_signal && (
                  <p className="text-sm text-gray-600 mb-1">Signal: {lead.source_signal}</p>
                )}
                {lead.source_url && (
                  <p className="text-sm mb-2">
                    <a
                      href={lead.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Källa: {lead.source_title || lead.source_url}
                    </a>
                  </p>
                )}
                <p className="text-sm text-gray-500">Generated: {new Date(lead.generated_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
