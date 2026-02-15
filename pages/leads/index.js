import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function Leads({ session }) {
  const router = useRouter()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchLeads()
  }, [session, router])

  const fetchLeads = async () => {
    try {
      const { data } = await supabase
        .from('weekly_leads')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(20)
      setLeads(data || [])
    } catch (error) {
      console.error('Error loading leads', error)
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
        {leads.length === 0 ? (
          <p className="text-center text-gray-500">No leads generated yet.</p>
        ) : (
          <ul className="space-y-4">
            {leads.map(lead => (
              <li key={lead.id} className="card">
                <h2 className="text-lg font-semibold mb-2">{lead.reason}</h2>
                <p className="text-gray-700 mb-2">{lead.pitch}</p>
                <p className="text-sm text-gray-500">Generated: {new Date(lead.generated_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}