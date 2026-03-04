import path from 'path'
import { spawn } from 'child_process'
import { requireApiUser } from '../../../lib/apiAuth'

const LOG_TAIL_MAX_CHARS = 20000

function getJobStore() {
  if (!globalThis.__leadGenerationJobStore) {
    globalThis.__leadGenerationJobStore = new Map()
  }
  return globalThis.__leadGenerationJobStore
}

function getOrCreateJob(store, userId) {
  if (!store.has(userId)) {
    store.set(userId, {
      running: false,
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      insertedCount: null,
      error: null,
      logTail: '',
      pid: null,
    })
  }
  return store.get(userId)
}

function appendLogTail(currentValue, chunk) {
  const nextValue = `${currentValue}${chunk}`
  if (nextValue.length <= LOG_TAIL_MAX_CHARS) return nextValue
  return nextValue.slice(nextValue.length - LOG_TAIL_MAX_CHARS)
}

function parseInsertedCount(logText) {
  const match = /New discovery leads inserted:\s*(\d+)/i.exec(String(logText || ''))
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) ? value : null
}

function serializeJob(job) {
  return {
    running: Boolean(job.running),
    status: job.status || 'idle',
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    exitCode: Number.isInteger(job.exitCode) ? job.exitCode : null,
    insertedCount: Number.isFinite(Number(job.insertedCount)) ? Number(job.insertedCount) : null,
    error: job.error || null,
    pid: Number.isInteger(job.pid) ? job.pid : null,
  }
}

function startLeadGenerationJob(job, userId) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'generate-leads.js')
  const child = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LEADS_USER_ID: userId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  job.running = true
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  job.finishedAt = null
  job.exitCode = null
  job.insertedCount = null
  job.error = null
  job.logTail = ''
  job.pid = child.pid || null

  let settled = false
  const settle = (exitCode, errorMessage = null) => {
    if (settled) return
    settled = true
    job.running = false
    job.finishedAt = new Date().toISOString()
    job.pid = null
    job.exitCode = Number.isInteger(exitCode) ? exitCode : null
    job.insertedCount = parseInsertedCount(job.logTail)

    if (errorMessage || exitCode !== 0) {
      job.status = 'failed'
      job.error = errorMessage || `Lead generation process exited with code ${exitCode}`
      return
    }

    job.status = 'succeeded'
    job.error = null
  }

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      job.logTail = appendLogTail(job.logTail, String(chunk || ''))
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      job.logTail = appendLogTail(job.logTail, String(chunk || ''))
    })
  }

  child.on('error', (error) => {
    settle(null, error?.message || 'Failed to start lead generation process')
  })

  child.on('close', (code) => {
    settle(code)
  })
}

export default async function handler(req, res) {
  const auth = await requireApiUser(req, res)
  if (!auth) return

  const userId = auth.user.id
  const store = getJobStore()
  const job = getOrCreateJob(store, userId)

  if (req.method === 'GET') {
    return res.status(200).json({ job: serializeJob(job) })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (job.running) {
    return res.status(409).json({
      error: 'Lead generation is already running',
      job: serializeJob(job),
    })
  }

  startLeadGenerationJob(job, userId)

  return res.status(202).json({
    message: 'Lead generation started',
    job: serializeJob(job),
  })
}
