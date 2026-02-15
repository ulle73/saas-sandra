export function computeContactStatus(contact) {
  const now = new Date()
  const nextActivity = contact?.next_activity ? new Date(contact.next_activity) : null
  const lastTouchpoint = contact?.last_touchpoint ? new Date(contact.last_touchpoint) : null

  if (nextActivity && nextActivity > now) {
    return 'green'
  }

  if (lastTouchpoint) {
    const ageMs = now.getTime() - lastTouchpoint.getTime()
    const days = ageMs / (1000 * 60 * 60 * 24)
    if (days < 28) {
      return 'yellow'
    }
  }

  return 'red'
}

export function statusLabel(status) {
  if (status === 'green') return '🟢 Active'
  if (status === 'yellow') return '🟡 Recent'
  return '🔴 Needs Attention'
}
