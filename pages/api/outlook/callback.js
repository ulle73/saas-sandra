import { completeOutlookConnect } from '../../../lib/outlook'

function withOutlookStatus(path, status, reason) {
  const safePath = String(path || '/calendar')
  const separator = safePath.includes('?') ? '&' : '?'
  const base = `${safePath}${separator}outlook=${encodeURIComponent(status)}`
  if (!reason) return base
  return `${base}&reason=${encodeURIComponent(reason)}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const oauthError = req.query?.error
  if (oauthError) {
    const reason = Array.isArray(oauthError) ? oauthError[0] : oauthError
    return res.redirect(302, withOutlookStatus('/calendar', 'error', reason))
  }

  const code = Array.isArray(req.query?.code) ? req.query.code[0] : req.query?.code
  const stateToken = Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state

  if (!code || !stateToken) {
    return res.redirect(302, withOutlookStatus('/calendar', 'error', 'missing_code_or_state'))
  }

  try {
    const { returnTo } = await completeOutlookConnect({ req, code, stateToken })
    return res.redirect(302, withOutlookStatus(returnTo, 'connected'))
  } catch (error) {
    console.error('Outlook OAuth callback failed:', error)
    return res.redirect(302, withOutlookStatus('/calendar', 'error', 'oauth_failed'))
  }
}
