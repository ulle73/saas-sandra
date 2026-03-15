export default function StatusBadge({ status }) {
  const config = {
    green: {
      bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
      dot: 'bg-emerald-500',
      label: 'Upcoming Activity'
    },
    yellow: {
      bg: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
      dot: 'bg-amber-500',
      label: 'Recent Contact'
    },
    red: {
      bg: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
      dot: 'bg-rose-500',
      label: 'Stale (>4 weeks)'
    },
    default: {
      bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      dot: 'bg-slate-500',
      label: 'Unknown'
    }
  }

  const { bg, dot, label } = config[status] || config.default

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`}></span>
      {label}
    </span>
  )
}
