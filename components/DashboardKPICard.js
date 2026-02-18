export default function DashboardKPICard({ title, value, icon, trend, trendValue, color = 'primary' }) {
  const colorMap = {
    primary: 'bg-blue-50 text-primary',
    success: 'bg-emerald-50 text-emerald-500',
    warning: 'bg-orange-50 text-orange-500',
    danger: 'bg-red-50 text-red-500',
    indigo: 'bg-indigo-50 text-indigo-500'
  }

  const trendColorMap = {
    up: 'text-emerald-500',
    down: 'text-red-500',
    neutral: 'text-slate-400'
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-5">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.primary}`}>
        <span className="material-symbols-outlined text-3xl">{icon}</span>
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
          {(trend || trendValue) && (
            <span className={`${trendColorMap[trend] || 'text-slate-400'} text-xs font-bold flex items-center`}>
              {trend === 'up' && <span className="material-symbols-outlined text-sm">trending_up</span>}
              {trend === 'down' && <span className="material-symbols-outlined text-sm">trending_down</span>}
              {trendValue}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
