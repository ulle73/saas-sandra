import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

export default function Dashboard({ session }) {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalContacts: 0,
    greenCount: 0,
    yellowCount: 0,
    redCount: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchStats()
  }, [session, router])

  async function fetchStats() {
    try {
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('status')
        .eq('user_id', session.user.id)

      if (error) throw error

      const total = contacts.length
      const green = contacts.filter(c => c.status === 'green').length
      const yellow = contacts.filter(c => c.status === 'yellow').length
      const red = contacts.filter(c => c.status === 'red').length

      setStats({ totalContacts: total, greenCount: green, yellowCount: yellow, redCount: red })
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">📊 Lösen Dashboard</h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">{session.user.email}</span>
            <button onClick={handleSignOut} className="btn-secondary text-sm">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <h3 className="text-gray-500 text-sm uppercase">Total Contacts</h3>
            <p className="text-4xl font-bold mt-2">{loading ? '...' : stats.totalContacts}</p>
          </div>
          <div className="card border-l-4 border-green-500">
            <h3 className="text-green-600 text-sm uppercase">🟢 Active</h3>
            <p className="text-4xl font-bold mt-2 text-green-600">
              {loading ? '...' : stats.greenCount}
            </p>
          </div>
          <div className="card border-l-4 border-yellow-500">
            <h3 className="text-yellow-600 text-sm uppercase">🟡 Recent</h3>
            <p className="text-4xl font-bold mt-2 text-yellow-600">
              {loading ? '...' : stats.yellowCount}
            </p>
          </div>
          <div className="card border-l-4 border-red-500">
            <h3 className="text-red-600 text-sm uppercase">🔴 Needs Attention</h3>
            <p className="text-4xl font-bold mt-2 text-red-600">
              {loading ? '...' : stats.redCount}
            </p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/contacts" className="card hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-xl font-semibold mb-2">👥 Contacts</h3>
            <p className="text-gray-600">Manage all your contacts with color‑coded status.</p>
          </Link>
          <Link href="/companies" className="card hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-xl font-semibold mb-2">🏢 Companies</h3>
            <p className="text-gray-600">Track companies and get news alerts.</p>
          </Link>
          <Link href="/leads" className="card hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-xl font-semibold mb-2">🤖 AI Leads</h3>
            <p className="text-gray-600">Weekly AI‑generated outreach suggestions.</p>
          </Link>
        </div>
      </main>
    </div>
  )
}