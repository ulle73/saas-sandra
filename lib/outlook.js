import crypto from 'node:crypto'
import { supabaseAdmin } from './supabase'

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const OUTLOOK_CONNECTION_TABLE = 'user_outlook_connections'
const DEFAULT_LEGACY_SCOPE = 'offline_access https://graph.microsoft.com/Calendars.Read'
const DEFAULT_OAUTH_SCOPE = 'offline_access openid profile email User.Read Calendars.Read'
const TOKEN_REFRESH_GRACE_MS = 120 * 1000
const STATE_TTL_MS = 15 * 60 * 1000

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function looksLikeJwt(token) {
  if (!token) return false
  const trimmed = String(token).trim()
  if (!trimmed) return false
  return trimmed.split('.').length >= 3
}

function ensureUtcSuffix(dateTime) {
  if (!dateTime) return null
  if (dateTime.endsWith('Z')) return dateTime
  return `${dateTime}Z`
}

function normalizeScope(value, fallback) {
  const compact = String(value || '').trim().replace(/\s+/g, ' ')
  return compact || fallback
}

function sanitizeReturnTo(value) {
  const candidate = String(value || '').trim()
  if (!candidate.startsWith('/')) return '/calendar'
  if (candidate.startsWith('//')) return '/calendar'
  return candidate
}

function pickFirstHeaderValue(value) {
  if (!value) return ''
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw).split(',')[0].trim()
}

function deriveOrigin(req) {
  const explicitOrigin = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL
  if (explicitOrigin) {
    return String(explicitOrigin).trim().replace(/\/+$/, '')
  }

  const proto = pickFirstHeaderValue(req.headers?.['x-forwarded-proto']) || 'http'
  const forwardedHost = pickFirstHeaderValue(req.headers?.['x-forwarded-host'])
  const host = forwardedHost || pickFirstHeaderValue(req.headers?.host)
  if (!host) return 'http://localhost:3000'
  return `${proto}://${host}`
}

function normalizeRedirectUri(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

function getOAuthConfig(req) {
  const tenantId = process.env.OUTLOOK_TENANT_ID || 'common'
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const scope = normalizeScope(process.env.OUTLOOK_OAUTH_SCOPE, DEFAULT_OAUTH_SCOPE)
  const derivedRedirect = `${deriveOrigin(req)}/api/outlook/callback`
  const redirectUri = normalizeRedirectUri(process.env.OUTLOOK_REDIRECT_URI || derivedRedirect)
  const stateSecret = process.env.OUTLOOK_OAUTH_STATE_SECRET || clientSecret

  return {
    tenantId,
    clientId,
    clientSecret,
    scope,
    redirectUri,
    stateSecret,
  }
}

function b64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signState(payload, secret) {
  const encodedPayload = b64UrlEncodeJson(payload)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verifyState(token, secret) {
  const raw = String(token || '')
  const [encodedPayload, encodedSignature] = raw.split('.')
  if (!encodedPayload || !encodedSignature) {
    throw new Error('Missing OAuth state data')
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')

  const receivedBuffer = Buffer.from(encodedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature')
  }

  let payload = null
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Invalid OAuth state payload')
  }

  if (!payload?.sub || !payload?.exp) {
    throw new Error('OAuth state payload is incomplete')
  }

  if (Date.now() > Number(payload.exp)) {
    throw new Error('OAuth state has expired')
  }

  return payload
}

function computeExpiresAt(expiresIn) {
  const seconds = Number.parseInt(String(expiresIn ?? ''), 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function toIsoOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
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

async function getOutlookConnection(userId) {
  if (!userId || !supabaseAdmin) return null
  const { data, error } = await supabaseAdmin
    .from(OUTLOOK_CONNECTION_TABLE)
    .select('user_id, microsoft_user_id, email, display_name, access_token, refresh_token, token_type, scope, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load Outlook connection: ${error.message}`)
  }

  return data || null
}

async function saveOutlookConnection({
  userId,
  microsoftUserId,
  email,
  displayName,
  accessToken,
  refreshToken,
  tokenType,
  scope,
  expiresAt,
}) {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to persist Outlook connection')
  }

  const payload = {
    user_id: userId,
    microsoft_user_id: microsoftUserId || null,
    email: email || null,
    display_name: displayName || null,
    access_token: accessToken || null,
    refresh_token: refreshToken || null,
    token_type: tokenType || null,
    scope: normalizeScope(scope, DEFAULT_OAUTH_SCOPE),
    expires_at: toIsoOrNull(expiresAt),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from(OUTLOOK_CONNECTION_TABLE)
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    throw new Error(`Failed to save Outlook connection: ${error.message}`)
  }
}

export async function disconnectOutlookConnection(userId) {
  if (!userId || !supabaseAdmin) return
  const { error } = await supabaseAdmin
    .from(OUTLOOK_CONNECTION_TABLE)
    .delete()
    .eq('user_id', userId)
  if (error) {
    throw new Error(`Failed to disconnect Outlook account: ${error.message}`)
  }
}

export async function getOutlookConnectionStatus(userId) {
  const connection = await getOutlookConnection(userId)
  if (!connection) {
    return { connected: false, email: null, displayName: null, expiresAt: null }
  }

  return {
    connected: true,
    email: connection.email || null,
    displayName: connection.display_name || null,
    expiresAt: toIsoOrNull(connection.expires_at),
  }
}

export function createOutlookConnectUrl({ req, userId, returnTo }) {
  const { tenantId, clientId, scope, redirectUri, stateSecret } = getOAuthConfig(req)
  if (!clientId || !stateSecret) {
    throw new Error('Outlook OAuth is not configured. Missing OUTLOOK_CLIENT_ID or OUTLOOK_CLIENT_SECRET.')
  }

  const payload = {
    sub: userId,
    returnTo: sanitizeReturnTo(returnTo),
    nonce: crypto.randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  }
  const state = signState(payload, stateSecret)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope,
    prompt: 'select_account',
    state,
  })

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
}

async function fetchOutlookProfile(accessToken) {
  const response = await fetch(`${GRAPH_BASE_URL}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    const fallback = payload?._raw
      ? `Graph profile endpoint returned non-JSON response: ${String(payload._raw).slice(0, 200)}`
      : `Graph profile request failed with status ${response.status}`
    throw new Error(payload?.error?.message || fallback)
  }

  return payload
}

export async function completeOutlookConnect({ req, code, stateToken }) {
  const { tenantId, clientId, clientSecret, scope, redirectUri, stateSecret } = getOAuthConfig(req)
  if (!clientId || !clientSecret || !stateSecret) {
    throw new Error(
      'Outlook OAuth is not configured. Missing OUTLOOK_CLIENT_ID or OUTLOOK_CLIENT_SECRET.'
    )
  }

  const state = verifyState(stateToken, stateSecret)
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    scope,
  })

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const tokenPayload = await readJsonSafe(response)
  if (!response.ok || !tokenPayload?.access_token) {
    const fallback = tokenPayload?._raw
      ? `Token endpoint returned non-JSON response: ${String(tokenPayload._raw).slice(0, 200)}`
      : `OAuth token exchange failed with status ${response.status}`
    throw new Error(tokenPayload?.error_description || tokenPayload?.error || fallback)
  }

  const profile = await fetchOutlookProfile(tokenPayload.access_token)
  const email = profile?.mail || profile?.userPrincipalName || null

  await saveOutlookConnection({
    userId: state.sub,
    microsoftUserId: profile?.id || null,
    email,
    displayName: profile?.displayName || null,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token || null,
    tokenType: tokenPayload.token_type || null,
    scope: tokenPayload.scope || scope,
    expiresAt: computeExpiresAt(tokenPayload.expires_in),
  })

  return { userId: state.sub, returnTo: sanitizeReturnTo(state.returnTo) }
}

async function refreshOutlookUserToken(connection) {
  const tenantId = process.env.OUTLOOK_TENANT_ID || 'common'
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const refreshToken = connection?.refresh_token
  const scope = normalizeScope(connection?.scope, DEFAULT_OAUTH_SCOPE)

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Outlook refresh is missing OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, or refresh token')
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
  if (!response.ok || !payload?.access_token) {
    const fallback = payload?._raw
      ? `Token endpoint returned non-JSON response: ${String(payload._raw).slice(0, 200)}`
      : `Token refresh failed with status ${response.status}`
    throw new Error(payload?.error_description || payload?.error || fallback)
  }

  const nextRefreshToken = payload.refresh_token || refreshToken
  await saveOutlookConnection({
    userId: connection.user_id,
    microsoftUserId: connection.microsoft_user_id,
    email: connection.email,
    displayName: connection.display_name,
    accessToken: payload.access_token,
    refreshToken: nextRefreshToken,
    tokenType: payload.token_type || connection.token_type,
    scope: payload.scope || scope,
    expiresAt: computeExpiresAt(payload.expires_in),
  })

  return {
    accessToken: payload.access_token,
    account: {
      email: connection.email || null,
      displayName: connection.display_name || null,
    },
  }
}

async function getLegacyOutlookAccessToken() {
  const directAccessToken = process.env.OUTLOOK_ACCESS_TOKEN
  if (directAccessToken && looksLikeJwt(directAccessToken)) {
    return directAccessToken
  }

  const tenantId = process.env.OUTLOOK_TENANT_ID
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const refreshToken = process.env.OUTLOOK_REFRESH_TOKEN
  const scope = normalizeScope(process.env.OUTLOOK_SCOPE, DEFAULT_LEGACY_SCOPE)

  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    if (directAccessToken && !looksLikeJwt(directAccessToken)) {
      throw new Error(
        'OUTLOOK_ACCESS_TOKEN has invalid format. Clear it and use refresh-token flow (OUTLOOK_TENANT_ID/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN).'
      )
    }
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
  if (!response.ok || !payload?.access_token) {
    const fallback = payload?._raw
      ? `Token endpoint returned non-JSON response: ${String(payload._raw).slice(0, 200)}`
      : `Token refresh failed with status ${response.status}`
    throw new Error(payload?.error_description || payload?.error || fallback)
  }

  return payload.access_token
}

async function getUserOutlookTokenContext(userId) {
  const connection = await getOutlookConnection(userId)
  if (!connection) {
    return { token: null, connectionType: 'none', account: null, needsReconnect: false }
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null
  const hasValidExpiry = !expiresAt || expiresAt.getTime() - TOKEN_REFRESH_GRACE_MS > Date.now()
  if (connection.access_token && hasValidExpiry) {
    return {
      token: connection.access_token,
      connectionType: 'user',
      account: {
        email: connection.email || null,
        displayName: connection.display_name || null,
      },
      needsReconnect: false,
    }
  }

  if (!connection.refresh_token) {
    await disconnectOutlookConnection(userId)
    return { token: null, connectionType: 'none', account: null, needsReconnect: true }
  }

  try {
    const refreshed = await refreshOutlookUserToken(connection)
    return {
      token: refreshed.accessToken,
      connectionType: 'user',
      account: refreshed.account,
      needsReconnect: false,
    }
  } catch (error) {
    const message = String(error?.message || '')
    if (/invalid_grant|interaction_required|consent_required|AADSTS700082|AADSTS65001/i.test(message)) {
      await disconnectOutlookConnection(userId)
      return { token: null, connectionType: 'none', account: null, needsReconnect: true }
    }
    throw error
  }
}

export async function getOutlookAccessToken({ userId } = {}) {
  if (userId) {
    const userToken = await getUserOutlookTokenContext(userId)
    if (userToken.token) return userToken

    const legacyToken = await getLegacyOutlookAccessToken()
    if (legacyToken) {
      return {
        token: legacyToken,
        connectionType: 'legacy',
        account: null,
        needsReconnect: userToken.needsReconnect,
      }
    }
    return userToken
  }

  const legacyToken = await getLegacyOutlookAccessToken()
  if (!legacyToken) {
    return { token: null, connectionType: 'none', account: null, needsReconnect: false }
  }

  return { token: legacyToken, connectionType: 'legacy', account: null, needsReconnect: false }
}

export async function fetchOutlookEvents({ days = 14, limit = 10, userId } = {}) {
  const tokenContext = await getOutlookAccessToken({ userId })
  if (!tokenContext.token) {
    return {
      enabled: false,
      events: [],
      connectionType: tokenContext.connectionType || 'none',
      account: tokenContext.account || null,
      needsReconnect: Boolean(tokenContext.needsReconnect),
    }
  }

  const safeDays = Math.min(parsePositiveInt(days, 14), 60)
  const safeLimit = Math.min(parsePositiveInt(limit, 10), 200)
  const now = new Date()
  const end = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: 'start/dateTime',
    $top: String(safeLimit),
    $select: 'id,subject,start,end,webLink,location,organizer,attendees,isAllDay',
  })

  const legacyUserId = process.env.OUTLOOK_USER_ID
  const path = tokenContext.connectionType === 'legacy' && legacyUserId
    ? `/users/${encodeURIComponent(legacyUserId)}/calendarView`
    : '/me/calendarView'

  const response = await fetch(`${GRAPH_BASE_URL}${path}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${tokenContext.token}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    if (
      userId &&
      tokenContext.connectionType === 'user' &&
      (response.status === 401 || response.status === 403)
    ) {
      await disconnectOutlookConnection(userId)
      return {
        enabled: false,
        events: [],
        connectionType: 'none',
        account: null,
        needsReconnect: true,
      }
    }

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
    organizerEmail: event.organizer?.emailAddress?.address || '',
    organizer: event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || '',
    attendeeEmails: (event.attendees || [])
      .map((attendee) => attendee?.emailAddress?.address)
      .filter(Boolean),
  }))

  return {
    enabled: true,
    events,
    connectionType: tokenContext.connectionType,
    account: tokenContext.account || null,
    needsReconnect: false,
  }
}
