import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts' },
  { href: '/companies', label: 'Companies', icon: 'companies' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
]

function NavIcon({ kind, isActive }) {
  const iconClass = `nav-icon-svg ${isActive ? 'is-active' : ''}`

  const icon = () => {
    if (kind === 'dashboard') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    }
    if (kind === 'contacts') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    }
    if (kind === 'companies') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    )
  }

  return (
    <div className={`nav-icon ${isActive ? 'is-active' : ''}`}>
      {icon()}
    </div>
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
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="glass-panel shell-brand">
          <div className="shell-logo">
            L
          </div>
          <div>
            <span className="shell-logo-title">LOSEN</span>
            <span className="shell-logo-subtitle">Intelligence</span>
          </div>
        </div>

        <nav className="glass-panel shell-nav">
          <div className="shell-nav-caption">
            Main Menu
          </div>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shell-nav-link ${active ? 'is-active' : ''}`}
              >
                {active && (
                  <span className="shell-nav-indicator" />
                )}
                <span className={`shell-nav-icon-wrap ${active ? 'is-active' : ''}`}>
                  <NavIcon kind={item.icon} isActive={active} />
                </span>
                <span className="shell-nav-label">
                  {item.label}
                </span>
              </Link>
            )
          })}

          <div className="shell-nav-footer">
             <div className="shell-nav-caption shell-nav-caption-footer">
              Settings
            </div>
            <button 
              type="button" 
              onClick={onToggleTheme} 
              className="shell-theme-toggle"
            >
              <span className="shell-theme-icon-wrap">
                {theme === 'dark' ? (
                  <svg className="shell-theme-icon sun" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="shell-theme-icon moon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </span>
              <span className="shell-theme-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="app-main">
        <header className="glass-header mobile-header">
          <div className="mobile-brand">
            <div className="mobile-logo">L</div>
            <span className="mobile-title">LOSEN</span>
          </div>
          <button className="mobile-menu-button" type="button" aria-label="Open navigation menu">
            <svg className="mobile-menu-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <header className="desktop-header">
           <div className="desktop-title-wrap">
             <h1 className="desktop-page-title">
               {title}
             </h1>
             <div className="desktop-breadcrumb">
               <span>Losen AI</span>
               <span>/</span>
               <span className="desktop-breadcrumb-current">{title}</span>
             </div>
           </div>

           <div className="desktop-header-actions">
              {actions && (
                <div className="glass-panel desktop-actions-wrap">
                  {actions}
                </div>
              )}

              <div className="desktop-divider" />

              <div className="glass-panel user-pill">
                <div className="user-pill-text">
                  <p className="user-pill-name">{session?.user?.email?.split('@')[0]}</p>
                  <p className="user-pill-role">Admin</p>
                </div>
                <div className="user-pill-avatar">
                   <div className="user-pill-avatar-inner">
                      {session?.user?.email?.[0].toUpperCase() || 'U'}
                   </div>
                </div>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="logout-button"
                  title="Sign out"
                >
                  <svg className="logout-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
           </div>
        </header>

        <main className="app-content">
           <div className="app-content-inner animate-fade-in">
              {children}
           </div>
        </main>
      </div>
    </div>
  )
}
