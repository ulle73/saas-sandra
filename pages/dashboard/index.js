import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import { computeContactStatus } from '../../lib/contactStatus'

export default function Dashboard({ session }) {
  const router = useRouter()
  const [stats, setStats] = useState({ green: 0, yellow: 0, red: 0, total: 0 })
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }
    fetchStats()
  }, [session, router])

  const fetchStats = async () => {
    try {
      // Get contact counts by status
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('last_touchpoint, next_activity')
        .eq('user_id', session.user.id)

      if (contactsError) throw contactsError

      const counts = { green: 0, yellow: 0, red: 0, total: contacts?.length || 0 }
      contacts?.forEach(c => {
        const status = computeContactStatus(c)
        counts[status] += 1
      })
      setStats(counts)

      // Get recent activities
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, type, timestamp, contacts(name)')
        .eq('user_id', session.user.id)
        .order('timestamp', { ascending: false })
        .limit(5)

      if (activitiesError) throw activitiesError

      setRecentActivity(activities || [])
    } catch (error) {
      console.error('Error fetching stats:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">🔐 Lösen</h1>
              <div className="ml-8 flex space-x-4">
                <Link href="/dashboard" className="text-blue-600 font-medium">Dashboard</Link>
                <Link href="/contacts" className="text-gray-600 hover:text-gray-900">Contacts</Link>
                <Link href="/companies" className="text-gray-600 hover:text-gray-900">Companies</Link>
                <Link href="/leads" className="text-gray-600 hover:text-gray-900">AI Leads</Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-4">{session?.user?.email}</span>
              <button onClick={handleLogout} className="btn-secondary text-sm">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Dashboard</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card text-center">
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-gray-500">Total Contacts</div>
          </div>
          <div className="card text-center border-l-4 border-green-500">
            <div className="text-3xl font-bold text-green-600">{stats.green}</div>
            <div className="text-gray-500">🟢 Active (scheduled)</div>
          </div>
          <div className="card text-center border-l-4 border-yellow-500">
            <div className="text-3xl font-bold text-yellow-600">{stats.yellow}</div>
            <div className="text-gray-500">🟡 Recent touch</div>
          </div>
          <div className="card text-center border-l-4 border-red-500">
            <div className="text-3xl font-bold text-red-600">{stats.red}</div>
            <div className="text-gray-500">🔴 Needs attention</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">🚀 Quick Actions</h3>
            <div className="space-y-3">
              <Link href="/contacts/new" className="block p-3 bg-blue-50 rounded hover:bg-blue-600">
                + Add New Contact
              </Link>
              <Link href="/companies/new" className="block p-3 bg-green-50 rounded hover:bg-green-500">
                + Add New Company
              </Link>
              <Link href="/leads" className="block p-3 bg-purple-50 rounded hover:bg-purple-100">
                🤖 Generate Weekly Leads
              </Link>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">📅 Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-gray-500">No recent activity</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map(activity => (
                  <li key={activity.id} className="flex items-start space-x-3">
                    <span className="text-2xl">
                      {activity.type === 'meeting' ? '📅' : activity.type === 'call' ? '📞' : '✉️'}
                    </span>
                    <div>
                      <p className="font-medium">{activity.contacts?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">
                        {activity.type} - {new Date(activity.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Status Legend */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">📋 Status Legend</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-green-100 rounded-lg border-l-4 border-green-500">
              <p className="font-semibold">🟢 Active</p>
              <p className="text-sm text-gray-600">Activity scheduled in the future</p>
            </div>
            <div className="p-4 bg-yellow-100 rounded-lg border-l-4 border-yellow-500">
              <p className="font-semibold">🟡 Recent</p>
              <p className="text-sm text-gray-600">Contacted within 4 weeks, no follow-up scheduled</p>
            </div>
            <div className="p-4 bg-red-100 rounded-lg border-l-4 border-red-500">
              <p className="font-semibold">🔴 Needs Attention</p>
              <p className="text-sm text-gray-600">No contact for more than 4 weeks</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
