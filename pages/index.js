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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-app)] transition-colors duration-300 relative overflow-hidden">
        {/* Background blobs for visual interest */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"></div>

        <div className="w-full max-w-md relative z-10">
            <div className="flex justify-end mb-6">
            <button 
                type="button" 
                onClick={toggleTheme} 
                className="btn btn-secondary text-sm backdrop-blur-md bg-white/50 dark:bg-slate-900/50"
            >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            </div>

            <div className="glass-panel p-8 shadow-2xl border-t border-white/50 dark:border-white/10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-blue-500/30 mb-4">
                        L
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2 font-outfit">Losen</h1>
                    <p className="text-[var(--text-secondary)]">Sales Intelligence Platform</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-6">
                    <div>
                    <label className="block text-sm font-medium mb-1.5 ml-1 text-[var(--text-secondary)]">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field"
                        placeholder="you@company.com"
                        required
                    />
                    </div>

                    <div>
                    <label className="block text-sm font-medium mb-1.5 ml-1 text-[var(--text-secondary)]">Password</label>
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
                    <div className="p-3 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger)]/20 text-[var(--danger)] text-sm">
                        {error}
                    </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-blue-500/20"
                    >
                        {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium transition-colors"
                    >
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    </div>
  )
}
