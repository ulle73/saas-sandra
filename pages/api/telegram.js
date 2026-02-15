/**
 * API route for sending Telegram notifications.
 * POST { text: string, chatId?: string }
 * Uses TELEGRAM_BOT_TOKEN (required) and default TELEGRAM_CHAT_ID from .env.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'Telegram bot token not configured' })
  }

  const { text, chatId } = req.body || {}
  if (!text) {
    return res.status(400).json({ error: 'Missing \"text\" in request body' })
  }

  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID
  if (!targetChatId) {
    return res.status(500).json({ error: 'Telegram chat ID not configured' })
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetChatId, text }),
    })
    const data = await response.json()
    if (!data.ok) {
      throw new Error(data.description || 'Telegram API error')
    }
    return res.status(200).json({ ok: true, result: data.result })
  } catch (err) {
    console.error('Telegram send error:', err)
    return res.status(500).json({ error: err.message })
  }
}
