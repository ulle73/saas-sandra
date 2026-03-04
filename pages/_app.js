import '../styles/globals.css'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'
import AppShell from '../components/AppShell'

const AUTH_BOOT_TIMEOUT_MS = 8000

const SHELL_TITLES = {
  '/dashboard': 'Overview',
  '/contacts': 'Contacts',
  '/contacts/new': 'New Contact',
  '/contacts/[id]': 'Contact',
  '/contacts/edit/[id]': 'Edit Contact',
  '/companies': 'Companies',
  '/companies/new': 'New Company',
  '/companies/[id]': 'Edit Company',
  '/leads': 'AI Leads',
  '/calendar': 'Calendar',
  '/settings/ai-profile': 'AI Profile',
}

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    let isMounted = true

    const getSessionWithTimeout = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Auth init timed out after ${AUTH_BOOT_TIMEOUT_MS}ms`))
      }, AUTH_BOOT_TIMEOUT_MS)

      supabase.auth.getSession()
        .then((result) => {
          clearTimeout(timeout)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })
    })

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await getSessionWithTimeout()
        if (isMounted) setSession(session)
      } catch (error) {
        console.error('Failed to initialize Supabase auth session:', error)
        if (isMounted) setSession(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setSession(session)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
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

  const page = <Component {...pageProps} session={session} theme={theme} toggleTheme={toggleTheme} />
  const usesShell = router.pathname !== '/' && Boolean(session)

  if (!usesShell) return page

  return (
    <AppShell
      session={session}
      theme={theme}
      toggleTheme={toggleTheme}
      title={SHELL_TITLES[router.pathname]}
    >
      {page}
    </AppShell>
  )
}

export default MyApp
