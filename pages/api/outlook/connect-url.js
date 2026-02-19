import { requireApiUser } from '../../../lib/apiAuth'
import { createOutlookConnectUrl } from '../../../lib/outlook'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireApiUser(req, res)
  if (!auth) return

  try {
    const returnTo = req.body?.returnTo
    const url = createOutlookConnectUrl({
      req,
      userId: auth.user.id,
      returnTo,
    })
    return res.status(200).json({ url })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
