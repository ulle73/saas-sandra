import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { ensureEnvLoaded } from './load-env.js'

ensureEnvLoaded()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const NEWSAPI_KEY = process.env.NEWSAPI_KEY

const MAX_LEADS_PER_USER = parsePositiveInt(process.env.LEADS_MAX_PER_USER, 10, 1, 25)
const LOOKBACK_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_LOOKBACK_DAYS, 7, 1, 30)
const MAX_SOURCE_ARTICLES = parsePositiveInt(process.env.LEADS_DISCOVERY_MAX_ARTICLES, 40, 10, 100)
const OPENAI_MODEL = process.env.LEADS_DISCOVERY_MODEL || 'gpt-4o-mini'
const LEADS_DEBUG = String(process.env.LEADS_DEBUG || 'false').toLowerCase() === 'true'
const RECENT_DUPLICATE_WINDOW_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_DUPLICATE_WINDOW_DAYS, 60, 14, 180)

const DISCOVERY_QUERIES = [
  '"rekryterar" OR "anstaller" OR "Head of People" OR "HR-chef"',
  '"expanderar" OR "vaxer" OR "nytt kontor" OR "investering"',
  '"stororder" OR "nytt avtal" OR partnerskap OR upphandling',
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

  for (const query of DISCOVERY_QUERIES) {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&apiKey=${NEWSAPI_KEY}&searchIn=title,description&language=sv&from=${fromDate}&sortBy=publishedAt&pageSize=${MAX_SOURCE_ARTICLES}`
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(url)
    // eslint-disable-next-line no-await-in-loop
    const payload = await response.json()

    if (!response.ok) {
      console.error(`NewsAPI error for query "${query}":`, payload.message || response.statusText)
      continue
    }

    collected.push(...(payload.articles || []))
  }

  const byUrl = new Map()
  for (const article of collected) {
    if (!article?.url || !article?.title || !article?.publishedAt) continue
    if (!byUrl.has(article.url)) byUrl.set(article.url, article)
  }

  return [...byUrl.values()]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_SOURCE_ARTICLES)
}

async function analyzeArticle(article) {
  const prompt = `
Du ar en svensk B2B-sales analytiker.
Malet ar att hitta NYA bolag med dessa kriterier:
- bolaget ar i tillvaxt eller har tydlig affarssignal
- bolaget ar sannolikt stort nog (minst 150 anstallda)
- bolaget har sannolikt HR-funktion (HR-chef, Head of People, HR Business Partner eller liknande)

Regler:
- Om kriterierna inte uppfylls: is_valid_lead=false
- reason och pitch maste vara pa svenska
- reason max 140 tecken
- pitch max 220 tecken
- Hall dig till explicit information i title/description, och markera osakerhet med lagre score

Returnera ENDAST JSON:
{
  "is_valid_lead": boolean,
  "company_name": string,
  "company_domain": string,
  "employee_count_estimate": number,
  "has_hr_function": boolean,
  "is_growth_company": boolean,
  "growth_signal": string,
  "recommended_person_title": string,
  "reason": string,
  "pitch": string,
  "score": number
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

  if (!parsed.is_valid_lead) {
    return { candidate: null, rejectReason: 'ai_marked_not_valid' }
  }

  const companyName = sanitizeText(parsed.company_name, 120)
  const reason = sanitizeText(parsed.reason, 140)
  const pitch = sanitizeText(parsed.pitch, 220)
  const recommendedPersonTitle = sanitizeText(parsed.recommended_person_title, 80)
  const growthSignal = sanitizeText(parsed.growth_signal, 60)
  const employeeCountEstimate = parseCount(parsed.employee_count_estimate)
  const hasHrFunction = Boolean(parsed.has_hr_function)
  const isGrowthCompany = Boolean(parsed.is_growth_company)

  if (!companyName) return { candidate: null, rejectReason: 'missing_company_name' }
  if (!reason || !pitch) return { candidate: null, rejectReason: 'missing_reason_or_pitch' }
  if (!employeeCountEstimate || employeeCountEstimate < 150) {
    return { candidate: null, rejectReason: 'employee_count_below_150' }
  }
  if (!hasHrFunction) {
    return { candidate: null, rejectReason: 'no_hr_function_signal' }
  }
  if (!isGrowthCompany) {
    return { candidate: null, rejectReason: 'no_growth_signal' }
  }

  const signal = ALLOWED_SIGNALS.has(growthSignal) ? growthSignal : 'media'
  const domain = extractDomainFromCandidate(parsed.company_domain, article.url)

  return {
    candidate: {
      companyName,
      companyDomain: domain,
      employeeCountEstimate,
      growthSignal: signal,
      recommendedPersonTitle: recommendedPersonTitle || 'HR-chef / VD',
      reason,
      pitch,
      score: clampScore(parsed.score),
      sourceTitle: sanitizeText(article.title, 300),
      sourceUrl: article.url,
      sourcePublishedAt: article.publishedAt,
    },
    rejectReason: null,
  }
}

async function extractCandidatesFromArticles(articles) {
  const byCompany = new Map()
  const articleDecisions = []

  for (const article of articles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const analysis = await analyzeArticle(article)
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
          reason: 'first_for_company',
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
          reason: 'replaced_weaker_company_candidate',
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

  const candidates = [...byCompany.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(b.sourcePublishedAt).getTime() - new Date(a.sourcePublishedAt).getTime()
  })

  return { candidates, articleDecisions }
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
  return {
    user_id: userId,
    company_name: candidate.companyName,
    company_domain: candidate.companyDomain,
    employee_count_estimate: candidate.employeeCountEstimate,
    growth_signal: candidate.growthSignal,
    recommended_person_title: candidate.recommendedPersonTitle,
    reason: candidate.reason,
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
  const pickedCompanies = new Set()
  const candidateDecisions = []

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
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'already_suggested_recently' })
      continue
    }

    if (pickedCompanies.has(normalizedCandidate)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'duplicate_in_same_run' })
      continue
    }

    const pairKey = `${normalizedCandidate}|${candidate.sourceUrl}`
    if (recentDiscovery.pairSet.has(pairKey)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'same_source_already_suggested' })
      continue
    }

    rows.push(buildDiscoveryRow(userId, candidate))
    pickedCompanies.add(normalizedCandidate)
    candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'selected', reason: 'passed_filters' })

    if (rows.length >= MAX_LEADS_PER_USER) break
  }

  if (!rows.length) {
    return { insertedCount: 0, candidateDecisions }
  }

  const { error } = await supabase
    .from('lead_discovery_items')
    .upsert(rows, { onConflict: 'user_id,company_name,source_url', ignoreDuplicates: true })

  if (error) throw error
  return { insertedCount: rows.length, candidateDecisions }
}

async function ensureDiscoverySchema() {
  const { error } = await supabase
    .from('lead_discovery_items')
    .select('company_name, status, source_url')
    .limit(1)

  if (error) {
    throw new Error(
      'Database schema is outdated for AI lead discovery. Apply latest supabase/schema.sql (lead_discovery_items).'
    )
  }
}

async function main() {
  console.log('Generating AI discovery leads (new potential customers only)...')
  await ensureDiscoverySchema()
  const [userIds, articles] = await Promise.all([fetchUserIds(), fetchDiscoveryArticles()])

  if (!userIds.length) {
    console.log('No users found with CRM data.')
    return
  }

  if (!articles.length) {
    console.log('No discovery articles found.')
    return
  }

  console.log(`Fetched ${articles.length} discovery articles`)
  const { candidates, articleDecisions } = await extractCandidatesFromArticles(articles)

  if (LEADS_DEBUG) {
    console.log('[DEBUG] Article decisions:')
    for (const decision of articleDecisions) {
      console.log(
        `- ${decision.outcome.toUpperCase()} | ${decision.reason} | ${decision.title}${decision.companyName ? ` | company=${decision.companyName}` : ''}`
      )
    }
  }

  if (!candidates.length) {
    console.log('No valid candidates left after AI criteria filtering.')
    return
  }

  let totalInserted = 0
  for (const userId of userIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { insertedCount, candidateDecisions } = await generateForUser(userId, candidates)
      totalInserted += insertedCount
      console.log(`User ${userId}: inserted ${insertedCount} discovery leads`)

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

  console.log(`Lead generation done. New discovery leads inserted: ${totalInserted}`)
}

main().catch((error) => {
  console.error('Unexpected error in generate-leads:', error.message)
  process.exit(1)
})
