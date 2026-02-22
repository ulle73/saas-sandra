import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV_ITEMS = [
  { label: 'Overview', icon: 'dashboard', href: '/dashboard', match: ['/dashboard'] },
  { label: 'Contacts', icon: 'person', href: '/contacts', match: ['/contacts'] },
  { label: 'Companies', icon: 'corporate_fare', href: '/companies', match: ['/companies'] },
  { label: 'AI Leads', icon: 'auto_awesome', href: '/leads', match: ['/leads'], badge: 'New' },
  { label: 'Calendar', icon: 'calendar_today', href: '/calendar', match: ['/calendar'] },
  { label: 'AI Profile', icon: 'tune', href: '/settings/ai-profile', match: ['/settings/ai-profile'] },
]

function isItemActive(pathname, item) {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export default function Sidebar() {
  const router = useRouter()

  return (
    <aside className="shell-sidebar" aria-label="Primary navigation">
      <div className="shell-sidebar-brand">
        <div className="shell-sidebar-brand-mark">
          <span className="material-symbols-outlined">rocket_launch</span>
        </div>
        <div className="shell-sidebar-brand-copy">
          <h1 className="shell-sidebar-title">Induction</h1>
          <p className="shell-sidebar-subtitle">Workspace</p>
        </div>
      </div>

      <nav className="shell-sidebar-nav">
        <p className="shell-sidebar-nav-caption">Core Modules</p>
        {NAV_ITEMS.map((item, index) => {
          const isActive = isItemActive(router.pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shell-sidebar-link ${isActive ? 'is-active' : ''}`}
              style={{ '--ux-index': index }}
            >
              <span className="shell-sidebar-link-icon material-symbols-outlined">{item.icon}</span>
              <span className="shell-sidebar-link-label">{item.label}</span>
              {item.badge ? <span className="shell-sidebar-link-badge">{item.badge}</span> : null}
            </Link>
          )
        })}
      </nav>

      <div className="shell-sidebar-footer">
        <p className="shell-sidebar-footer-label">Workspace Health</p>
        <div className="shell-sidebar-meter">
          <div className="shell-sidebar-meter-fill" style={{ width: '72%' }}></div>
        </div>
        <p className="shell-sidebar-footer-copy">72% active pipeline coverage</p>
        <div className="shell-sidebar-footer-chip">
          <span className="material-symbols-outlined">verified</span>
          <span>System operational</span>
        </div>
      </div>
    </aside>
  )
}
