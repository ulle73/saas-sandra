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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-accent-soft/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="absolute top-8 right-8">
        <button 
          onClick={toggleTheme} 
          className="w-10 h-10 rounded-xl bg-card border border-color flex items-center justify-center hover:border-primary transition-all shadow-2xl"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-gradient-to-tr from-accent-primary to-accent-soft shadow-2xl shadow-accent-primary/20 mb-6 text-4xl transform hover:rotate-12 transition-transform cursor-default">
            ⌘
          </div>
          <h1 className="text-6xl font-black text-white tracking-tight italic">SANDRA</h1>
          <p className="text-muted font-black border-y border-white/5 py-3 uppercase tracking-[0.5em] text-[10px]">Strategic Agency Network & Data Resource Agent</p>
        </div>

        <div className="card shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/5 bg-shades-black/40 backdrop-blur-3xl p-10 rounded-[2.5rem] relative overflow-hidden">
           {/* Subtle glow at top */}
           <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-primary to-transparent opacity-50"></div>

          <div className="mb-10">
            <h2 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">
              {isLogin ? 'Authorization' : 'System Registration'}
            </h2>
            <p className="text-muted text-[11px] font-bold uppercase tracking-widest">{isLogin ? 'Enter credentials to access secure layer' : 'Configure new operator profile'}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-muted uppercase tracking-widest ml-1">Account Identifier (Email)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field bg-black/40 py-4 font-bold border-white/10 focus:border-accent-primary"
                placeholder="operator@sandra.io"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-muted uppercase tracking-widest ml-1">Access Token (Password)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field bg-black/40 py-4 font-bold border-white/10 focus:border-accent-primary"
                placeholder="••••••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.3em] shadow-2xl shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span>INITIALIZING...</span>
                </div>
              ) : (
                isLogin ? 'Execute Login' : 'Register Operator'
              )}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-[10px] font-black text-muted hover:text-accent-primary transition-colors uppercase tracking-[0.2em]"
            >
              {isLogin ? "Request new access credentials" : 'Switch to existing authorization flow'}
            </button>
          </div>
        </div>

        <div className="mt-12 text-center space-y-2 opacity-30 group cursor-default">
           <p className="text-[9px] font-black text-muted uppercase tracking-[0.4em] group-hover:text-accent-primary transition-colors">SANDRA INTELLIGENCE CORE v4.0.1</p>
           <p className="text-[8px] font-bold text-muted uppercase tracking-tighter">SECURED BY HIGH-LEVEL ENCRYPTION PROTOCOLS</p>
        </div>
      </div>
    </div>
  )
}
