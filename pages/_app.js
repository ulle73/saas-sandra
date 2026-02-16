import '../styles/globals.css'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

function MyApp({ Component, pageProps }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Load theme from localStorage.
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme)
    document.documentElement.dataset.theme = savedTheme
    document.documentElement.classList.toggle('dark', savedTheme === 'dark')

    return () => subscription.unsubscribe()
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.dataset.theme = newTheme
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-secondary text-primary">
      <div className="text-xl">Loading...</div>
    </div>
  }

  return (
    <Layout theme={theme} toggleTheme={toggleTheme}>
      <Component {...pageProps} session={session} theme={theme} toggleTheme={toggleTheme} />
    </Layout>
  )
}

export default MyApp
