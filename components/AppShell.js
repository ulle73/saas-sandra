import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/contacts', label: 'Kontakter' },
  { href: '/companies', label: 'Bolag' },
  { href: '/leads', label: 'AI Leads' },
]

function isActivePath(currentPath, href) {
  if (href === '/dashboard') return currentPath === '/dashboard'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export default function AppShell({
  children,
  theme,
  toggleTheme,
  rightActions = null,
  mainClassName = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8',
}) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-secondary text-primary transition-colors duration-200">
      <nav className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-6">
              <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
                <span className="text-2xl">🔐</span>
                <span className="text-xl font-black tracking-tight text-primary">Lösen</span>
              </Link>

              <div className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isActivePath(router.pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                        active
                          ? 'bg-accent-soft text-accent-primary'
                          : 'text-secondary hover:text-primary hover:bg-secondary'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="btn-secondary px-3 py-2 text-sm"
                title="Växla tema"
                aria-label="Växla tema"
              >
                {theme === 'light' ? 'Mörkt' : 'Ljust'}
              </button>
              {rightActions}
            </div>
          </div>

          <div className="md:hidden pb-3 flex items-center gap-2 overflow-x-auto custom-scrollbar">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(router.pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-accent-soft text-accent-primary'
                      : 'text-secondary hover:text-primary hover:bg-secondary'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <main className={mainClassName}>{children}</main>
    </div>
  )
}
