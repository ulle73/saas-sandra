import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ensureEnvLoaded } from './load-env.js'
import { DEFAULT_AI_PROFILE, aiProfileToPrompt, normalizeAiProfileInput } from '../lib/aiProfile.js'

ensureEnvLoaded()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const RAPIDAPI_KEYS = [
  ...(process.env.RAPIDAPI_KEYS || '').split(',').map((value) => value.trim()),
  process.env.RAPIDAPI_KEY_1,
  process.env.RAPIDAPI_KEY_2,
  process.env.RAPIDAPI_KEY_3,
  process.env.RAPIDAPI_KEY_4,
  process.env.RAPIDAPI_KEY_5,
  process.env.RAPIDAPI_KEY_6,
  process.env.RAPIDAPI_KEY_7,
  process.env.RAPIDAPI_KEY_8,
  process.env.RAPIDAPI_KEY_9,
  process.env.RAPIDAPI_KEY_10,
  process.env.RAPIDAPI_KEY_11,
  process.env.RAPIDAPI_KEY_12,
  process.env.RAPIDAPI_KEY_13,
  process.env.RAPIDAPI_KEY_14,
  process.env.RAPIDAPI_KEY_15,
  process.env.RAPIDAPI_KEY_16,
  process.env.RAPIDAPI_KEY_17,
  process.env.RAPIDAPI_KEY_18,
  process.env.RAPIDAPI_KEY_19,
  process.env.RAPIDAPI_KEY_20,
].filter((value) => Boolean(value) && !String(value).startsWith('KEY'))

const MAX_LEADS_PER_USER = parsePositiveInt(process.env.LEADS_MAX_PER_USER, 10, 1, 25)
const MIN_LEADS_TARGET = parsePositiveInt(process.env.LEADS_MIN_TARGET_PER_USER, 5, 1, 25)
const LOOKBACK_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_LOOKBACK_DAYS, 3, 1, 30)
const MAX_SOURCE_ARTICLES = parsePositiveInt(process.env.LEADS_DISCOVERY_MAX_ARTICLES, 40, 10, 100)
const OPENAI_MODEL = process.env.LEADS_DISCOVERY_MODEL || 'gpt-4o-mini'
const LEADS_DEBUG = String(process.env.LEADS_DEBUG || 'false').toLowerCase() === 'true'
const RECENT_DUPLICATE_WINDOW_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_DUPLICATE_WINDOW_DAYS, 60, 14, 180)
const DISCOVERY_INCLUDE_NEWSAPI = String(process.env.LEADS_DISCOVERY_INCLUDE_NEWSAPI || 'true').toLowerCase() === 'true'
const DISCOVERY_INCLUDE_GOOGLE_RSS = String(process.env.LEADS_DISCOVERY_INCLUDE_GOOGLE_RSS || 'true').toLowerCase() === 'true'
const RAPIDAPI_TIMEOUT_MS = parsePositiveInt(process.env.RAPIDAPI_TIMEOUT_MS, 30000, 5000, 120000)
const RAPIDAPI_MAX_RETRIES = parsePositiveInt(process.env.RAPIDAPI_MAX_RETRIES, 2, 0, 5)
const COMPANY_SEARCH_MAX_PAGES = parsePositiveInt(process.env.COMPANY_SEARCH_MAX_PAGES, 5, 1, 10)
const COMPANY_PEOPLE_MAX_CANDIDATES = parsePositiveInt(process.env.COMPANY_PEOPLE_MAX_CANDIDATES, 6, 1, 25)
const COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS = parsePositiveInt(process.env.COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS, 240000, 30000, 900000)
const HTTP_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.HTTP_FETCH_TIMEOUT_MS, 20000, 5000, 120000)
const PEOPLE_MAX_PAGES = parsePositiveInt(process.env.PEOPLE_MAX_PAGES, 50, 1, 300)
const PEOPLE_MAX_TOTAL = parsePositiveInt(process.env.PEOPLE_MAX_TOTAL, 1500, 50, 100000)
const PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP = parsePositiveInt(process.env.PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP, 20, 1, 300)
const PEOPLE_TARGET_DECISION_MAKERS = parsePositiveInt(process.env.PEOPLE_TARGET_DECISION_MAKERS, 4, 1, 50)
const SHORTLIST_LIMIT = parsePositiveInt(process.env.SHORTLIST_LIMIT, 15, 5, 50)
const STRICT_SWEDEN_ONLY = String(process.env.STRICT_SWEDEN_ONLY || 'true').toLowerCase() === 'true'
const HEURISTIC_FALLBACK_LIMIT = parsePositiveInt(process.env.LEADS_DISCOVERY_HEURISTIC_FALLBACK_LIMIT, 8, 1, 30)
const LEADS_USER_ID = String(process.env.LEADS_USER_ID || '').trim() || null

const COMPANY_SEARCH_HOST = 'linkedin-jobs-data-api.p.rapidapi.com'
const COMPANY_SEARCH_URL = `https://${COMPANY_SEARCH_HOST}/companies/search`
const PEOPLE_HOST = 'fresh-linkedin-scraper-api.p.rapidapi.com'
const PEOPLE_URL = `https://${PEOPLE_HOST}/api/v1/company/people`
const SOURCE_COMPANY_SEARCH = 'linkedin-jobs-data-api'
const SOURCE_PEOPLE_PROVIDER = 'fresh-linkedin-scraper-api'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_DIR = path.join(__dirname, '..', 'output')

const DISCOVERY_QUERIES = [
  '"rekryterar" OR "anstaller" OR "Head of People" OR "HR-chef"',
  '"expanderar" OR "vaxer" OR "nytt kontor" OR "investering"',
  '"stororder" OR "nytt avtal" OR partnerskap OR upphandling',
  '"people operations" OR "HR Director" OR CHRO OR "talent acquisition"',
  '"kapitalrunda" OR "growth plan" OR "scale up" OR "tillvaxt"',
  '"ramavtal" OR "strategiskt partnerskap" OR "digital transformation"',
  '"employer branding" OR "organisationsutveckling" OR "omorganisation"',
  '"forvarvar" OR "förvärvar" OR "acquires" OR "merger"',
  '"ny fabrik" OR "utokar produktion" OR "production expansion"',
  '"etablerar sig" OR "öppnar nytt kontor" OR "opens office"',
  '"anställer HR" OR "HR Manager" OR "People & Culture"',
  '"tecknar avtal" OR "vinner upphandling" OR "vunnit kontrakt"',
  '"växer teamet" OR "skalar upp" OR "satsar i Sverige"',
]

const SOURCE_PENALTY_TERMS = [
  'mix vale',
  'vietnam.vn',
]

const ALLOWED_SIGNALS = new Set([
  'hiring',
  'expansion',
  'order',
  'partnership',
  'public_procurement',
  'investment',
  'restructuring',
  'media',
])

const COMPANY_SUFFIXES = new Set([
  'ab',
  'aktiebolag',
  'group',
  'holding',
  'holdings',
  'koncern',
  'the',
  'inc',
  'ltd',
  'plc',
  'corp',
  'co',
  'company',
])

const DEFAULT_TARGET_TITLE_TERMS = [
  'chro',
  'head of hr',
  'hr director',
  'head of people',
  'vp people',
  'hr chef',
  'hr manager',
  'people culture manager',
  'people and culture manager',
  'talent acquisition lead',
  'ld manager',
  'learning development manager',
  'ceo',
  'chief executive',
  'vd',
  'managing director',
  'founder',
  'co founder',
]

const DEFAULT_FALLBACK_TITLE_TERMS = [
  'hr business partner',
  'people partner',
  'recruiter',
  'talent acquisition specialist',
]

const DEFAULT_EXCLUDED_TITLE_TERMS = [
  'intern',
  'internship',
  'student',
  'trainee',
  'assistent',
  'assistant',
  'junior',
  'summer',
  'praktik',
  'degree',
  'thesis',
]

const EXECUTIVE_TITLE_TERMS = [
  'ceo',
  'chief executive',
  'vd',
  'managing director',
  'founder',
  'co founder',
]

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

if (!NEWSAPI_KEY) {
  console.error('Missing NEWSAPI_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

let rapidApiKeyCursor = 0
let hasWarnedMissingAiProfilesTable = false

function nextRapidApiKey() {
  if (!RAPIDAPI_KEYS.length) return { key: null, keyIndex: -1 }
  const keyIndex = rapidApiKeyCursor
  const key = RAPIDAPI_KEYS[rapidApiKeyCursor]
  rapidApiKeyCursor = (rapidApiKeyCursor + 1) % RAPIDAPI_KEYS.length
  return { key, keyIndex }
}

function createRequestCounters() {
  return {
    total_request_attempts: 0,
    request_attempts_company_search: 0,
    request_attempts_company_people: 0,
    company_search_requests: 0,
    people_requests: 0,
    retries: 0,
    errors: 0,
    dropped_without_profile_url: 0,
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeForLookup(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function deadlineRemainingMs(deadlineMs) {
  if (!deadlineMs) return null
  return deadlineMs - Date.now()
}

function ensureBeforeDeadline(deadlineMs, label) {
  const remaining = deadlineRemainingMs(deadlineMs)
  if (remaining !== null && remaining <= 0) {
    throw new Error(`Timed out (${label})`)
  }
}

async function sleepWithDeadline(waitMs, deadlineMs, label) {
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

async function fetchWithTimeout(url, timeoutMs = HTTP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractXmlTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? decodeHtmlEntities(match[1].trim()) : ''
}

function parseGoogleNewsRss(xmlText) {
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

async function requestRapidApi({ host, url, params, step = 'unknown', counters = null, deadlineMs = null }) {
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

function normalizeCompanyName(name) {
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

function isLikelyExistingCompany(candidateName, existingNames = new Set()) {
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

function parseModelJson(raw) {
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

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 50
  return Math.min(Math.max(Math.round(numeric), 1), 100)
}

function sanitizeText(value, maxLen) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function parseCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

function firstNonEmptyString(values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function parseConfidence(value, fallback = 'low') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  return fallback
}

function confidenceWeight(confidence) {
  if (confidence === 'high') return 1
  if (confidence === 'medium') return 0.65
  return 0.35
}

function normalizeSignal(signalRaw) {
  const normalized = String(signalRaw || '').trim().toLowerCase()
  if (ALLOWED_SIGNALS.has(normalized)) return normalized
  return 'media'
}

function sourcePenalty(title, sourceName, url) {
  const haystack = `${title || ''} ${sourceName || ''} ${url || ''}`.toLowerCase()
  if (SOURCE_PENALTY_TERMS.some((term) => haystack.includes(term))) return 15
  return 0
}

function clampPriorityScore(value) {
  return Math.min(Math.max(Math.round(value), 1), 100)
}

function priorityLabelFromScore(score) {
  if (score >= 80) return 'P1'
  if (score >= 60) return 'P2'
  return 'P3'
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function extractDomainFromCandidate(companyDomain, sourceUrl) {
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

async function fetchDiscoveryArticles() {
  const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const collected = []
  const stats = {
    newsapiRequests: 0,
    newsapiArticles: 0,
    googleRssRequests: 0,
    googleRssArticles: 0,
  }
  let newsApiRateLimited = false

  for (const query of DISCOVERY_QUERIES) {
    if (DISCOVERY_INCLUDE_NEWSAPI && !newsApiRateLimited) {
      const encodedQuery = encodeURIComponent(query)
      const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&apiKey=${NEWSAPI_KEY}&searchIn=title,description&language=sv&from=${fromDate}&sortBy=publishedAt&pageSize=${MAX_SOURCE_ARTICLES}`
      let response
      let payload
      try {
        stats.newsapiRequests += 1
        // eslint-disable-next-line no-await-in-loop
        response = await fetchWithTimeout(url)
        // eslint-disable-next-line no-await-in-loop
        payload = await response.json()
      } catch (error) {
        console.error(`NewsAPI fetch timeout/error for query "${query}":`, error.message)
      }

      if (response && !response.ok) {
        const message = String(payload?.message || response.statusText || '')
        console.error(`NewsAPI error for query "${query}":`, message)
        if (response.status === 429 || /too many requests|limited to 100 requests/i.test(message)) {
          newsApiRateLimited = true
          console.warn('NewsAPI quota reached. Continuing with Google RSS only for remaining queries.')
        }
      } else if (response && payload) {
        const articles = payload.articles || []
        stats.newsapiArticles += articles.length
        collected.push(...articles)
      }
    }

    if (DISCOVERY_INCLUDE_GOOGLE_RSS) {
      const googleQuery = encodeURIComponent(`${query} when:${LOOKBACK_DAYS}d`)
      const rssUrl = `https://news.google.com/rss/search?q=${googleQuery}&hl=sv&gl=SE&ceid=SE:sv`
      try {
        stats.googleRssRequests += 1
        // eslint-disable-next-line no-await-in-loop
        const rssResponse = await fetchWithTimeout(rssUrl)
        // eslint-disable-next-line no-await-in-loop
        const rssText = await rssResponse.text()
        if (rssResponse.ok) {
          const rssArticles = parseGoogleNewsRss(rssText)
          stats.googleRssArticles += rssArticles.length
          collected.push(...rssArticles)
        }
      } catch (error) {
        console.error(`Google RSS fetch timeout/error for query "${query}":`, error.message)
      }
    }
  }

  const byUrl = new Map()
  for (const article of collected) {
    if (!article?.url || !article?.title || !article?.publishedAt) continue
    if (!byUrl.has(article.url)) byUrl.set(article.url, article)
  }

  const deduped = [...byUrl.values()]
    .filter((article) => new Date(article.publishedAt).getTime() >= new Date(fromDate).getTime())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_SOURCE_ARTICLES)

  console.log(
    `[DISCOVERY] sources: newsapi_requests=${stats.newsapiRequests}, newsapi_articles=${stats.newsapiArticles}, google_rss_requests=${stats.googleRssRequests}, google_rss_articles=${stats.googleRssArticles}, deduped=${deduped.length}`
  )

  return deduped
}

function normalizeSpacing(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferGrowthSignalFromText(value) {
  const text = normalizeForLookup(value)
  if (/forvarv|förvärv|acquir|merger/.test(text)) return 'investment'
  if (/upphandling|kontrakt|avtal|order|ramavtal/.test(text)) return 'order'
  if (/expander|vaxer|växer|etabler|öppnar|skalar/.test(text)) return 'expansion'
  if (/rekryter|anstall|anställ/.test(text)) return 'hiring'
  return 'media'
}

function extractCompanyFromTitleHeuristic(title) {
  const raw = normalizeSpacing(title)
  if (!raw) return null

  const actionMatch = raw.match(
    /^([A-ZÅÄÖ][\p{L}\p{N}&.'-]*(?:\s+[A-ZÅÄÖ][\p{L}\p{N}&.'-]*){0,4})\s+(rekryterar|anstaller|anställer|forvarvar|förvärvar|acquires|expanderar|vaxer|växer|investerar|tecknar|öppnar|etablerar|satsar)\b/iu
  )
  if (actionMatch?.[1]) {
    return normalizeSpacing(actionMatch[1]).slice(0, 120)
  }

  const firstSegment = raw.split(' - ')[0]
  const clean = normalizeSpacing(firstSegment).replace(/[|:]+$/g, '')
  if (!clean) return null

  const words = clean.split(' ')
  if (words.length < 1 || words.length > 5) return null
  if (!/[A-ZÅÄÖ]/.test(clean)) return null
  if (/\b(putin|pok[eé]mon|ryssland|finland|vietnam|teleskop)\b/i.test(clean)) return null
  return clean.slice(0, 120)
}

function buildHeuristicCandidate(article) {
  const companyName = extractCompanyFromTitleHeuristic(article.title)
  if (!companyName) return null

  const text = `${article.title || ''} ${article.description || ''}`
  const growthSignal = inferGrowthSignalFromText(text)
  const reason = 'Indikerad tillvaxtsignal i nyhetsflode, verifiera bolagsstorlek och HR-roll.'
  const pitch = 'Verifiera pa LinkedIn (company + people). Prioritera om bolaget har >150 anstallda och aktiv HR-funktion.'
  const score = clampPriorityScore(
    growthSignal === 'order' || growthSignal === 'investment' ? 58 : growthSignal === 'expansion' ? 54 : 48
  )

  return {
    companyName,
    companyDomain: extractDomainFromCandidate(null, article.url),
    employeeCountEstimate: null,
    employeeCountConfidence: 'low',
    hasHrFunction: true,
    hrConfidence: 'low',
    growthSignal,
    growthConfidence: 'medium',
    isGrowthCompany: true,
    recommendedPersonTitle: 'HR-chef / Head of People',
    reason,
    pitch,
    tier: 'watchlist',
    confidence: 'low',
    score,
    priorityLabel: priorityLabelFromScore(score),
    sourceTitle: sanitizeText(article.title, 300),
    sourceUrl: article.url,
    sourcePublishedAt: article.publishedAt,
  }
}

function buildLinkedInPeopleSearchUrl(companyId, keyword = 'HR') {
  const id = String(companyId || '').trim()
  if (!id) return null
  const encodedCompany = encodeURIComponent(JSON.stringify([id]))
  const encodedKeyword = encodeURIComponent(String(keyword || '').trim() || 'HR')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodedKeyword}&currentCompany=${encodedCompany}`
}

function summarizeCandidatePool(candidates) {
  const tierCounts = candidates.reduce((acc, candidate) => {
    const key = candidate.tier || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return {
    total: candidates.length,
    strict: tierCounts.strict || 0,
    relaxed: tierCounts.relaxed || 0,
    watchlist: tierCounts.watchlist || 0,
  }
}

function normalizeTitleForMatch(value) {
  return normalizeForLookup(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitKeywordList(value) {
  return String(value || '')
    .split(/[\n,;|]/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

function dedupeTerms(values) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeTitleTerms(rawValue, fallbackTerms) {
  const fromProfile = splitKeywordList(rawValue)
    .map((term) => normalizeTitleForMatch(term))
    .filter(Boolean)

  if (fromProfile.length) return dedupeTerms(fromProfile)
  return dedupeTerms(fallbackTerms.map((term) => normalizeTitleForMatch(term)))
}

function buildPersonTitleStrategy(aiProfileInput = DEFAULT_AI_PROFILE) {
  const profile = normalizeAiProfileInput(aiProfileInput)
  return {
    targetTerms: normalizeTitleTerms(profile.target_titles, DEFAULT_TARGET_TITLE_TERMS),
    fallbackTerms: normalizeTitleTerms(profile.fallback_titles, DEFAULT_FALLBACK_TITLE_TERMS),
    excludedTerms: normalizeTitleTerms(profile.excluded_titles, DEFAULT_EXCLUDED_TITLE_TERMS),
    executiveTerms: dedupeTerms(EXECUTIVE_TITLE_TERMS.map((term) => normalizeTitleForMatch(term))),
  }
}

function titleIncludesAny(normalizedTitle, terms) {
  return terms.some((term) => term && normalizedTitle.includes(term))
}

async function analyzeArticle(article, aiProfileInput = DEFAULT_AI_PROFILE) {
  const aiProfile = normalizeAiProfileInput(aiProfileInput)
  const profilePrompt = aiProfileToPrompt(aiProfile)
  const prompt = `
Du ar en svensk B2B-sales analytiker.
Malet ar att hitta NYA bolag med dessa kriterier:
- bolaget ar i tillvaxt eller har tydlig affarssignal
- bolaget ar sannolikt stort nog (minst 150 anstallda)
- bolaget har sannolikt HR-funktion (HR-chef, Head of People, HR Business Partner eller liknande)

Regler:
- Du SKA alltid ge en klassificering om artikeln verkar handla om ett bolag
- reason och pitch maste vara pa svenska
- reason max 140 tecken
- pitch max 220 tecken
- confidence-falt maste vara: "high" | "medium" | "low"
- growth_signal maste vara en av: hiring, expansion, order, partnership, public_procurement, investment, restructuring, media

Kundprofil att ta hansyn till:
${profilePrompt}

Anpassa prioritering och resonemang efter kundprofilen ovan, men folj alltid output-formatet exakt.

Returnera ENDAST JSON:
{
  "is_company_news": boolean,
  "company_name": string,
  "company_domain": string,
  "employee_count_estimate": number,
  "employee_count_confidence": "high|medium|low",
  "has_hr_function": boolean,
  "hr_confidence": "high|medium|low",
  "is_growth_company": boolean,
  "growth_signal": string,
  "growth_confidence": "high|medium|low",
  "recommended_person_title": string,
  "reason": string,
  "pitch": string
}

title: ${article.title}
description: ${article.description || ''}
source: ${article.source?.name || 'unknown'}
published_at: ${article.publishedAt}
url: ${article.url}
`.trim()

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const parsed = parseModelJson(completion.choices?.[0]?.message?.content || '')
  if (!parsed) {
    return { candidate: null, rejectReason: 'ai_invalid_json' }
  }

  if (!toBoolean(parsed.is_company_news)) {
    return { candidate: null, rejectReason: 'not_company_news' }
  }

  const companyName = sanitizeText(parsed.company_name, 120)
  const reason = sanitizeText(parsed.reason, 140)
  const pitch = sanitizeText(parsed.pitch, 220)
  const recommendedPersonTitle = sanitizeText(parsed.recommended_person_title, 80)
  const growthSignal = normalizeSignal(parsed.growth_signal)
  const employeeCountEstimate = parseCount(parsed.employee_count_estimate)
  const hasHrFunction = toBoolean(parsed.has_hr_function)
  const isGrowthCompany = toBoolean(parsed.is_growth_company)
  const employeeCountConfidence = parseConfidence(parsed.employee_count_confidence, employeeCountEstimate ? 'medium' : 'low')
  const hrConfidence = parseConfidence(parsed.hr_confidence, hasHrFunction ? 'medium' : 'low')
  const growthConfidence = parseConfidence(parsed.growth_confidence, isGrowthCompany ? 'medium' : 'low')

  if (!companyName) return { candidate: null, rejectReason: 'missing_company_name' }
  if (!reason || !pitch) return { candidate: null, rejectReason: 'missing_reason_or_pitch' }

  const sizeStrict = Boolean(employeeCountEstimate && employeeCountEstimate >= 150)
  const sizeLikely = sizeStrict || Boolean(employeeCountEstimate && employeeCountEstimate >= 120 && employeeCountConfidence === 'high')
  const strictCriteriaCount = [sizeStrict, hasHrFunction, isGrowthCompany].filter(Boolean).length
  const relaxedCriteriaCount = [sizeLikely, hasHrFunction, isGrowthCompany].filter(Boolean).length

  let tier = null
  if (strictCriteriaCount === 3) tier = 'strict'
  else if (relaxedCriteriaCount >= 2) tier = 'relaxed'
  else if (relaxedCriteriaCount >= 1) tier = 'watchlist'
  else return { candidate: null, rejectReason: 'below_watchlist_threshold' }

  const signal = growthSignal
  const domain = extractDomainFromCandidate(parsed.company_domain, article.url)

  const growthPoints = isGrowthCompany ? 35 * confidenceWeight(growthConfidence) : 0
  const hrPoints = hasHrFunction ? 25 * confidenceWeight(hrConfidence) : 0
  const sizePoints = sizeStrict
    ? 20 * confidenceWeight(employeeCountConfidence)
    : sizeLikely
      ? 12 * confidenceWeight(employeeCountConfidence)
      : 0

  const triggerWeight = ({
    investment: 10,
    public_procurement: 10,
    order: 10,
    partnership: 10,
    expansion: 8,
    hiring: 8,
    restructuring: 5,
    media: 2,
  })[signal] || 2

  const ageDays = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / (24 * 60 * 60 * 1000))
  const recencyPoints = Math.max(0, 10 - ageDays * 2)
  const tierBoost = tier === 'strict' ? 8 : tier === 'relaxed' ? 3 : 0
  const penalty = sourcePenalty(article.title, article.source?.name, article.url)

  const priorityScore = clampPriorityScore(
    growthPoints + hrPoints + sizePoints + triggerWeight + recencyPoints + tierBoost - penalty
  )

  const confidenceScore = (
    confidenceWeight(employeeCountConfidence)
    + confidenceWeight(hrConfidence)
    + confidenceWeight(growthConfidence)
  ) / 3

  const confidence = confidenceScore >= 0.8 ? 'high' : confidenceScore >= 0.55 ? 'medium' : 'low'
  const priorityLabel = priorityLabelFromScore(priorityScore)

  return {
    candidate: {
      companyName,
      companyDomain: domain,
      employeeCountEstimate,
      employeeCountConfidence,
      hasHrFunction,
      hrConfidence,
      growthSignal: signal,
      growthConfidence,
      isGrowthCompany,
      recommendedPersonTitle: recommendedPersonTitle || 'HR-chef / VD',
      reason,
      pitch,
      tier,
      confidence,
      score: priorityScore,
      priorityLabel,
      sourceTitle: sanitizeText(article.title, 300),
      sourceUrl: article.url,
      sourcePublishedAt: article.publishedAt,
    },
    rejectReason: null,
  }
}

async function extractCandidatesFromArticles(articles, aiProfileInput = DEFAULT_AI_PROFILE) {
  const byCompany = new Map()
  const articleDecisions = []

  for (const article of articles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const analysis = await analyzeArticle(article, aiProfileInput)
      if (!analysis?.candidate) {
        articleDecisions.push({
          title: article.title,
          url: article.url,
          outcome: 'filtered',
          reason: analysis?.rejectReason || 'unknown_rejection',
        })
        continue
      }

      const candidate = analysis.candidate
      const key = normalizeCompanyName(candidate.companyName)
      if (!key) {
        articleDecisions.push({
          title: article.title,
          url: article.url,
          companyName: candidate.companyName,
          outcome: 'filtered',
          reason: 'invalid_normalized_company',
        })
        continue
      }

      const existing = byCompany.get(key)
      if (!existing) {
        byCompany.set(key, candidate)
        articleDecisions.push({
          title: article.title,
          url: article.url,
          companyName: candidate.companyName,
          outcome: 'candidate_kept',
          reason: `first_for_company:${candidate.tier}:${candidate.score}:${candidate.confidence}`,
        })
        continue
      }

      const existingPublishedAt = new Date(existing.sourcePublishedAt).getTime()
      const candidatePublishedAt = new Date(candidate.sourcePublishedAt).getTime()
      const shouldReplace = candidate.score > existing.score
        || (candidate.score === existing.score && candidatePublishedAt > existingPublishedAt)

      if (shouldReplace) {
        byCompany.set(key, candidate)
        articleDecisions.push({
          title: article.title,
          url: article.url,
          companyName: candidate.companyName,
          outcome: 'candidate_kept',
          reason: `replaced_weaker_company_candidate:${candidate.tier}:${candidate.score}:${candidate.confidence}`,
        })
      } else {
        articleDecisions.push({
          title: article.title,
          url: article.url,
          companyName: candidate.companyName,
          outcome: 'filtered',
          reason: 'weaker_duplicate_company_candidate',
        })
      }
    } catch (error) {
      console.error(`AI extraction failed for article "${article.title}":`, error.message)
      articleDecisions.push({
        title: article.title,
        url: article.url,
        outcome: 'filtered',
        reason: 'ai_runtime_error',
      })
    }
  }

  if (byCompany.size < MIN_LEADS_TARGET) {
    for (const article of articles) {
      if (byCompany.size >= Math.max(MIN_LEADS_TARGET, HEURISTIC_FALLBACK_LIMIT)) break

      const fallbackCandidate = buildHeuristicCandidate(article)
      if (!fallbackCandidate) continue
      const key = normalizeCompanyName(fallbackCandidate.companyName)
      if (!key || byCompany.has(key)) continue

      byCompany.set(key, fallbackCandidate)
      articleDecisions.push({
        title: article.title,
        url: article.url,
        companyName: fallbackCandidate.companyName,
        outcome: 'candidate_kept',
        reason: `heuristic_fallback:${fallbackCandidate.tier}:${fallbackCandidate.score}:${fallbackCandidate.confidence}`,
      })
    }
  }

  const candidates = [...byCompany.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const tierPriority = { strict: 3, relaxed: 2, watchlist: 1 }
    const tierDiff = (tierPriority[b.tier] || 0) - (tierPriority[a.tier] || 0)
    if (tierDiff !== 0) return tierDiff
    return new Date(b.sourcePublishedAt).getTime() - new Date(a.sourcePublishedAt).getTime()
  })

  return { candidates, articleDecisions }
}

function extractArrayByPaths(payload, paths) {
  for (const pathValue of paths) {
    const tokens = pathValue.split('.')
    let cursor = payload
    for (const token of tokens) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = null
        break
      }
      cursor = cursor[token]
    }
    if (Array.isArray(cursor)) return cursor
  }
  return null
}

function extractPossibleArrayFallback(payload) {
  const queue = [payload]
  const visited = new Set()

  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    if (visited.has(current)) continue
    visited.add(current)

    if (Array.isArray(current)) {
      if (!current.length) return current
      if (typeof current[0] === 'object') return current
      continue
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        if (!value.length) return value
        if (typeof value[0] === 'object') return value
      } else if (value && typeof value === 'object') {
        queue.push(value)
      }
    }
  }

  return []
}

function normalizeCompanyCandidate(raw) {
  const id = String(
    raw?.company_id
      || raw?.companyId
      || raw?.id
      || raw?.urn_id
      || raw?.urnId
      || ''
  ).trim()
  const name = String(raw?.name || raw?.company_name || raw?.companyName || '').trim()
  if (!id || !name) return null

  return {
    company_id: id,
    name,
    location: String(raw?.location || raw?.country || raw?.hq_location || '').trim() || null,
    company_url: String(raw?.company_url || raw?.linkedin_url || raw?.url || '').trim() || null,
  }
}

function scoreCompanyMatch(candidate, expectedCompanyName) {
  const expected = normalizeForLookup(expectedCompanyName)
  const name = normalizeForLookup(candidate.name)
  const location = normalizeForLookup(candidate.location)
  const companyUrl = normalizeForLookup(candidate.company_url)

  const swedenSignals = [
    'sweden',
    'sverige',
    'stockholm',
    'goteborg',
    'gothenburg',
    'malmo',
    'orebro',
    'uppsala',
    'linkoping',
    'vasteras',
    'lund',
    'jonkoping',
    'helsingborg',
    'norrkoping',
    'umea',
  ]

  let score = 0
  const swedishLocation = swedenSignals.some((term) => location.includes(term))
  const swedishUrl = /\/company\/.*(ab|sverige|sweden)/.test(companyUrl)
  if (swedishLocation) score += 120
  else if (swedishUrl) score += 70

  if (name === expected) score += 70
  else if (name.includes(expected) || expected.includes(name)) score += 45
  else {
    const expectedParts = expected.split(/\s+/).filter(Boolean)
    const overlap = expectedParts.filter((part) => name.includes(part)).length
    score += overlap * 10
  }
  return score
}

function isSwedishCompanyCandidate(candidate) {
  const location = normalizeForLookup(candidate?.location)
  const companyUrl = normalizeForLookup(candidate?.company_url)
  const swedenSignals = [
    'sweden',
    'sverige',
    'stockholm',
    'goteborg',
    'gothenburg',
    'malmo',
    'orebro',
    'uppsala',
    'linkoping',
    'vasteras',
    'lund',
    'jonkoping',
    'helsingborg',
    'norrkoping',
    'umea',
  ]
  return swedenSignals.some((term) => location.includes(term)) || /\/company\/.*(ab|sverige|sweden)/.test(companyUrl)
}

async function findCompanyForLead(companyName, requestCounters, deadlineMs = null) {
  const byId = new Map()
  for (let pageNumber = 1; pageNumber <= COMPANY_SEARCH_MAX_PAGES; pageNumber += 1) {
    ensureBeforeDeadline(deadlineMs, 'company_search:before_page')
    // eslint-disable-next-line no-await-in-loop
    const payload = await requestRapidApi({
      host: COMPANY_SEARCH_HOST,
      url: COMPANY_SEARCH_URL,
      params: { keyword: companyName, page_number: pageNumber },
      step: 'company_search',
      counters: requestCounters,
      deadlineMs,
    })

    const rows = extractArrayByPaths(payload, [
      'data.companies',
      'companies',
      'data.results',
      'results',
      'data.items',
      'items',
      'data.data',
    ]) || extractPossibleArrayFallback(payload)

    if (!rows.length && pageNumber > 1) {
      break
    }

    for (const row of rows) {
      const normalized = normalizeCompanyCandidate(row)
      if (!normalized) continue
      if (!byId.has(normalized.company_id)) {
        byId.set(normalized.company_id, normalized)
      }
    }
  }

  const ranked = [...byId.values()]
    .map((company) => ({ ...company, _score: scoreCompanyMatch(company, companyName) }))
    .sort((a, b) => b._score - a._score)
  if (!ranked.length) return null

  const swedishOnlyRanked = ranked.filter(isSwedishCompanyCandidate)
  if (swedishOnlyRanked.length) return swedishOnlyRanked[0]
  if (STRICT_SWEDEN_ONLY) return null
  return ranked[0]
}

function normalizeProfileUrl(url) {
  if (!url) return ''
  const value = String(url).trim()
  if (!value) return ''
  try {
    const parsed = new URL(value)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/+$/, '').toLowerCase()
  } catch {
    return value.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
  }
}

function buildProfileUrlFromRaw(rawPerson) {
  const directUrl = rawPerson?.profile_url
    || rawPerson?.profileUrl
    || rawPerson?.linkedin_url
    || rawPerson?.linkedinUrl
    || rawPerson?.profile_link
    || rawPerson?.url
    || rawPerson?.profile?.url
    || rawPerson?.profile?.profile_url
  if (directUrl) return normalizeProfileUrl(directUrl)

  const identifier = String(
    rawPerson?.public_identifier
      || rawPerson?.publicIdentifier
      || rawPerson?.username
      || rawPerson?.slug
      || rawPerson?.profile_id
      || rawPerson?.profileId
      || ''
  ).trim()
  if (!identifier) return ''
  return normalizeProfileUrl(`https://www.linkedin.com/in/${identifier.replace(/^\/+|\/+$/g, '')}`)
}

function normalizeLeadPerson(rawPerson, companyId, companyName, page, requestCounters) {
  const profileUrl = buildProfileUrlFromRaw(rawPerson)
  if (!profileUrl) {
    if (requestCounters) requestCounters.dropped_without_profile_url += 1
    return null
  }

  const firstName = String(rawPerson?.first_name || rawPerson?.firstName || '').trim()
  const lastName = String(rawPerson?.last_name || rawPerson?.lastName || '').trim()
  const mergedName = `${firstName} ${lastName}`.trim()
  const fullName = String(rawPerson?.full_name || rawPerson?.fullName || rawPerson?.name || mergedName || '').trim()
  const title = String(rawPerson?.title || rawPerson?.headline || rawPerson?.job_title || rawPerson?.position || '').replace(/\s+/g, ' ').trim()
  const location = String(rawPerson?.location || rawPerson?.geo_location || rawPerson?.city || '').replace(/\s+/g, ' ').trim()
  const email = firstNonEmptyString([
    rawPerson?.email,
    rawPerson?.work_email,
    rawPerson?.workEmail,
    rawPerson?.business_email,
    rawPerson?.businessEmail,
    rawPerson?.personal_email,
    rawPerson?.personalEmail,
    rawPerson?.contact?.email,
  ])
  const phone = firstNonEmptyString([
    rawPerson?.phone,
    rawPerson?.phone_number,
    rawPerson?.phoneNumber,
    rawPerson?.mobile,
    rawPerson?.mobile_phone,
    rawPerson?.mobilePhone,
    rawPerson?.contact?.phone,
  ])

  return {
    company_id: companyId,
    company_name: companyName,
    profile_url: profileUrl,
    full_name: fullName || null,
    title: title || null,
    location: location || null,
    email: email || null,
    phone: phone || null,
    source_provider: SOURCE_PEOPLE_PROVIDER,
    fetched_at: new Date().toISOString(),
    page_found: page,
  }
}

function scoreLeadTitle(titleRaw, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  const title = normalizeTitleForMatch(titleRaw)

  if (!title) {
    return { score: 0, reason: 'Saknar titel' }
  }

  const isExecutive = titleIncludesAny(title, titleStrategy.executiveTerms)
  if (titleIncludesAny(title, titleStrategy.excludedTerms)) {
    return { score: -999, reason: 'Exkluderad: titel i blockeringslista' }
  }

  const consultantLike = title.includes('consultant') || title.includes('consulting')
  if (consultantLike && !isExecutive) {
    return { score: -999, reason: 'Exkluderad: konsultroll' }
  }

  if (titleIncludesAny(title, titleStrategy.targetTerms)) {
    return { score: 4, reason: 'Profilmatch: prioriterad roll' }
  }

  if (titleIncludesAny(title, titleStrategy.fallbackTerms)) {
    return { score: 2, reason: 'Profilmatch: fallback-roll' }
  }

  if (/(chro|head of hr|hr director|head of people|vp people)/.test(title)) {
    return { score: 4, reason: 'Senior HR match (fallback)' }
  }
  if (/(hr manager|people culture manager|people and culture manager|talent acquisition lead)/.test(title)) {
    return { score: 3, reason: 'HR Manager match (fallback)' }
  }
  if (/(ceo|chief executive|vd|managing director|founder|co founder)/.test(title)) {
    return { score: 4, reason: 'Ledningsroll match (fallback)' }
  }
  if (/(recruiter|talent acquisition specialist)/.test(title)) {
    return { score: 1, reason: 'Recruiting match (fallback)' }
  }

  return { score: 0, reason: 'Ingen prioriterad titelmatch' }
}

function isDecisionMaker(titleRaw, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  return scoreLeadTitle(titleRaw, titleStrategy).score >= 3
}

function extractPeopleRows(payload) {
  const byPath = extractArrayByPaths(payload, [
    'data.people',
    'people',
    'data.results',
    'results',
    'data.items',
    'items',
    'data.data',
    'profiles',
    'data.profiles',
  ])
  if (byPath) return byPath
  return extractPossibleArrayFallback(payload)
}

function extractPaginationHints(payload) {
  const containers = [payload, payload?.data, payload?.pagination, payload?.data?.pagination]
  let hasMore = null
  let nextPage = null
  let totalPages = null

  for (const container of containers) {
    if (!container || typeof container !== 'object') continue
    if (hasMore === null) {
      if (typeof container.has_more === 'boolean') hasMore = container.has_more
      else if (typeof container.hasMore === 'boolean') hasMore = container.hasMore
      else if (typeof container.more === 'boolean') hasMore = container.more
    }
    if (nextPage === null) {
      nextPage = container.next_page ?? container.nextPage ?? null
      if (typeof nextPage === 'string' && /^\d+$/.test(nextPage)) nextPage = Number(nextPage)
    }
    if (totalPages === null) {
      totalPages = container.total_pages ?? container.totalPages ?? container.last_page ?? null
      if (typeof totalPages === 'string' && /^\d+$/.test(totalPages)) totalPages = Number(totalPages)
    }
  }

  return { hasMore, nextPage, totalPages }
}

async function fetchCompanyPeople(companyId, companyName, requestCounters, deadlineMs = null, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  const peopleByUrl = new Map()
  let pagesFetched = 0
  let decisionMakerCount = 0
  let stopReason = 'completed'

  for (let page = 1; page <= PEOPLE_MAX_PAGES; page += 1) {
    ensureBeforeDeadline(deadlineMs, 'company_people:before_page')
    // eslint-disable-next-line no-await-in-loop
    let payload = await requestRapidApi({
      host: PEOPLE_HOST,
      url: PEOPLE_URL,
      params: { company_id: companyId, page },
      step: 'company_people',
      counters: requestCounters,
      deadlineMs,
    })

    let rows = extractPeopleRows(payload)
    if (!rows.length && page === 1) {
      for (let semanticRetry = 0; semanticRetry < 2 && !rows.length; semanticRetry += 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(randomInt(1200, 2500))
        // eslint-disable-next-line no-await-in-loop
        payload = await requestRapidApi({
          host: PEOPLE_HOST,
          url: PEOPLE_URL,
          params: { company_id: companyId, page },
          step: 'company_people',
          counters: requestCounters,
          deadlineMs,
        })
        rows = extractPeopleRows(payload)
      }
    }

    if (!rows.length) {
      stopReason = 'empty_page'
      break
    }

    let pageNormalized = 0
    let pageDuplicates = 0

    for (const row of rows) {
      const person = normalizeLeadPerson(row, companyId, companyName, page, requestCounters)
      if (!person) continue

      pageNormalized += 1
      if (peopleByUrl.has(person.profile_url)) {
        pageDuplicates += 1
        continue
      }

      peopleByUrl.set(person.profile_url, person)
      if (isDecisionMaker(person.title || '', titleStrategy)) {
        decisionMakerCount += 1
      }
    }

    pagesFetched += 1
    if (!pageNormalized) {
      stopReason = 'page_without_normalized_profiles'
      break
    }

    const duplicateRatio = pageDuplicates / pageNormalized
    if (duplicateRatio > 0.8) {
      stopReason = `loop_detect_duplicate_ratio_${duplicateRatio.toFixed(2)}`
      break
    }

    const hints = extractPaginationHints(payload)
    if (typeof hints.hasMore === 'boolean' && !hints.hasMore) {
      stopReason = 'has_more_false'
      break
    }
    if (typeof hints.totalPages === 'number' && page >= hints.totalPages) {
      stopReason = 'total_pages_exhausted'
      break
    }
    if (typeof hints.nextPage === 'number' && hints.nextPage > page + 1) {
      page = hints.nextPage - 1
    }

    if (page >= PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP && decisionMakerCount >= PEOPLE_TARGET_DECISION_MAKERS) {
      stopReason = 'priority_target_reached'
      break
    }
    if (PEOPLE_MAX_TOTAL > 0 && peopleByUrl.size >= PEOPLE_MAX_TOTAL) {
      stopReason = 'max_total_people_reached'
      break
    }

    // eslint-disable-next-line no-await-in-loop
    await sleepWithDeadline(randomInt(300, 1200), deadlineMs, 'company_people:between_pages_sleep')
  }

  return {
    people: [...peopleByUrl.values()],
    pagesFetched,
    decisionMakerCount,
    stopReason,
  }
}

function buildShortlistFromPeople(people, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  const shortlist = people
    .map((person) => {
      const scored = scoreLeadTitle(person.title || '', titleStrategy)
      return {
        person,
        score: scored.score,
        reason: scored.reason,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.person.full_name || '').localeCompare(String(b.person.full_name || '')))
    .slice(0, SHORTLIST_LIMIT)

  return shortlist.map((entry) => ({
    name: entry.person.full_name || '',
    title: entry.person.title || '',
    profile_url: entry.person.profile_url,
    location: entry.person.location || '',
    email: entry.person.email || null,
    phone: entry.person.phone || null,
    score: entry.score,
    reason: entry.reason,
  }))
}

async function writeAiLeadsFile({
  userId,
  candidate,
  companyInfo,
  peopleResult,
  shortlist,
  outputPath,
  requestCounters,
}) {
  const backupHrUrl = buildLinkedInPeopleSearchUrl(companyInfo.company_id, 'HR')
  const backupCeoUrl = buildLinkedInPeopleSearchUrl(companyInfo.company_id, 'CEO')

  const payload = {
    company: {
      id: companyInfo.company_id,
      name: companyInfo.name,
      location: companyInfo.location || null,
      company_url: companyInfo.company_url || null,
      backup_hr_url: backupHrUrl,
      backup_ceo_url: backupCeoUrl,
    },
    discovery: {
      user_id: userId,
      source_title: candidate.sourceTitle,
      source_url: candidate.sourceUrl,
      source_published_at: candidate.sourcePublishedAt,
      growth_signal: candidate.growthSignal,
      employee_count_estimate: candidate.employeeCountEstimate,
      recommended_person_title: candidate.recommendedPersonTitle,
      reason: candidate.reason,
      pitch: candidate.pitch,
      score: candidate.score,
      priority_label: candidate.priorityLabel || priorityLabelFromScore(candidate.score),
    },
    meta: {
      total_people_fetched: peopleResult.people.length,
      total_pages_fetched: peopleResult.pagesFetched,
      decision_maker_matches: peopleResult.decisionMakerCount,
      stop_reason: peopleResult.stopReason,
      fetched_at: new Date().toISOString(),
      source_company_search: SOURCE_COMPANY_SEARCH,
      source_people_provider: SOURCE_PEOPLE_PROVIDER,
      request_counters: requestCounters || createRequestCounters(),
    },
    leads: shortlist,
  }

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function toContactCandidates(shortlist) {
  if (!Array.isArray(shortlist)) return []
  return shortlist
    .map((lead) => ({
      name: String(lead?.name || '').trim(),
      title: String(lead?.title || '').trim(),
      linkedin_url: String(lead?.profile_url || '').trim(),
      location: String(lead?.location || '').trim() || null,
      email: String(lead?.email || '').trim() || null,
      phone: String(lead?.phone || '').trim() || null,
      score: Number.isFinite(Number(lead?.score)) ? Number(lead.score) : null,
      reason: String(lead?.reason || '').trim() || null,
    }))
    .filter((lead) => Boolean(lead.name || lead.linkedin_url))
}

async function persistContactCandidatesForLead({ userId, candidate, contactCandidates }) {
  const payload = {
    contact_candidates: contactCandidates,
  }
  if (contactCandidates[0]?.title) {
    payload.recommended_person_title = String(contactCandidates[0].title).slice(0, 120)
  }

  const { error } = await supabase
    .from('lead_discovery_items')
    .update(payload)
    .eq('user_id', userId)
    .eq('company_name', candidate.companyName)
    .eq('source_url', candidate.sourceUrl)

  if (!error) return
  if (/column .*contact_candidates/i.test(String(error.message || ''))) {
    console.warn('lead_discovery_items.contact_candidates saknas i databasen. Kör senaste supabase/schema.sql.')
    return
  }
  throw error
}

async function persistLinkedInCompanyMatchForLead({ userId, candidate, companyInfo }) {
  const companyId = String(companyInfo.company_id || '').trim()
  const payload = {
    linkedin_company_id: companyId,
    linkedin_company_url: companyInfo.company_url || null,
    linkedin_people_search_hr_url: buildLinkedInPeopleSearchUrl(companyId, 'HR'),
    linkedin_people_search_ceo_url: buildLinkedInPeopleSearchUrl(companyId, 'CEO'),
  }

  const { error } = await supabase
    .from('lead_discovery_items')
    .update(payload)
    .eq('user_id', userId)
    .eq('company_name', candidate.companyName)
    .eq('source_url', candidate.sourceUrl)

  if (!error) return
  if (/column .*linkedin_company_id|column .*linkedin_company_url|column .*linkedin_people_search_hr_url|column .*linkedin_people_search_ceo_url/i.test(String(error.message || ''))) {
    console.warn('lead_discovery_items.linkedin_company_* / linkedin_people_search_* saknas i databasen. Kör senaste supabase/schema.sql.')
    return
  }
  throw error
}

async function fetchUserIds() {
  const [{ data: companies, error: companiesError }, { data: contacts, error: contactsError }, { data: discovery, error: discoveryError }] = await Promise.all([
    supabase.from('companies').select('user_id'),
    supabase.from('contacts').select('user_id'),
    supabase.from('lead_discovery_items').select('user_id'),
  ])

  if (companiesError || contactsError || discoveryError) {
    throw new Error(companiesError?.message || contactsError?.message || discoveryError?.message || 'Failed to fetch user ids')
  }

  return [...new Set([...(companies || []), ...(contacts || []), ...(discovery || [])].map((row) => row.user_id).filter(Boolean))]
}

async function fetchAiProfilesByUserIds(userIds) {
  const profileMap = new Map()
  if (!userIds.length) return profileMap

  const { data, error } = await supabase
    .from('ai_profiles')
    .select('user_id, assistant_prompt, icp_description, offer_summary, priority_signals, avoid_signals, cta_style, target_titles, fallback_titles, excluded_titles, custom_instructions')
    .in('user_id', userIds)

  if (error) {
    const message = String(error.message || '')
    if (/ai_profiles/i.test(message)) {
      if (!hasWarnedMissingAiProfilesTable) {
        console.warn('ai_profiles saknas i databasen. Kor senaste supabase/schema.sql for kundspecifika AI-profiler.')
        hasWarnedMissingAiProfilesTable = true
      }
      return profileMap
    }
    throw error
  }

  for (const row of data || []) {
    if (!row?.user_id) continue
    profileMap.set(row.user_id, normalizeAiProfileInput(row))
  }

  return profileMap
}

async function fetchExistingCompanySet(userId) {
  const { data, error } = await supabase
    .from('companies')
    .select('name')
    .eq('user_id', userId)

  if (error) throw error
  return new Set((data || []).map((item) => normalizeCompanyName(item.name)).filter(Boolean))
}

async function fetchRecentDiscoverySet(userId) {
  const since = new Date(Date.now() - RECENT_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('lead_discovery_items')
    .select('company_name, source_url')
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) throw error

  const companySet = new Set()
  const pairSet = new Set()

  for (const row of data || []) {
    const normalizedCompany = normalizeCompanyName(row.company_name)
    if (normalizedCompany) companySet.add(normalizedCompany)
    if (normalizedCompany && row.source_url) {
      pairSet.add(`${normalizedCompany}|${row.source_url}`)
    }
  }

  return { companySet, pairSet }
}

function buildDiscoveryRow(userId, candidate) {
  const reasonWithPriority = `${candidate.priorityLabel ? `[${candidate.priorityLabel}] ` : ''}${candidate.reason}`.slice(0, 140)
  return {
    user_id: userId,
    company_name: candidate.companyName,
    company_domain: candidate.companyDomain,
    employee_count_estimate: candidate.employeeCountEstimate,
    growth_signal: candidate.growthSignal,
    recommended_person_title: candidate.recommendedPersonTitle,
    reason: reasonWithPriority,
    pitch: candidate.pitch,
    score: candidate.score,
    source_title: candidate.sourceTitle,
    source_url: candidate.sourceUrl,
    source_published_at: candidate.sourcePublishedAt,
    status: 'new',
  }
}

async function generateForUser(userId, candidates) {
  const existingCompanies = await fetchExistingCompanySet(userId)
  const recentDiscovery = await fetchRecentDiscoverySet(userId)

  const rows = []
  const selectedCandidates = []
  const pickedCompanies = new Set()
  const repeatPool = []
  const candidateDecisions = []
  const targetCount = Math.min(MAX_LEADS_PER_USER, Math.max(1, MIN_LEADS_TARGET))

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCompanyName(candidate.companyName)
    if (!normalizedCandidate) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'invalid_normalized_company' })
      continue
    }

    if (isLikelyExistingCompany(normalizedCandidate, existingCompanies)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'already_in_crm' })
      continue
    }

    if (recentDiscovery.companySet.has(normalizedCandidate)) {
      repeatPool.push({ candidate, normalizedCandidate, reason: 'already_suggested_recently' })
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'deferred', reason: 'already_suggested_recently' })
      continue
    }

    if (pickedCompanies.has(normalizedCandidate)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'duplicate_in_same_run' })
      continue
    }

    const pairKey = `${normalizedCandidate}|${candidate.sourceUrl}`
    if (recentDiscovery.pairSet.has(pairKey)) {
      repeatPool.push({ candidate, normalizedCandidate, reason: 'same_source_already_suggested' })
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'deferred', reason: 'same_source_already_suggested' })
      continue
    }

    rows.push(buildDiscoveryRow(userId, candidate))
    selectedCandidates.push(candidate)
    pickedCompanies.add(normalizedCandidate)
    candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'selected', reason: `passed_filters:${candidate.tier}:${candidate.score}:${candidate.confidence}` })

    if (rows.length >= MAX_LEADS_PER_USER) break
  }

  if (rows.length < targetCount && repeatPool.length) {
    for (const deferred of repeatPool) {
      if (rows.length >= targetCount || rows.length >= MAX_LEADS_PER_USER) break
      if (pickedCompanies.has(deferred.normalizedCandidate)) continue

      const repeatCandidate = {
        ...deferred.candidate,
        score: Math.max(1, deferred.candidate.score - 8),
        priorityLabel: priorityLabelFromScore(Math.max(1, deferred.candidate.score - 8)),
        reason: `[Repeat] ${deferred.candidate.reason}`.slice(0, 140),
      }

      rows.push(buildDiscoveryRow(userId, repeatCandidate))
      selectedCandidates.push(repeatCandidate)
      pickedCompanies.add(deferred.normalizedCandidate)
      candidateDecisions.push({
        companyName: repeatCandidate.companyName,
        sourceUrl: repeatCandidate.sourceUrl,
        outcome: 'selected_repeat',
        reason: `${deferred.reason}:${repeatCandidate.tier}:${repeatCandidate.score}:${repeatCandidate.confidence}`,
      })
    }
  }

  if (!rows.length) {
    return { insertedCount: 0, candidateDecisions, selectedCandidates }
  }

  const { error } = await supabase
    .from('lead_discovery_items')
    .upsert(rows, { onConflict: 'user_id,company_name,source_url', ignoreDuplicates: true })

  if (error) throw error
  return { insertedCount: rows.length, candidateDecisions, selectedCandidates }
}

async function ensureDiscoverySchema() {
  const { error } = await supabase
    .from('lead_discovery_items')
    .select('company_name, status, source_url, contact_candidates, linkedin_company_id, linkedin_company_url, linkedin_people_search_hr_url, linkedin_people_search_ceo_url')
    .limit(1)

  if (error) {
    throw new Error(
      'Database schema is outdated for AI lead discovery. Apply latest supabase/schema.sql (lead_discovery_items + contact_candidates + linkedin_company_* + linkedin_people_search_*).'
    )
  }
}

async function runCompanyPeopleFlow(userId, selectedCandidates, aiProfileInput = DEFAULT_AI_PROFILE) {
  if (!selectedCandidates.length) return { generatedFiles: 0, failedFiles: 0 }
  if (!RAPIDAPI_KEYS.length) {
    console.log(`User ${userId}: skipped company->people flow (no RapidAPI keys configured).`)
    return { generatedFiles: 0, failedFiles: selectedCandidates.length }
  }

  const titleStrategy = buildPersonTitleStrategy(aiProfileInput)

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  let generatedFiles = 0
  let failedFiles = 0
  const peopleEnrichmentLimit = Math.min(COMPANY_PEOPLE_MAX_CANDIDATES, selectedCandidates.length)

  if (selectedCandidates.length > peopleEnrichmentLimit) {
    console.log(
      `User ${userId}: company match/LinkedIn URLs will run for ${selectedCandidates.length} candidates. People enrichment limited to ${peopleEnrichmentLimit}/${selectedCandidates.length} (COMPANY_PEOPLE_MAX_CANDIDATES=${COMPANY_PEOPLE_MAX_CANDIDATES}).`
    )
  }

  for (let index = 0; index < selectedCandidates.length; index += 1) {
    const candidate = selectedCandidates[index]
    try {
      console.log(`[FLOW] ${index + 1}/${selectedCandidates.length} start: ${candidate.companyName}`)
      const requestCounters = createRequestCounters()
      const deadlineMs = Date.now() + COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS

      // eslint-disable-next-line no-await-in-loop
      const companyInfo = await findCompanyForLead(candidate.companyName, requestCounters, deadlineMs)
      if (!companyInfo?.company_id) {
        failedFiles += 1
        console.log(`- ${candidate.companyName}: no company_id found`)
        continue
      }

      // Save LinkedIn company + people search URLs as soon as company match is found.
      // This keeps manual HR search available even if people enrichment fails later.
      // eslint-disable-next-line no-await-in-loop
      await persistLinkedInCompanyMatchForLead({
        userId,
        candidate,
        companyInfo,
      })

      if (index >= peopleEnrichmentLimit) {
        console.log(`- ${companyInfo.name}: linked company match saved, skipped people enrichment due cap`)
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const peopleResult = await fetchCompanyPeople(companyInfo.company_id, companyInfo.name, requestCounters, deadlineMs, titleStrategy)
      const shortlist = buildShortlistFromPeople(peopleResult.people, titleStrategy)
      const contactCandidates = toContactCandidates(shortlist)
      const fileName = `${slugify(companyInfo.name)}_${companyInfo.company_id}_ai_leads.json`
      const outputPath = path.join(OUTPUT_DIR, fileName)

      // eslint-disable-next-line no-await-in-loop
      await writeAiLeadsFile({
        userId,
        candidate,
        companyInfo,
        peopleResult,
        shortlist,
        outputPath,
        requestCounters,
      })
      // eslint-disable-next-line no-await-in-loop
      await persistContactCandidatesForLead({
        userId,
        candidate,
        contactCandidates,
      })

      generatedFiles += 1
      console.log(
        `- ${companyInfo.name}: ai_leads.json generated (pages=${peopleResult.pagesFetched}, people=${peopleResult.people.length}, shortlist=${shortlist.length}, stop=${peopleResult.stopReason}, calls=${requestCounters.total_request_attempts})`
      )
    } catch (error) {
      failedFiles += 1
      console.error(`- ${candidate.companyName}: company->people flow failed:`, error.message)
    }
  }

  return { generatedFiles, failedFiles }
}

async function main() {
  console.log('Generating AI discovery leads (news lookback + company people flow)...')
  console.log(`Discovery config: lookback_days=${LOOKBACK_DAYS}, max_articles=${MAX_SOURCE_ARTICLES}, newsapi=${DISCOVERY_INCLUDE_NEWSAPI}, google_rss=${DISCOVERY_INCLUDE_GOOGLE_RSS}`)
  console.log(`Discovery queries (${DISCOVERY_QUERIES.length}): ${DISCOVERY_QUERIES.join(' || ')}`)
  await ensureDiscoverySchema()
  const [allUserIds, articles] = await Promise.all([fetchUserIds(), fetchDiscoveryArticles()])
  const userIds = LEADS_USER_ID
    ? allUserIds.filter((userId) => userId === LEADS_USER_ID)
    : allUserIds

  if (LEADS_USER_ID) {
    console.log(`Lead generation scoped to user: ${LEADS_USER_ID}`)
  }

  if (!userIds.length) {
    if (LEADS_USER_ID) {
      console.log(`No CRM data found for scoped user ${LEADS_USER_ID}.`)
    } else {
      console.log('No users found with CRM data.')
    }
    return
  }

  if (!articles.length) {
    console.log('No discovery articles found.')
    return
  }

  const aiProfilesByUser = await fetchAiProfilesByUserIds(userIds)
  console.log(`Fetched ${articles.length} discovery articles`)
  console.log(`Loaded AI profiles for ${aiProfilesByUser.size}/${userIds.length} users (others use default profile).`)

  const candidatePoolCache = new Map()

  let totalInserted = 0
  let totalGeneratedAiFiles = 0
  let totalFailedAiFiles = 0
  for (const userId of userIds) {
    try {
      const profile = aiProfilesByUser.get(userId) || DEFAULT_AI_PROFILE
      const profileKey = JSON.stringify(profile)
      let extraction = candidatePoolCache.get(profileKey)

      if (!extraction) {
        // eslint-disable-next-line no-await-in-loop
        extraction = await extractCandidatesFromArticles(articles, profile)
        candidatePoolCache.set(profileKey, extraction)
        const summary = summarizeCandidatePool(extraction.candidates)
        console.log(
          `Candidate pool (profile cache miss): total=${summary.total}, strict=${summary.strict}, relaxed=${summary.relaxed}, watchlist=${summary.watchlist}`
        )
      }

      if (LEADS_DEBUG) {
        console.log(`[DEBUG] Prompt profile used for user ${userId}:`)
        console.log(aiProfileToPrompt(profile))
        console.log(`[DEBUG] Article decisions for user ${userId}:`)
        for (const decision of extraction.articleDecisions) {
          console.log(
            `- ${decision.outcome.toUpperCase()} | ${decision.reason} | ${decision.title}${decision.companyName ? ` | company=${decision.companyName}` : ''}`
          )
        }
      }

      if (!extraction.candidates.length) {
        console.log(`User ${userId}: no valid candidates after profile-aware filtering.`)
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const { insertedCount, candidateDecisions, selectedCandidates } = await generateForUser(userId, extraction.candidates)
      totalInserted += insertedCount
      console.log(`User ${userId}: inserted ${insertedCount} discovery leads`)

      // eslint-disable-next-line no-await-in-loop
      const { generatedFiles, failedFiles } = await runCompanyPeopleFlow(userId, selectedCandidates, profile)
      totalGeneratedAiFiles += generatedFiles
      totalFailedAiFiles += failedFiles

      if (LEADS_DEBUG) {
        console.log(`[DEBUG] User ${userId} candidate decisions:`)
        for (const decision of candidateDecisions) {
          console.log(`- ${decision.outcome.toUpperCase()} | ${decision.reason} | ${decision.companyName} | ${decision.sourceUrl}`)
        }
      }
    } catch (error) {
      console.error(`Failed generating leads for user ${userId}:`, error.message)
    }
  }

  console.log(
    `Lead generation done. New discovery leads inserted: ${totalInserted}. AI leads files generated: ${totalGeneratedAiFiles}. Failed company->people: ${totalFailedAiFiles}.`
  )
}

main().catch((error) => {
  console.error('Unexpected error in generate-leads:', error.message)
  process.exit(1)
})
