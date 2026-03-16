/**
 * Lead generation - company search and people fetching
 */

import fs from 'fs/promises'
import path from 'path'
import {
  COMPANY_SEARCH_HOST,
  COMPANY_SEARCH_URL,
  PEOPLE_HOST,
  PEOPLE_URL,
  COMPANY_SEARCH_MAX_PAGES,
  PEOPLE_MAX_PAGES,
  PEOPLE_MAX_TOTAL,
  PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP,
  PEOPLE_TARGET_DECISION_MAKERS,
  STRICT_SWEDEN_ONLY,
  SHORTLIST_LIMIT,
  SOURCE_PEOPLE_PROVIDER,
  SWEDEN_SIGNALS,
  OUTPUT_DIR,
} from './config.js'
import {
  requestRapidApi,
  ensureBeforeDeadline,
  sleepWithDeadline,
  randomInt,
  normalizeForLookup,
  firstNonEmptyString,
  sleep,
} from './utils.js'
import { buildPersonTitleStrategy } from './analyzer.js'
import { DEFAULT_AI_PROFILE } from './config.js'

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

  let score = 0
  const swedishLocation = SWEDEN_SIGNALS.some((term) => location.includes(term))
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
  return SWEDEN_SIGNALS.some((term) => location.includes(term)) || /\/company\/.*(ab|sverige|sweden)/.test(companyUrl)
}

export async function findCompanyForLead(companyName, requestCounters, deadlineMs = null) {
  const byId = new Map()
  for (let pageNumber = 1; pageNumber <= COMPANY_SEARCH_MAX_PAGES; pageNumber += 1) {
    ensureBeforeDeadline(deadlineMs, 'company_search:before_page')
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

export function normalizeLeadPerson(rawPerson, companyId, companyName, page, requestCounters) {
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

export function scoreLeadTitle(titleRaw, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  const title = normalizeForLookup(titleRaw).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()

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

function titleIncludesAny(normalizedTitle, terms) {
  return terms.some((term) => term && normalizedTitle.includes(term))
}

export function isDecisionMaker(titleRaw, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
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

export async function fetchCompanyPeople(companyId, companyName, requestCounters, deadlineMs = null, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
  const peopleByUrl = new Map()
  let pagesFetched = 0
  let decisionMakerCount = 0
  let stopReason = 'completed'

  for (let page = 1; page <= PEOPLE_MAX_PAGES; page += 1) {
    ensureBeforeDeadline(deadlineMs, 'company_people:before_page')
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
        await sleep(randomInt(1200, 2500))
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

    await sleepWithDeadline(randomInt(300, 1200), deadlineMs, 'company_people:between_pages_sleep')
  }

  return {
    people: [...peopleByUrl.values()],
    pagesFetched,
    decisionMakerCount,
    stopReason,
  }
}

export function buildShortlistFromPeople(people, titleStrategy = buildPersonTitleStrategy(DEFAULT_AI_PROFILE)) {
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

export function buildDiscoveryRow(userId, candidate) {
  return {
    user_id: userId,
    company_name: candidate.companyName,
    company_domain: candidate.companyDomain || null,
    employee_count_estimate: candidate.employeeCountEstimate || null,
    growth_signal: candidate.growthSignal || null,
    recommended_person_title: candidate.recommendedPersonTitle || null,
    reason: candidate.reason,
    pitch: candidate.pitch,
    score: candidate.score,
    source_title: candidate.sourceTitle,
    source_url: candidate.sourceUrl,
    source_published_at: candidate.sourcePublishedAt,
  }
}

export async function writeAiLeadsFile({
  userId,
  candidate,
  companyInfo,
  peopleResult,
  shortlist,
  outputPath,
  requestCounters,
}) {
  const { buildLinkedInPeopleSearchUrl } = await import('./analyzer.js')
  const { createRequestCounters } = await import('./config.js')
  const { priorityLabelFromScore } = await import('./utils.js')

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
      source_company_search: 'linkedin-jobs-data-api',
      source_people_provider: SOURCE_PEOPLE_PROVIDER,
      request_counters: requestCounters || createRequestCounters(),
    },
    leads: shortlist,
  }

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export function toContactCandidates(shortlist) {
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
