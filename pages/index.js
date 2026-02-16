import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

export default function Home({ session, theme, toggleTheme }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) {
      router.push('/dashboard')
    }
  }, [session, router])

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/dashboard')
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        setError('Check your email for confirmation!')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4 transition-colors duration-200">
      <div className="absolute top-6 right-6">
        <button 
          onClick={toggleTheme} 
          className="p-3 rounded-full hover:bg-primary border border-color transition-all shadow-sm"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-md mb-4 text-3xl">
            🔐
          </div>
          <h1 className="text-3xl font-black text-primary tracking-tight mb-2">Lösen</h1>
          <p className="text-secondary font-medium">Sales Intelligence Platform</p>
        </div>

        <div className="card shadow-2xl border-t-4 border-t-accent-primary p-8">
          <h2 className="text-xl font-bold text-primary mb-6">
            {isLogin ? 'Välkommen tillbaka' : 'Skapa konto'}
          </h2>

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">E-post</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="namn@foretag.se"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900 dark:bg-opacity-20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-3 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Vänta...</span>
                </div>
              ) : (
                isLogin ? 'Logga in' : 'Skapa konto'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-color text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-semibold text-accent-primary hover:text-accent-hover transition-colors"
            >
              {isLogin ? "Inget konto än? Skapa ett här" : 'Har du redan ett konto? Logga in'}
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          &copy; {new Date().getFullYear()} Lösen Intelligence. All rights reserved.
        </p>
      </div>
    </div>
  )
}
