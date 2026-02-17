export function BentoGrid({ children, className = '' }) {
  return (
    <div className={`bento-grid ${className}`}>
      {children}
    </div>
  )
}

export function BentoItem({ children, className = '', colSpan = 1, rowSpan = 1 }) {
  // Keep sizing behavior with explicit semantic classes.
  const colClasses = {
    1: 'bento-col-1',
    2: 'bento-col-2',
    3: 'bento-col-3',
    4: 'bento-col-4',
  }

  const rowClasses = {
    1: 'bento-row-1',
    2: 'bento-row-2',
  }

  return (
    <div
      className={[
        'glass-panel bento-item',
        colClasses[colSpan] || 'bento-col-1',
        rowClasses[rowSpan] || 'bento-row-1',
        className,
      ].join(' ').trim()}
    >
      {children}
    </div>
  )
}
