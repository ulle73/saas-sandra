import Head from 'next/head'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileTabBar from './MobileTabBar'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function AppShell({ children, session, theme, toggleTheme, title }) {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className={`app-shell-root min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <Head>
        <title>{title ? `${title} | CRM Admin` : 'CRM Admin'}</title>
      </Head>

      <div className="app-shell-layout">
        <Sidebar />

        <main className="app-shell-main">
          <Header
            user={session?.user} 
            theme={theme} 
            onToggleTheme={toggleTheme}
            onSignOut={handleSignOut}
          />

          <section key={router.pathname} className="app-shell-content ux-fade-in">
            <div className="app-shell-content-inner ux-section-stagger">
              {children}
            </div>
          </section>

          <MobileTabBar />
        </main>
      </div>
    </div>
  )
}
