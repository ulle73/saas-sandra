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
const MAX_SOURCE_ARTICLES = parsePositiveInt(process.env.LEADS_DISCOVERY_MAX_ARTICLES, 30, 5, 80)
const OPENAI_MODEL = process.env.LEADS_DISCOVERY_MODEL || 'gpt-4o-mini'
const LEADS_DEBUG = String(process.env.LEADS_DEBUG || 'false').toLowerCase() === 'true'

const DISCOVERY_QUERIES = [
  '"stororder" OR "nytt avtal" OR upphandling OR partnerskap',
  'expanderar OR etablerar OR investering OR tillvaxt',
  'rekryterar OR anstaller OR varsel OR omstrukturering',
]

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
Analysera artikeln och avgor om den innehaller en konkret affarssignal for ett bolag som kan vara en ny potentiell kund.

Regler:
- Om bolag inte namns tydligt: is_valid_lead=false
- reason och pitch maste vara pa svenska
- reason max 140 tecken
- pitch max 220 tecken
- hall dig till vad som explicit star i title/description
- signal maste vara en av: order,public_procurement,partnership,expansion,hiring,restructuring,media

Returnera ENDAST JSON med nycklar:
{
  "is_valid_lead": boolean,
  "company_name": string,
  "signal": string,
  "reason": string,
  "pitch": string,
  "contact_hint": string,
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

  if (!parsed.company_name) {
    return { candidate: null, rejectReason: 'missing_company_name' }
  }

  const signal = sanitizeText(parsed.signal, 40)
  const validSignals = new Set(['order', 'public_procurement', 'partnership', 'expansion', 'hiring', 'restructuring', 'media'])
  const reason = sanitizeText(parsed.reason, 140)
  const pitch = sanitizeText(parsed.pitch, 220)
  const companyName = sanitizeText(parsed.company_name, 120)
  const contactHint = sanitizeText(parsed.contact_hint, 80)

  if (!companyName || !reason || !pitch) {
    return { candidate: null, rejectReason: 'missing_required_fields' }
  }

  return {
    candidate: {
      companyName,
      signal: validSignals.has(signal) ? signal : 'media',
      reason,
      pitch,
      contactHint: contactHint || null,
      score: clampScore(parsed.score),
      sourceTitle: article.title,
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
          companyName: null,
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
        companyName: null,
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
  const [{ data: companies, error: companiesError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from('companies').select('user_id'),
    supabase.from('contacts').select('user_id'),
  ])

  if (companiesError || contactsError) {
    throw new Error(companiesError?.message || contactsError?.message || 'Failed to fetch user ids')
  }

  return [...new Set([...(companies || []), ...(contacts || [])].map((row) => row.user_id).filter(Boolean))]
}

async function fetchExistingCompanySet(userId) {
  const { data, error } = await supabase
    .from('companies')
    .select('name')
    .eq('user_id', userId)

  if (error) throw error

  return new Set((data || []).map((item) => normalizeCompanyName(item.name)).filter(Boolean))
}

async function fetchRecentProspectSet(userId) {
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('weekly_leads')
    .select('prospect_company, source_url')
    .eq('user_id', userId)
    .eq('is_new_prospect', true)
    .gte('generated_at', since)

  if (error) throw error

  const companySet = new Set()
  const pairSet = new Set()

  for (const row of data || []) {
    const normalizedCompany = normalizeCompanyName(row.prospect_company)
    if (normalizedCompany) companySet.add(normalizedCompany)
    if (normalizedCompany && row.source_url) {
      pairSet.add(`${normalizedCompany}|${row.source_url}`)
    }
  }

  return { companySet, pairSet }
}

function buildLeadRow(userId, candidate) {
  return {
    user_id: userId,
    contact_id: null,
    company_id: null,
    prospect_company: candidate.companyName,
    prospect_person: candidate.contactHint,
    prospect_email: null,
    source_title: candidate.sourceTitle,
    source_url: candidate.sourceUrl,
    source_published_at: candidate.sourcePublishedAt,
    source_signal: candidate.signal,
    score: candidate.score,
    is_new_prospect: true,
    reason: candidate.reason,
    pitch: candidate.pitch,
    generated_at: new Date().toISOString(),
  }
}

async function generateForUser(userId, candidates) {
  const existingCompanies = await fetchExistingCompanySet(userId)
  const recentProspects = await fetchRecentProspectSet(userId)

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
    if (recentProspects.companySet.has(normalizedCandidate)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'already_suggested_recently' })
      continue
    }
    if (pickedCompanies.has(normalizedCandidate)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'duplicate_in_same_run' })
      continue
    }

    const pairKey = `${normalizedCandidate}|${candidate.sourceUrl}`
    if (recentProspects.pairSet.has(pairKey)) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'same_source_already_suggested' })
      continue
    }

    rows.push(buildLeadRow(userId, candidate))
    pickedCompanies.add(normalizedCandidate)
    candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'selected', reason: 'passed_filters' })

    if (rows.length >= MAX_LEADS_PER_USER) break
  }

  if (!rows.length) return { insertedCount: 0, candidateDecisions }

  const { error } = await supabase.from('weekly_leads').insert(rows)
  if (error) throw error
  return { insertedCount: rows.length, candidateDecisions }
}

async function ensureProspectSchema() {
  const { error } = await supabase
    .from('weekly_leads')
    .select('prospect_company, is_new_prospect, source_url')
    .limit(1)

  if (error) {
    throw new Error(
      'Database schema is outdated for AI lead discovery. Apply the latest supabase/schema.sql (weekly_leads prospect columns).'
    )
  }
}

async function main() {
  console.log('Generating weekly AI leads from new prospects...')
  await ensureProspectSchema()
  const [userIds, articles] = await Promise.all([fetchUserIds(), fetchDiscoveryArticles()])

  if (!userIds.length) {
    console.log('No users found with data.')
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
    console.log('No valid new lead candidates extracted by AI.')
    return
  }

  let totalInserted = 0
  for (const userId of userIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { insertedCount, candidateDecisions } = await generateForUser(userId, candidates)
      totalInserted += insertedCount
      console.log(`User ${userId}: inserted ${insertedCount} new prospect leads`)
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

  console.log(`Lead generation done. New prospect leads inserted: ${totalInserted}`)
}

main().catch((error) => {
  console.error('Unexpected error in generate-leads:', error.message)
  process.exit(1)
})
