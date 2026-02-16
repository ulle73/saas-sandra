import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ensureEnvLoaded } from './scripts/load-env.js'

ensureEnvLoaded()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_DIR = path.join(__dirname, 'output')
const LOGS_DIR = path.join(__dirname, 'logs')

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
].filter((value) => Boolean(value) && !String(value).startsWith('KEY'))

const COMPANY_SEARCH_HOST = 'linkedin-jobs-data-api.p.rapidapi.com'
const COMPANY_SEARCH_URL = `https://${COMPANY_SEARCH_HOST}/companies/search`

const PEOPLE_HOST = 'fresh-linkedin-scraper-api.p.rapidapi.com'
const PEOPLE_URL = `https://${PEOPLE_HOST}/api/v1/company/people`

const MAX_RETRIES = 2
const REQUEST_TIMEOUT_MS = Number(process.env.RAPIDAPI_TIMEOUT_MS || 30000)
const COMPANY_SEARCH_MAX_PAGES = 5
const MAX_PAGES = Number(process.env.PEOPLE_MAX_PAGES || 200)
const MAX_TOTAL_PEOPLE = Number(process.env.PEOPLE_MAX_TOTAL || 1500)
const MIN_PAGES_BEFORE_EARLY_STOP = Number(process.env.PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP || 20)
const TARGET_DECISION_MAKERS = Number(process.env.PEOPLE_TARGET_DECISION_MAKERS || 4)
const DEBUG_SAVE_RAW_PAGES = (process.env.PEOPLE_DEBUG_SAVE_RAW_PAGES || 'false').toLowerCase() === 'true'
const MIN_PAGE_DELAY_MS = 300
const MAX_PAGE_DELAY_MS = 1200
const SHORTLIST_LIMIT = Math.max(10, Math.min(25, Number(process.env.SHORTLIST_LIMIT || 15)))
const LOOP_DUPLICATE_THRESHOLD = 0.8
const STRICT_SWEDEN_ONLY = (process.env.STRICT_SWEDEN_ONLY || 'true').toLowerCase() === 'true'

const SOURCE_COMPANY_SEARCH = 'linkedin-jobs-data-api'
const SOURCE_PEOPLE_PROVIDER = 'fresh-linkedin-scraper-api'

const SUMMARY = {
  requestAttemptsTotal: 0,
  requestAttemptsCompanySearch: 0,
  requestAttemptsCompanyPeople: 0,
  companySearchRequests: 0,
  peopleRequests: 0,
  retries: 0,
  totalErrors: 0,
  droppedWithoutProfileUrl: 0,
}

if (!RAPIDAPI_KEYS.length) {
  console.error('Missing RapidAPI keys. Set RAPIDAPI_KEYS or RAPIDAPI_KEY_1..10 in env.')
  process.exit(1)
}

const keyword = process.argv.slice(2).join(' ').trim()
if (!keyword) {
  console.error('Usage: node companyPeopleToLeads.js "company keyword"')
  process.exit(1)
}

const runDate = new Date().toISOString().slice(0, 10)
const logFilePath = path.join(LOGS_DIR, `run_${runDate}.log`)

let keyCursor = 0

function nextKey() {
  const keyIndex = keyCursor
  const key = RAPIDAPI_KEYS[keyCursor]
  keyCursor = (keyCursor + 1) % RAPIDAPI_KEYS.length
  return { key, keyIndex }
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

function nowIso() {
  return new Date().toISOString()
}

function lineValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value).replace(/\s+/g, ' ').trim()
}

async function writeLog(data) {
  const line = [
    nowIso(),
    `step=${lineValue(data.step)}`,
    `host=${lineValue(data.host)}`,
    `endpoint=${lineValue(data.endpoint)}`,
    `company_id=${lineValue(data.companyId)}`,
    `page=${lineValue(data.page)}`,
    `keyIndex=${lineValue(data.keyIndex)}`,
    `status=${lineValue(data.statusCode)}`,
    `latency_ms=${lineValue(data.latencyMs)}`,
    `retries=${lineValue(data.retries)}`,
    `error="${lineValue(data.error)}"`,
  ].join(' | ')

  await fs.appendFile(logFilePath, `${line}\n`, 'utf8')
}

async function writeJson(filePath, payload) {
  const content = JSON.stringify(payload, null, 2)
  await fs.writeFile(filePath, `${content}\n`, 'utf8')
}

function getPathValue(obj, pathString) {
  if (!obj || !pathString) return undefined
  const parts = pathString.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function firstArrayByPaths(payload, paths) {
  for (const pathString of paths) {
    const value = getPathValue(payload, pathString)
    if (Array.isArray(value)) return value
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
  const safeIdentifier = identifier.replace(/^\/+|\/+$/g, '')
  return normalizeProfileUrl(`https://www.linkedin.com/in/${safeIdentifier}`)
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePerson(rawPerson, company, pageNumber) {
  const profileUrl = buildProfileUrlFromRaw(rawPerson)
  if (!profileUrl) {
    SUMMARY.droppedWithoutProfileUrl += 1
    return null
  }

  const firstName = String(rawPerson?.first_name || rawPerson?.firstName || '').trim()
  const lastName = String(rawPerson?.last_name || rawPerson?.lastName || '').trim()
  const joinedName = `${firstName} ${lastName}`.trim()

  const fullName = String(
    rawPerson?.full_name
      || rawPerson?.fullName
      || rawPerson?.name
      || rawPerson?.display_name
      || joinedName
      || ''
  ).trim()

  const title = String(
    rawPerson?.title
      || rawPerson?.headline
      || rawPerson?.job_title
      || rawPerson?.position
      || rawPerson?.occupation
      || ''
  ).replace(/\s+/g, ' ').trim()

  const location = String(
    rawPerson?.location
      || rawPerson?.geo_location
      || rawPerson?.city
      || rawPerson?.country
      || ''
  ).replace(/\s+/g, ' ').trim()

  return {
    company_id: company.id,
    company_name: company.name,
    profile_url: profileUrl,
    full_name: fullName || null,
    title: title || null,
    title_normalized: normalizeTitle(title),
    location: location || null,
    source_provider: SOURCE_PEOPLE_PROVIDER,
    fetched_at: nowIso(),
    page_found: pageNumber,
  }
}

function extractCompanyCandidates(payload) {
  if (!payload) return []
  const byPath = firstArrayByPaths(payload, [
    'data.companies',
    'companies',
    'data.results',
    'results',
    'data.items',
    'items',
    'data.data',
    'data',
  ])
  if (byPath) return byPath
  return extractPossibleArrayFallback(payload)
}

function normalizeCompany(raw) {
  const id = String(
    raw?.company_id
      || raw?.companyId
      || raw?.id
      || raw?.urn_id
      || raw?.urnId
      || raw?.entity_id
      || ''
  ).trim()

  const name = String(
    raw?.name
      || raw?.company_name
      || raw?.companyName
      || raw?.title
      || ''
  ).trim()

  if (!id || !name) return null

  const location = String(
    raw?.location
      || raw?.headquarters
      || raw?.hq_location
      || raw?.hqLocation
      || raw?.country
      || ''
  ).trim()

  const companyUrl = String(
    raw?.company_url
      || raw?.linkedin_url
      || raw?.url
      || raw?.companyUrl
      || ''
  ).trim()

  return {
    id,
    name,
    location: location || null,
    company_url: companyUrl || null,
  }
}

function scoreCompany(company, keywordValue) {
  const keywordNorm = normalizeForLookup(keywordValue)
  const nameNorm = normalizeForLookup(company.name)
  const locationNorm = normalizeForLookup(company.location)
  const companyUrlNorm = normalizeForLookup(company.company_url)

  const swedenSignals = [
    'sweden',
    'sverige',
    'orebro',
    'stockholm',
    'gothenburg',
    'goteborg',
    'malmo',
    'uppsala',
    'linkoping',
    'orebro',
    'vasteras',
    'lund',
    'jonkoping',
    'helsingborg',
    'norrkoping',
    'umea',
  ]

  const isSwedishByLocation = swedenSignals.some((term) => locationNorm.includes(term))
  const isSwedishByUrl = /\/company\/.*(ab|sverige|sweden)/.test(companyUrlNorm)
  const isSwedishCandidate = isSwedishByLocation || isSwedishByUrl

  let score = 0
  if (isSwedishByLocation) score += 120
  else if (isSwedishByUrl) score += 70

  if (nameNorm === keywordNorm) score += 60
  else if (nameNorm.includes(keywordNorm) || keywordNorm.includes(nameNorm)) score += 35
  else {
    const keywordParts = keywordNorm.split(/\s+/).filter(Boolean)
    const overlap = keywordParts.filter((part) => nameNorm.includes(part)).length
    score += overlap * 8
  }

  if (company.company_url) score += 5
  return {
    score,
    isSwedishCandidate,
  }
}

function chooseBestCompany(candidates, keywordValue) {
  if (!candidates.length) return null

  const ranked = candidates
    .map((company) => {
      const result = scoreCompany(company, keywordValue)
      return {
        ...company,
        _score: result.score,
        _isSwedishCandidate: result.isSwedishCandidate,
      }
    })
    .sort((a, b) => b._score - a._score || a.name.length - b.name.length)

  const swedishRanked = ranked.filter((company) => company._isSwedishCandidate)
  if (swedishRanked.length) return swedishRanked[0]

  if (STRICT_SWEDEN_ONLY) return null
  return ranked[0]
}

function buildBackupSearchUrl(companyId, keywordValue) {
  const currentCompany = encodeURIComponent(JSON.stringify([companyId]))
  const keywords = encodeURIComponent(keywordValue)
  return `https://www.linkedin.com/search/results/people/?keywords=${keywords}&currentCompany=${currentCompany}`
}

function extractPeople(payload) {
  if (!payload) return []
  const byPath = firstArrayByPaths(payload, [
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
      if (typeof nextPage === 'number' && Number.isNaN(nextPage)) nextPage = null
    }
    if (totalPages === null) {
      totalPages = container.total_pages ?? container.totalPages ?? container.last_page ?? null
      if (typeof totalPages === 'string' && /^\d+$/.test(totalPages)) totalPages = Number(totalPages)
      if (typeof totalPages === 'number' && Number.isNaN(totalPages)) totalPages = null
    }
  }

  return { hasMore, nextPage, totalPages }
}

function isRetriable(error, statusCode) {
  if (statusCode === 429) return true
  if (statusCode >= 500) return true
  if (error?.code === 'ECONNABORTED') return true
  if (/timeout/i.test(String(error?.message || ''))) return true
  return false
}

async function requestRapidApi({ step, host, url, params, companyId = null, page = null }) {
  const endpoint = new URL(url).pathname

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    SUMMARY.requestAttemptsTotal += 1
    if (step === 'company_search') SUMMARY.requestAttemptsCompanySearch += 1
    if (step === 'company_people') SUMMARY.requestAttemptsCompanyPeople += 1

    const { key, keyIndex } = nextKey()
    const startedAt = Date.now()

    try {
      const response = await axios({
        method: 'GET',
        url,
        params,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: {
          'x-rapidapi-host': host,
          'x-rapidapi-key': key,
        },
      })

      const latencyMs = Date.now() - startedAt
      const statusCode = response.status

      await writeLog({
        step,
        host,
        endpoint,
        companyId,
        page,
        keyIndex,
        statusCode,
        latencyMs,
        retries: attempt,
        error: '',
      })

      if (step === 'company_search') SUMMARY.companySearchRequests += 1
      if (step === 'company_people') SUMMARY.peopleRequests += 1

      if (statusCode >= 200 && statusCode < 300) {
        return response.data
      }

      const retriable = isRetriable(null, statusCode)
      if (!retriable || attempt === MAX_RETRIES) {
        throw new Error(`Request failed with status ${statusCode}`)
      }

      SUMMARY.retries += 1
      if (statusCode === 429) {
        await sleep(randomInt(30000, 60000))
      } else {
        await sleep(randomInt(1200, 3000))
      }
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      const statusCode = error?.response?.status || 'ERR'
      const retriable = isRetriable(error, Number(statusCode))

      await writeLog({
        step,
        host,
        endpoint,
        companyId,
        page,
        keyIndex,
        statusCode,
        latencyMs,
        retries: attempt,
        error: error?.message || 'Unknown error',
      })

      SUMMARY.totalErrors += 1
      if (!retriable || attempt === MAX_RETRIES) {
        throw error
      }

      SUMMARY.retries += 1
      if (Number(statusCode) === 429) {
        await sleep(randomInt(30000, 60000))
      } else {
        await sleep(randomInt(1200, 3000))
      }
    }
  }

  throw new Error('Unexpected request loop exit')
}

function titleHasExecutiveException(titleNormalized) {
  return /(ceo|chief executive|vd|managing director|founder|co[- ]?founder|president)/.test(titleNormalized)
}

function scoreLead(titleRaw) {
  const title = normalizeTitle(titleRaw)

  const negativeKeywords = [
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

  if (negativeKeywords.some((term) => title.includes(term))) {
    return { score: -999, reason: 'Excluded: junior or internship style role' }
  }

  const hasConsultant = title.includes('consultant') || title.includes('consulting')
  if (hasConsultant && !titleHasExecutiveException(title)) {
    return { score: -999, reason: 'Excluded: consultant role' }
  }

  if (/(ceo|chief executive|vd|managing director|founder|co[- ]?founder)/.test(title)) {
    return { score: 4, reason: 'Executive leadership match' }
  }

  if (/(chro|head of hr|hr director|head of people|vp people)/.test(title)) {
    return { score: 4, reason: 'Senior HR leadership match' }
  }

  if (/(hr manager|people & culture manager|people and culture manager|talent acquisition lead)/.test(title)) {
    return { score: 3, reason: 'HR manager level match' }
  }

  if (/(recruiter|talent acquisition specialist)/.test(title)) {
    return { score: 1, reason: 'Recruiting role match' }
  }

  return { score: 0, reason: 'No priority title keyword match' }
}

async function loadState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function loadExistingPeople(peoplePath) {
  try {
    const raw = await fs.readFile(peoplePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function findCompany(keywordValue) {
  const uniqueMap = new Map()

  for (let pageNumber = 1; pageNumber <= COMPANY_SEARCH_MAX_PAGES; pageNumber += 1) {
    const payload = await requestRapidApi({
      step: 'company_search',
      host: COMPANY_SEARCH_HOST,
      url: COMPANY_SEARCH_URL,
      params: { keyword: keywordValue, page_number: pageNumber },
      page: pageNumber,
    })

    const candidates = extractCompanyCandidates(payload).map(normalizeCompany).filter(Boolean)
    for (const candidate of candidates) {
      if (!uniqueMap.has(candidate.id)) uniqueMap.set(candidate.id, candidate)
    }
  }

  return chooseBestCompany([...uniqueMap.values()], keywordValue)
}

async function fetchAllPeopleForCompany(company, paths) {
  const existingState = await loadState(paths.statePath)
  const existingPeople = await loadExistingPeople(paths.peoplePath)

  const dedupedPeople = new Map()
  for (const person of existingPeople) {
    const key = normalizeProfileUrl(person.profile_url)
    if (!key) continue
    dedupedPeople.set(key, person)
  }

  let startPage = 1
  if (existingState?.company_id === company.id && Number(existingState.last_page_fetched) > 0) {
    startPage = Number(existingState.last_page_fetched) + 1
  }

  let pagesFetchedThisRun = 0
  let lastPageFetched = Math.max(0, startPage - 1)
  let stopReason = 'completed'
  let priorityDecisionMakerCount = 0

  for (let pageNumber = startPage; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const payload = await requestRapidApi({
      step: 'company_people',
      host: PEOPLE_HOST,
      url: PEOPLE_URL,
      params: {
        company_id: company.id,
        page: pageNumber,
      },
      companyId: company.id,
      page: pageNumber,
    })

    if (DEBUG_SAVE_RAW_PAGES && paths.rawPagesDir) {
      await fs.mkdir(paths.rawPagesDir, { recursive: true })
      const rawPagePath = path.join(paths.rawPagesDir, `page_${String(pageNumber).padStart(4, '0')}.json`)
      await writeJson(rawPagePath, payload)
    }

    const rawPeople = extractPeople(payload)
    if (!rawPeople.length) {
      stopReason = 'empty_page'
      break
    }

    let pageUniqueCount = 0
    let pageDuplicateCount = 0
    let pageTotalNormalized = 0

    for (const rawPerson of rawPeople) {
      const person = normalizePerson(rawPerson, company, pageNumber)
      if (!person) continue

      pageTotalNormalized += 1
      const dedupeKey = normalizeProfileUrl(person.profile_url)
      if (!dedupeKey) continue

      if (dedupedPeople.has(dedupeKey)) {
        pageDuplicateCount += 1
        continue
      }

      dedupedPeople.set(dedupeKey, person)
      pageUniqueCount += 1

      if (isPriorityDecisionMaker(person.title || person.headline || '')) {
        priorityDecisionMakerCount += 1
      }
    }

    pagesFetchedThisRun += 1
    lastPageFetched = pageNumber

    await writeJson(paths.peoplePath, [...dedupedPeople.values()])
    await writeJson(paths.statePath, {
      company_id: company.id,
      company_name: company.name,
      last_page_fetched: pageNumber,
      total_people_so_far: dedupedPeople.size,
      updated_at: nowIso(),
      completed: false,
    })

    if (!pageTotalNormalized) {
      stopReason = 'page_without_normalized_profiles'
      break
    }

    const duplicateRatio = pageDuplicateCount / pageTotalNormalized
    if (duplicateRatio > LOOP_DUPLICATE_THRESHOLD) {
      stopReason = `loop_detect_duplicate_ratio_${duplicateRatio.toFixed(2)}`
      break
    }

    const hints = extractPaginationHints(payload)
    if (typeof hints.hasMore === 'boolean' && !hints.hasMore) {
      stopReason = 'has_more_false'
      break
    }

    if (typeof hints.totalPages === 'number' && pageNumber >= hints.totalPages) {
      stopReason = 'total_pages_exhausted'
      break
    }

    if (typeof hints.nextPage === 'number') {
      if (hints.nextPage <= pageNumber) {
        stopReason = 'next_page_not_forward'
        break
      }
      if (hints.nextPage > pageNumber + 1) {
        pageNumber = hints.nextPage - 1
      }
    }

    if (
      pageNumber >= MIN_PAGES_BEFORE_EARLY_STOP
      && priorityDecisionMakerCount >= TARGET_DECISION_MAKERS
    ) {
      stopReason = 'priority_target_reached'
      break
    }

    if (MAX_TOTAL_PEOPLE > 0 && dedupedPeople.size >= MAX_TOTAL_PEOPLE) {
      stopReason = 'max_total_people_reached'
      break
    }

    if (pageNumber >= MAX_PAGES) {
      stopReason = 'safety_cap_reached'
      break
    }

    await sleep(randomInt(MIN_PAGE_DELAY_MS, MAX_PAGE_DELAY_MS))
  }

  await writeJson(paths.statePath, {
    company_id: company.id,
    company_name: company.name,
    last_page_fetched: lastPageFetched,
    total_people_so_far: dedupedPeople.size,
    updated_at: nowIso(),
    completed: true,
    stop_reason: stopReason,
  })

  return {
    people: [...dedupedPeople.values()],
    pagesFetched: pagesFetchedThisRun,
    lastPageFetched,
    stopReason,
    priorityDecisionMakerCount,
  }
}

function buildShortlist(people) {
  const scored = people
    .map((person) => {
      const evaluation = scoreLead(person.title || person.headline || '')
      return {
        person,
        score: evaluation.score,
        reason: evaluation.reason,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.person.full_name || '').localeCompare(String(b.person.full_name || '')))

  return scored.slice(0, SHORTLIST_LIMIT).map((entry) => ({
    name: entry.person.full_name || '',
    title: entry.person.title || '',
    profile_url: entry.person.profile_url,
    location: entry.person.location || '',
    score: entry.score,
    reason: entry.reason,
  }))
}

function isPriorityDecisionMaker(titleRaw) {
  const evaluation = scoreLead(titleRaw)
  return evaluation.score >= 3
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.mkdir(LOGS_DIR, { recursive: true })

  await fs.appendFile(logFilePath, `\n==== Run started ${nowIso()} keyword="${keyword}" ====\n`, 'utf8')

  console.log(`Searching company for keyword: "${keyword}"`)
  const company = await findCompany(keyword)
  if (!company) {
    if (STRICT_SWEDEN_ONLY) {
      throw new Error(`No Swedish company match found for keyword "${keyword}" (STRICT_SWEDEN_ONLY=true).`)
    }
    throw new Error(`No company found for keyword "${keyword}"`)
  }

  const slug = slugify(company.name) || slugify(keyword) || 'company'
  const baseFileName = `${slug}_${company.id}`

  const statePath = path.join(OUTPUT_DIR, `${baseFileName}_state.json`)
  const peoplePath = path.join(OUTPUT_DIR, `${baseFileName}_people_all.json`)
  const shortlistPath = path.join(OUTPUT_DIR, `${baseFileName}_leads_shortlist.json`)
  const aiLeadsPath = path.join(OUTPUT_DIR, `${baseFileName}_ai_leads.json`)
  const rawPagesDir = path.join(OUTPUT_DIR, `${baseFileName}_raw_pages`)

  const backupHrUrl = buildBackupSearchUrl(company.id, 'HR')
  const backupCeoUrl = buildBackupSearchUrl(company.id, 'CEO')

  console.log(`Selected company: ${company.name} (${company.id})`)
  console.log(`Location: ${company.location || '-'}`)
  console.log(`Company URL: ${company.company_url || '-'}`)
  console.log(`Backup HR URL: ${backupHrUrl}`)
  console.log(`Backup CEO URL: ${backupCeoUrl}`)

  const fetchResult = await fetchAllPeopleForCompany(company, { statePath, peoplePath, rawPagesDir })
  const shortlist = buildShortlist(fetchResult.people)

  await writeJson(shortlistPath, shortlist)

  const aiPayload = {
    company: {
      id: company.id,
      name: company.name,
      location: company.location || null,
      company_url: company.company_url || null,
      backup_hr_url: backupHrUrl,
      backup_ceo_url: backupCeoUrl,
    },
    meta: {
      total_people_fetched: fetchResult.people.length,
      total_pages_fetched: fetchResult.pagesFetched,
      fetched_at: nowIso(),
      source_company_search: SOURCE_COMPANY_SEARCH,
      source_people_provider: SOURCE_PEOPLE_PROVIDER,
      stop_reason: fetchResult.stopReason,
      request_counters: {
        total_request_attempts: SUMMARY.requestAttemptsTotal,
        request_attempts_company_search: SUMMARY.requestAttemptsCompanySearch,
        request_attempts_company_people: SUMMARY.requestAttemptsCompanyPeople,
        company_search_requests: SUMMARY.companySearchRequests,
        people_requests: SUMMARY.peopleRequests,
        retries: SUMMARY.retries,
        errors: SUMMARY.totalErrors,
        dropped_without_profile_url: SUMMARY.droppedWithoutProfileUrl,
      },
      decision_maker_matches: fetchResult.priorityDecisionMakerCount,
    },
    leads: shortlist,
  }

  await writeJson(aiLeadsPath, aiPayload)

  const summaryLines = [
    `Summary keyword="${keyword}"`,
    `company_id=${company.id}`,
    `company_name=${company.name}`,
    `total_people=${fetchResult.people.length}`,
    `pages_fetched=${fetchResult.pagesFetched}`,
    `shortlist_count=${shortlist.length}`,
    `stop_reason=${fetchResult.stopReason}`,
    `decision_maker_matches=${fetchResult.priorityDecisionMakerCount}`,
    `total_request_attempts=${SUMMARY.requestAttemptsTotal}`,
    `request_attempts_company_search=${SUMMARY.requestAttemptsCompanySearch}`,
    `request_attempts_company_people=${SUMMARY.requestAttemptsCompanyPeople}`,
    `company_search_requests=${SUMMARY.companySearchRequests}`,
    `people_requests=${SUMMARY.peopleRequests}`,
    `retries=${SUMMARY.retries}`,
    `errors=${SUMMARY.totalErrors}`,
    `dropped_without_profile_url=${SUMMARY.droppedWithoutProfileUrl}`,
    `output_people=${peoplePath}`,
    `output_shortlist=${shortlistPath}`,
    `output_ai_payload=${aiLeadsPath}`,
  ]
  const summaryText = summaryLines.join(' | ')
  const apiCallsLine = `API_CALLS_USED total=${SUMMARY.requestAttemptsTotal} search=${SUMMARY.requestAttemptsCompanySearch} people=${SUMMARY.requestAttemptsCompanyPeople} retries=${SUMMARY.retries} errors=${SUMMARY.totalErrors}`

  console.log(summaryText)
  console.log(apiCallsLine)
  await fs.appendFile(logFilePath, `${summaryText}\n${apiCallsLine}\n==== Run finished ${nowIso()} ====\n`, 'utf8')
}

main().catch(async (error) => {
  const message = error?.message || String(error)
  console.error(`Run failed: ${message}`)
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true })
    await fs.appendFile(
      logFilePath,
      `FAIL ${nowIso()} | keyword="${keyword}" | error="${lineValue(message)}"\n`,
      'utf8'
    )
  } catch {
    // ignore logging failure
  }
  process.exit(1)
})
