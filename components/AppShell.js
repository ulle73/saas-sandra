import Head from 'next/head'
import Sidebar from './Sidebar'
import Header from './Header'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function AppShell({ children, session, theme, toggleTheme, title }) {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <Head>
        <title>{title ? `${title} | CRM Admin` : 'CRM Admin'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </Head>

      <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark font-display text-slate-900">
        <Sidebar />
        
        <main className="flex-1 flex flex-col overflow-y-auto">
          <Header 
            user={session?.user} 
            theme={theme} 
            onToggleTheme={toggleTheme} 
          />
          
          <div className="p-8">
            {children}
          </div>
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
