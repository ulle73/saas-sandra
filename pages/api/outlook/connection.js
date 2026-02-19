import { requireApiUser } from '../../../lib/apiAuth'
import {
  disconnectOutlookConnection,
  getOutlookConnectionStatus,
} from '../../../lib/outlook'

export default async function handler(req, res) {
  const auth = await requireApiUser(req, res)
  if (!auth) return

  if (req.method === 'GET') {
    try {
      const status = await getOutlookConnectionStatus(auth.user.id)
      return res.status(200).json(status)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectOutlookConnection(auth.user.id)
      return res.status(200).json({ ok: true })
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
