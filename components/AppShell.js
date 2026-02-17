import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts' },
  { href: '/companies', label: 'Companies', icon: 'companies' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
]

function NavIcon({ kind }) {
  if (kind === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-5 h-5">
        <path d="M3 11.5L12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
      </svg>
    )
  }

  if (kind === 'contacts') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-5 h-5">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 18.5a5.5 5.5 0 0111 0" />
        <path d="M16.5 10.5h4" />
        <path d="M18.5 8.5v4" />
      </svg>
    )
  }

  if (kind === 'companies') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-5 h-5">
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M8 7.5h8M8 11.5h8M8 15.5h4" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-5 h-5">
      <path d="M12 3l2.6 5.2L20 11l-5.4 2.8L12 19l-2.6-5.2L4 11l5.4-2.8L12 3z" />
    </svg>
  )
}

export default function AppShell({ title, session, theme, onToggleTheme, children, actions = null }) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href) => router.pathname === href || router.pathname.startsWith(`${href}/`)

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)] font-[family-name:var(--font-inter)] transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 flex-shrink-0 sticky top-0 h-screen flex flex-col border-r border-[var(--border-subtle)] bg-[var(--nav-bg)] shadow-[var(--shadow-xl)] z-50 transition-all duration-300">
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-[rgba(255,255,255,0.05)]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30">
            L
          </div>
          <span className="hidden lg:block ml-3 font-bold text-lg tracking-tight text-[var(--nav-text-active)]">LOSEN</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group flex items-center px-3 py-2.5 rounded-xl transition-all duration-200
                ${isActive(item.href) 
                  ? 'bg-[var(--nav-item-active)] text-white shadow-md shadow-blue-500/20' 
                  : 'text-[var(--nav-text)] hover:bg-[var(--nav-item-hover)] hover:text-[var(--nav-text-active)]'}
              `}
              title={item.label}
            >
              <span className={`p-1 rounded-lg transition-colors ${isActive(item.href) ? 'bg-white/20' : 'bg-transparent group-hover:bg-white/5'}`}>
                <NavIcon kind={item.icon} />
              </span>
              <span className="hidden lg:block ml-3 font-medium text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
          <button 
            type="button" 
            onClick={onToggleTheme} 
            className="w-full flex items-center justify-center lg:justify-start px-3 py-2.5 rounded-xl text-[var(--nav-text)] hover:bg-[var(--nav-item-hover)] hover:text-[var(--nav-text-active)] transition-all"
          >
            {theme === 'dark' ? (
              <>
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="hidden lg:block ml-3 text-sm">Light Mode</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span className="hidden lg:block ml-3 text-sm">Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Glass Header */}
        <header className="glass-header h-16 sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{title}</h1>
            {session?.user?.email && <p className="text-xs text-[var(--text-tertiary)] hidden sm:block">{session.user.email}</p>}
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <div className="h-8 w-px bg-[var(--border-subtle)] mx-1"></div>
            <button 
                onClick={handleLogout} 
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--danger-subtle)]"
            >
              Sign out
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 p-[2px] cursor-pointer">
               <div className="w-full h-full rounded-full bg-[var(--bg-panel)] flex items-center justify-center text-xs font-bold">
                  {session?.user?.email?.[0].toUpperCase() || 'U'}
               </div>
            </div>
          </div>
        </header>

        {/* content */}
        <main className="p-4 lg:p-8 max-w-7xl mx-auto w-full flex-1">
            {children}
        </main>
      </div>
    </div>
  )
}
