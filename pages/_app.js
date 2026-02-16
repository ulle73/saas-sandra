import '../styles/globals.css'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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

    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme)
    document.documentElement.classList.toggle('dark', savedTheme === 'dark')

    return () => subscription.unsubscribe()
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-xl dark:text-gray-100">Loading...</div>
    </div>
  }

  return (
    <div className={theme}>
      <Component {...pageProps} session={session} theme={theme} toggleTheme={toggleTheme} />
    </div>
  )
}

export default MyApp