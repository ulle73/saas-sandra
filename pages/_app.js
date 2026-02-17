import '../styles/globals.css'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function MyApp({ Component, pageProps }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('dark')

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

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('app-theme')
      if (storedTheme === 'light') {
        setTheme('light')
      } else {
        // Default to dark for premium look, even if no storage or system preference
        setTheme('dark')
      }
    } catch {
      setTheme('dark')
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('app-theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  if (loading) {
    return <div className="screen-center">
      <div className="loading-copy">Loading...</div>
    </div>
  }

  return <Component {...pageProps} session={session} theme={theme} toggleTheme={toggleTheme} />
}

export default MyApp
