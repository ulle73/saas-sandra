function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function sameIsoInstant(a, b) {
  const first = toDate(a)
  const second = toDate(b)
  if (!first && !second) return true
  if (!first || !second) return false
  return first.toISOString() === second.toISOString()
}

function parseEventWindow(event) {
  const start = toDate(event?.startAt)
  const end = toDate(event?.endAt) || start
  return { start, end }
}

function pickPreferredEmail(eventEmails = [], existingContactEmail = '') {
  const existing = normalizeEmail(existingContactEmail)
  if (existing) return null
  return eventEmails.find((email) => normalizeEmail(email)) || null
}

function buildContactMapByEmail(contacts = []) {
  const byEmail = new Map()
  for (const contact of contacts) {
    const email = normalizeEmail(contact.email)
    if (!email) continue
    byEmail.set(email, contact)
  }
  return byEmail
}

function extractMatchableEmails(event = {}) {
  const raw = [...(event.attendeeEmails || []), event.organizerEmail]
  return [...new Set(raw.map(normalizeEmail).filter(Boolean))]
}

export function buildOutlookSyncPlan(events = [], contacts = [], now = new Date()) {
  const byEmail = buildContactMapByEmail(contacts)
  const contactBuckets = new Map()
  const unmatchedEvents = []
  let matchedCount = 0

  for (const event of events) {
    const emails = extractMatchableEmails(event)
    const matchedContact = emails.map((email) => byEmail.get(email)).find(Boolean) || null

    if (!matchedContact) {
      unmatchedEvents.push({
        ...event,
        matchEmails: emails,
      })
      continue
    }

    matchedCount += 1
    const bucket = contactBuckets.get(matchedContact.id) || { contact: matchedContact, latestPast: null, nearestFuture: null }
    const { start, end } = parseEventWindow(event)
    if (!start || !end) continue

    if (end <= now) {
      if (!bucket.latestPast || end > bucket.latestPast) bucket.latestPast = end
    } else if (start > now) {
      if (!bucket.nearestFuture || start < bucket.nearestFuture) bucket.nearestFuture = start
    }

    contactBuckets.set(matchedContact.id, bucket)
  }

  const updates = []

  for (const bucket of contactBuckets.values()) {
    const patch = {}
    const currentLast = toDate(bucket.contact.last_touchpoint)
    const currentNext = toDate(bucket.contact.next_activity)
    const currentNextInFuture = currentNext && currentNext > now ? currentNext : null

    if (bucket.latestPast) {
      const desiredLast = !currentLast || bucket.latestPast > currentLast ? bucket.latestPast : currentLast
      if (!sameIsoInstant(bucket.contact.last_touchpoint, desiredLast)) {
        patch.last_touchpoint = desiredLast.toISOString()
      }
    }

    if (bucket.nearestFuture) {
      const desiredNext = currentNextInFuture && currentNextInFuture < bucket.nearestFuture
        ? currentNextInFuture
        : bucket.nearestFuture
      if (!sameIsoInstant(bucket.contact.next_activity, desiredNext)) {
        patch.next_activity = desiredNext.toISOString()
      }
    }

    if (Object.keys(patch).length) {
      updates.push({ contactId: bucket.contact.id, patch })
    }
  }

  return { updates, unmatchedEvents, matchedCount }
}

export function buildManualContactPatch(contact, event, now = new Date()) {
  const patch = {}
  const { start, end } = parseEventWindow(event)
  if (!start || !end) return patch

  const currentLast = toDate(contact?.last_touchpoint)
  const currentNext = toDate(contact?.next_activity)
  const currentNextInFuture = currentNext && currentNext > now ? currentNext : null

  if (end <= now) {
    const desiredLast = !currentLast || end > currentLast ? end : currentLast
    if (!sameIsoInstant(contact?.last_touchpoint, desiredLast)) {
      patch.last_touchpoint = desiredLast.toISOString()
    }
  } else if (start > now) {
    const desiredNext = currentNextInFuture && currentNextInFuture < start ? currentNextInFuture : start
    if (!sameIsoInstant(contact?.next_activity, desiredNext)) {
      patch.next_activity = desiredNext.toISOString()
    }
  }

  const preferredEmail = pickPreferredEmail(event?.matchEmails || [], contact?.email)
  if (preferredEmail) {
    patch.email = preferredEmail
  }

  return patch
}

export function inferContactNameFromEvent(event) {
  const title = String(event?.title || '').trim()
  if (!title) return 'Ny kontakt'
  const fromColon = title.split(':').pop()?.trim()
  return fromColon || title
}
