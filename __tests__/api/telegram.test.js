import { jest, test, expect } from '@jest/globals'
import handler from '../../pages/api/telegram'

describe('Telegram API route', () => {
  test('rejects non‑POST method', async () => {
    const req = { method: 'GET', body: {} }
    const jsonMock = jest.fn()
    const statusMock = jest.fn(() => ({ json: jsonMock }))
    const res = { status: statusMock }
    await handler(req, res)
    expect(statusMock).toHaveBeenCalledWith(405)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })
})