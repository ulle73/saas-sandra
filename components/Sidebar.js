import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Sidebar() {
  const router = useRouter()
  
  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
    { label: 'Contacts', icon: 'person', href: '/contacts' },
    { label: 'Companies', icon: 'corporate_fare', href: '/companies' },
    { label: 'AI Leads', icon: 'auto_awesome', href: '/leads', badge: 'New' },
    { label: 'Calendar', icon: 'calendar_today', href: '/calendar' },
  ]

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden lg:flex">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary rounded-lg p-1.5 leading-none">
          <span className="material-symbols-outlined text-white text-2xl">rocket_launch</span>
        </div>
        <div>
          <h1 className="text-slate-900 font-bold text-lg leading-tight">CRM Admin</h1>
          <p className="text-slate-500 text-xs">Sales Management</p>
        </div>
      </div>
      
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = router.pathname === item.href
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-primary text-white font-medium' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
              {item.badge && (
                <span className="ml-auto bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Storage Usage</p>
          <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
            <div className="bg-primary h-1.5 rounded-full" style={{ width: '65%' }}></div>
          </div>
          <p className="text-xs text-slate-600">6.5GB / 10GB used</p>
        </div>
      </div>
    </aside>
  )
}
