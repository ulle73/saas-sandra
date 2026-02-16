const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function ensureUtcSuffix(dateTime) {
  if (!dateTime) return null
  if (dateTime.endsWith('Z')) return dateTime
  return `${dateTime}Z`
}

async function readJsonSafe(response) {
  const raw = await response.text()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return { _raw: raw }
  }
}

export async function getOutlookAccessToken() {
  if (process.env.OUTLOOK_ACCESS_TOKEN) {
    return process.env.OUTLOOK_ACCESS_TOKEN
  }

  const tenantId = process.env.OUTLOOK_TENANT_ID
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const refreshToken = process.env.OUTLOOK_REFRESH_TOKEN
  const scope = process.env.OUTLOOK_SCOPE || 'offline_access https://graph.microsoft.com/Calendars.Read'

  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    return null
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope,
  })

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const payload = await readJsonSafe(response)
  if (!response.ok || !payload.access_token) {
    const fallback = payload?._raw
      ? `Token endpoint returned non-JSON response: ${String(payload._raw).slice(0, 200)}`
      : `Token refresh failed with status ${response.status}`
    throw new Error(payload?.error_description || payload?.error || fallback)
  }

  return payload.access_token
}

export async function fetchOutlookEvents({ days = 14, limit = 10 } = {}) {
  const token = await getOutlookAccessToken()
  if (!token) {
    return { enabled: false, events: [] }
  }

  const safeDays = Math.min(parsePositiveInt(days, 14), 60)
  const safeLimit = Math.min(parsePositiveInt(limit, 10), 50)
  const now = new Date()
  const end = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: 'start/dateTime',
    $top: String(safeLimit),
    $select: 'id,subject,start,end,webLink,location,organizer,isAllDay',
  })

  const userId = process.env.OUTLOOK_USER_ID
  const path = userId
    ? `/users/${encodeURIComponent(userId)}/calendarView`
    : '/me/calendarView'

  const response = await fetch(`${GRAPH_BASE_URL}${path}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    const fallback = payload?._raw
      ? `Graph returned non-JSON response: ${String(payload._raw).slice(0, 200)}`
      : `Failed to fetch Outlook events (status ${response.status})`
    throw new Error(payload?.error?.message || fallback)
  }

  const events = (payload.value || []).map((event) => ({
    id: event.id,
    title: event.subject || '(No title)',
    startAt: ensureUtcSuffix(event.start?.dateTime),
    endAt: ensureUtcSuffix(event.end?.dateTime),
    isAllDay: Boolean(event.isAllDay),
    webLink: event.webLink || null,
    location: event.location?.displayName || '',
    organizer: event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || '',
  }))

  return { enabled: true, events }
}
