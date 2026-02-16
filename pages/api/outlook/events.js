import { fetchOutlookEvents } from '../../../lib/outlook'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const days = req.query?.days
  const limit = req.query?.limit

  try {
    const result = await fetchOutlookEvents({ days, limit })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
