/**
 * Lead generation utility functions
 */

import axios from 'axios'
import {
  RAPIDAPI_KEYS,
  RAPIDAPI_TIMEOUT_MS,
  RAPIDAPI_MAX_RETRIES,
  HTTP_FETCH_TIMEOUT_MS,
  LEADS_DEBUG,
} from './config.js'

let rapidApiKeyCursor = 0

export function nextRapidApiKey() {
  if (!RAPIDAPI_KEYS.length) return { key: null, keyIndex: -1 }
  const keyIndex = rapidApiKeyCursor
  const key = RAPIDAPI_KEYS[rapidApiKeyCursor]
  rapidApiKeyCursor = (rapidApiKeyCursor + 1) % RAPIDAPI_KEYS.length
  return { key, keyIndex }
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function normalizeForLookup(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function deadlineRemainingMs(deadlineMs) {
  if (!deadlineMs) return null
  return deadlineMs - Date.now()
}

export function ensureBeforeDeadline(deadlineMs, label) {
  const remaining = deadlineRemainingMs(deadlineMs)
  if (remaining !== null && remaining <= 0) {
    throw new Error(`Timed out (${label})`)
  }
}

export async function sleepWithDeadline(waitMs, deadlineMs, label) {
  const remaining = deadlineRemainingMs(deadlineMs)
  if (remaining === null) {
    await sleep(waitMs)
    return
  }
  if (remaining <= 0) {
    throw new Error(`Timed out (${label})`)
  }
  await sleep(Math.min(waitMs, remaining))
}

export async function fetchWithTimeout(url, timeoutMs = HTTP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
}

export function extractXmlTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? decodeHtmlEntities(match[1].trim()) : ''
}

export function parseGoogleNewsRss(xmlText) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match = itemRegex.exec(xmlText)
  while (match) {
    const itemXml = match[1]
    const title = extractXmlTag(itemXml, 'title')
    const url = extractXmlTag(itemXml, 'link')
    const publishedAt = extractXmlTag(itemXml, 'pubDate')
    const source = extractXmlTag(itemXml, 'source') || 'Google News RSS'
    const description = extractXmlTag(itemXml, 'description')
    const parsedDate = new Date(publishedAt)

    if (title && url && publishedAt && !Number.isNaN(parsedDate.getTime())) {
      items.push({
        title,
        url,
        description,
        publishedAt: parsedDate.toISOString(),
        source: { name: source },
      })
    }
    match = itemRegex.exec(xmlText)
  }
  return items
}

export async function requestRapidApi({ host, url, params, step = 'unknown', counters = null, deadlineMs = null }) {
  if (!RAPIDAPI_KEYS.length) {
    throw new Error('No RapidAPI keys configured (RAPIDAPI_KEYS or RAPIDAPI_KEY_1..20).')
  }

  for (let attempt = 0; attempt <= RAPIDAPI_MAX_RETRIES; attempt += 1) {
    ensureBeforeDeadline(deadlineMs, `${step}:before_request`)
    const { key, keyIndex } = nextRapidApiKey()
    if (counters) {
      counters.total_request_attempts += 1
      if (step === 'company_search') counters.request_attempts_company_search += 1
      if (step === 'company_people') counters.request_attempts_company_people += 1
    }
    try {
      const remaining = deadlineRemainingMs(deadlineMs)
      const requestTimeout = remaining === null
        ? RAPIDAPI_TIMEOUT_MS
        : Math.max(1000, Math.min(RAPIDAPI_TIMEOUT_MS, remaining))
      const response = await axios({
        method: 'GET',
        url,
        params,
        timeout: requestTimeout,
        validateStatus: () => true,
        headers: {
          'x-rapidapi-host': host,
          'x-rapidapi-key': key,
        },
      })

      if (response.status >= 200 && response.status < 300) {
        if (counters) {
          if (step === 'company_search') counters.company_search_requests += 1
          if (step === 'company_people') counters.people_requests += 1
        }
        if (LEADS_DEBUG) {
          console.log(`[RAPIDAPI] ok host=${host} status=${response.status} keyIndex=${keyIndex}`)
        }
        return response.data
      }

      const shouldRetry = response.status === 429 || response.status >= 500
      if (!shouldRetry || attempt === RAPIDAPI_MAX_RETRIES) {
        if (counters) counters.errors += 1
        throw new Error(`RapidAPI request failed: host=${host} status=${response.status}`)
      }

      if (counters) counters.retries += 1
      if (response.status === 429) {
        const waitMs = randomInt(30000, 60000)
        console.log(`[RAPIDAPI] retry host=${host} step=${step} status=429 attempt=${attempt + 1}/${RAPIDAPI_MAX_RETRIES + 1} wait_ms=${waitMs}`)
        await sleepWithDeadline(waitMs, deadlineMs, `${step}:retry_429_sleep`)
      } else {
        const waitMs = randomInt(1200, 3000)
        if (LEADS_DEBUG) {
          console.log(`[RAPIDAPI] retry host=${host} step=${step} status=${response.status} attempt=${attempt + 1}/${RAPIDAPI_MAX_RETRIES + 1} wait_ms=${waitMs}`)
        }
        await sleepWithDeadline(waitMs, deadlineMs, `${step}:retry_sleep`)
      }
    } catch (error) {
      const message = String(error?.message || '')
      const timeoutLike = /timeout|ECONNABORTED/i.test(message)
      if (!timeoutLike || attempt === RAPIDAPI_MAX_RETRIES) {
        if (counters) counters.errors += 1
        throw error
      }
      if (counters) counters.retries += 1
      const waitMs = randomInt(1200, 3000)
      console.log(`[RAPIDAPI] retry host=${host} step=${step} reason=timeout attempt=${attempt + 1}/${RAPIDAPI_MAX_RETRIES + 1} wait_ms=${waitMs}`)
      await sleepWithDeadline(waitMs, deadlineMs, `${step}:timeout_sleep`)
    }
  }

  throw new Error('RapidAPI request loop exited unexpectedly')
}

export function normalizeCompanyName(name) {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  return cleaned
    .split(' ')
    .filter((token) => token && !COMPANY_SUFFIXES.has(token))
    .join(' ')
    .trim()
}

export function isLikelyExistingCompany(candidateName, existingNames = new Set()) {
  const candidate = normalizeCompanyName(candidateName)
  if (!candidate) return true

  for (const existing of existingNames) {
    if (!existing) continue
    if (candidate === existing) return true

    if (candidate.length >= 8 && existing.length >= 8) {
      if (candidate.includes(existing) || existing.includes(candidate)) {
        return true
      }
    }
  }

  return false
}

export function parseModelJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return null

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const payload = fencedMatch ? fencedMatch[1] : text

  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 50
  return Math.min(Math.max(Math.round(numeric), 1), 100)
}

export function sanitizeText(value, maxLen) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

export function parseCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

export function firstNonEmptyString(values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export function parseConfidence(value, fallback = 'low') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  return fallback
}

export function confidenceWeight(confidence) {
  if (confidence === 'high') return 1
  if (confidence === 'medium') return 0.65
  return 0.35
}

export function normalizeSignal(signalRaw) {
  const normalized = String(signalRaw || '').trim().toLowerCase()
  if (ALLOWED_SIGNALS.has(normalized)) return normalized
  return 'media'
}

export function sourcePenalty(title, sourceName, url) {
  const haystack = `${title || ''} ${sourceName || ''} ${url || ''}`.toLowerCase()
  if (SOURCE_PENALTY_TERMS.some((term) => haystack.includes(term))) return 15
  return 0
}

export function clampPriorityScore(value) {
  return Math.min(Math.max(Math.round(value), 1), 100)
}

export function priorityLabelFromScore(score) {
  if (score >= 80) return 'P1'
  if (score >= 60) return 'P2'
  return 'P3'
}

export function toBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function extractDomainFromCandidate(companyDomain, sourceUrl) {
  const candidate = String(companyDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (candidate && candidate.includes('.')) {
    return candidate.slice(0, 255)
  }

  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '')
    return host.slice(0, 255)
  } catch {
    return null
  }
}

import { COMPANY_SUFFIXES, ALLOWED_SIGNALS, SOURCE_PENALTY_TERMS } from './config.js'
