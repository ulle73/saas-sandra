export default function KPICard({ title, value, trend, trendValue, icon, color = 'primary' }) {
  const colorMap = {
    primary: 'primary',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    mint: 'success',
    amber: 'warning',
    coral: 'danger',
  }

  const tone = colorMap[color] || 'primary'

  return (
    <div className={`kpi-card-content kpi-tone-${tone}`}>
      <div className="kpi-card-glow" />
      
      <div>
        <span className="material-symbols-outlined kpi-icon">{icon}</span>
        <p className="kpi-title">{title}</p>
        <p className="kpi-value-hero">{value}</p>
      </div>

      {trend && (
        <div className={`kpi-trend ${trend === 'up' ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
          <span className="material-symbols-outlined kpi-trend-icon">
            {trend === 'up' ? 'trending_up' : 'trending_down'}
          </span>
          <span className="kpi-trend-value">{trendValue}</span>
        </div>
      )}
    </div>
  )
}
