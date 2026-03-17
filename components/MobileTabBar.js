import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutDashboard, Users, Building2, Sparkles, Calendar } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Home', icon: LayoutDashboard, href: '/dashboard', match: ['/dashboard'] },
  { label: 'People', icon: Users, href: '/contacts', match: ['/contacts'] },
  { label: 'Firms', icon: Building2, href: '/companies', match: ['/companies'] },
  { label: 'Leads', icon: Sparkles, href: '/leads', match: ['/leads'] },
  { label: 'Plan', icon: Calendar, href: '/calendar', match: ['/calendar'] },
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
            <item.icon size={22} className="mobile-tabbar-icon" strokeWidth={active ? 2.5 : 2} />
            <span className="mobile-tabbar-label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
