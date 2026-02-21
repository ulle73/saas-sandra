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
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
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

      <style jsx global>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          vertical-align: middle;
        }
      `}</style>
    </div>
  )
}
