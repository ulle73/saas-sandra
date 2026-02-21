import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV_ITEMS = [
  { label: 'Home', icon: 'dashboard', href: '/dashboard', match: ['/dashboard'] },
  { label: 'People', icon: 'person', href: '/contacts', match: ['/contacts'] },
  { label: 'Firms', icon: 'corporate_fare', href: '/companies', match: ['/companies'] },
  { label: 'Leads', icon: 'auto_awesome', href: '/leads', match: ['/leads'] },
  { label: 'Plan', icon: 'calendar_today', href: '/calendar', match: ['/calendar'] },
]

function isItemActive(pathname, item) {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export default function MobileTabBar() {
  const router = useRouter()

  return (
    <nav className="mobile-tabbar" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => {
        const active = isItemActive(router.pathname, item)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-tabbar-link ${active ? 'is-active' : ''}`}
          >
            <span className="material-symbols-outlined mobile-tabbar-icon">{item.icon}</span>
            <span className="mobile-tabbar-label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
