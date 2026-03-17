import { TrendingUp, TrendingDown } from 'lucide-react'

export default function KPICard({ title, value, trend, trendValue, icon: Icon, color = 'primary' }) {
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
        {Icon ? <Icon className="kpi-icon" /> : null}
        <p className="kpi-title">{title}</p>
        <p className="kpi-value-hero">{value}</p>
      </div>

      {trend && (
        <div className={`kpi-trend ${trend === 'up' ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
          {trend === 'up' ? <TrendingUp size={16} className="kpi-trend-icon" /> : <TrendingDown size={16} className="kpi-trend-icon" />}
          <span className="kpi-trend-value">{trendValue}</span>
        </div>
      )}
    </div>
  )
}
