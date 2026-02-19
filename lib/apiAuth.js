import { supabaseAdmin } from './supabase'

function extractBearerToken(req) {
  const header = req.headers?.authorization || ''
  const [scheme, token] = header.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

export async function requireApiUser(req, res) {
  const token = extractBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for Outlook API auth' })
    return null
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired session token' })
    return null
  }

  return { user: data.user, accessToken: token }
}
