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
    <div className="auth-page">
        {/* Background blobs for visual interest */}
        <div className="auth-blob auth-blob-left"></div>
        <div className="auth-blob auth-blob-right"></div>

        <div className="auth-card-wrap">
            <div className="auth-theme-row">
            <button 
                type="button" 
                onClick={toggleTheme} 
                className="btn btn-secondary auth-theme-toggle"
            >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            </div>

            <div className="glass-panel auth-card">
                <div className="auth-card-head">
                    <div className="auth-logo">
                        L
                    </div>
                    <h1 className="auth-title">Losen</h1>
                    <p className="auth-subtitle">Sales Intelligence Platform</p>
                </div>

                <form onSubmit={handleAuth} className="auth-form">
                    <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field"
                        placeholder="you@company.com"
                        required
                    />
                    </div>

                    <div className="auth-field">
                    <label className="auth-label">Password</label>
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
                    <div className="auth-error">
                        {error}
                    </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary auth-submit"
                    >
                        {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="auth-switch-row">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="auth-switch-button"
                    >
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    </div>
  )
}
