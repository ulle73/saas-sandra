import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutDashboard, Users, Building2, Sparkles, Calendar, SlidersHorizontal, Rocket, CheckCircle } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, href: '/dashboard', match: ['/dashboard'] },
  { label: 'Contacts', icon: Users, href: '/contacts', match: ['/contacts'] },
  { label: 'Companies', icon: Building2, href: '/companies', match: ['/companies'] },
  { label: 'AI Leads', icon: Sparkles, href: '/leads', match: ['/leads'], badge: 'New' },
  { label: 'Calendar', icon: Calendar, href: '/calendar', match: ['/calendar'] },
  { label: 'AI Profile', icon: SlidersHorizontal, href: '/settings/ai-profile', match: ['/settings/ai-profile'] },
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
          <Rocket size={20} strokeWidth={2.5} />
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
              <span className="shell-sidebar-link-icon"><item.icon size={18} strokeWidth={isActive ? 2.5 : 2} /></span>
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
          <CheckCircle size={14} strokeWidth={2.5} />
          <span>System operational</span>
        </div>
      </div>
    </aside>
  )
}
