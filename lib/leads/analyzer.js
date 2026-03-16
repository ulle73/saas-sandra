/**
 * Lead generation - article analysis and candidate extraction
 */

import OpenAI from 'openai'
import {
  OPENAI_API_KEY,
  NEWSAPI_KEY,
  LOOKBACK_DAYS,
  MAX_SOURCE_ARTICLES,
  DISCOVERY_INCLUDE_NEWSAPI,
  DISCOVERY_INCLUDE_GOOGLE_RSS,
  DISCOVERY_QUERIES,
  DEFAULT_TARGET_TITLE_TERMS,
  DEFAULT_FALLBACK_TITLE_TERMS,
  DEFAULT_EXCLUDED_TITLE_TERMS,
  EXECUTIVE_TITLE_TERMS,
  DEFAULT_AI_PROFILE,
  OPENAI_MODEL,
} from './config.js'
import {
  fetchWithTimeout,
  parseGoogleNewsRss,
  normalizeForLookup,
  sanitizeText,
  parseModelJson,
  clampPriorityScore,
  parseCount,
  parseConfidence,
  confidenceWeight,
  normalizeSignal,
  sourcePenalty,
  priorityLabelFromScore,
  toBoolean,
  extractDomainFromCandidate,
  normalizeCompanyName,
} from './utils.js'
import { aiProfileToPrompt, normalizeAiProfileInput } from '../aiProfile.js'

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

export async function fetchDiscoveryArticles() {
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
        response = await fetchWithTimeout(url)
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
        const rssResponse = await fetchWithTimeout(rssUrl)
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

export function buildHeuristicCandidate(article) {
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

export function buildLinkedInPeopleSearchUrl(companyId, keyword = 'HR') {
  const id = String(companyId || '').trim()
  if (!id) return null
  const encodedCompany = encodeURIComponent(JSON.stringify([id]))
  const encodedKeyword = encodeURIComponent(String(keyword || '').trim() || 'HR')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodedKeyword}&currentCompany=${encodedCompany}`
}

export function summarizeCandidatePool(candidates) {
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

export function normalizeTitleTerms(rawValue, fallbackTerms) {
  const fromProfile = splitKeywordList(rawValue)
    .map((term) => normalizeTitleForMatch(term))
    .filter(Boolean)

  if (fromProfile.length) return dedupeTerms(fromProfile)
  return dedupeTerms(fallbackTerms.map((term) => normalizeTitleForMatch(term)))
}

export function buildPersonTitleStrategy(aiProfileInput = DEFAULT_AI_PROFILE) {
  const profile = normalizeAiProfileInput(aiProfileInput)
  return {
    targetTerms: normalizeTitleTerms(profile.target_titles, DEFAULT_TARGET_TITLE_TERMS),
    fallbackTerms: normalizeTitleTerms(profile.fallback_titles, DEFAULT_FALLBACK_TITLE_TERMS),
    excludedTerms: normalizeTitleTerms(profile.excluded_titles, DEFAULT_EXCLUDED_TITLE_TERMS),
    executiveTerms: dedupeTerms(EXECUTIVE_TITLE_TERMS.map((term) => normalizeTitleForMatch(term))),
  }
}

export function titleIncludesAny(normalizedTitle, terms) {
  return terms.some((term) => term && normalizedTitle.includes(term))
}

export async function analyzeArticle(article, aiProfileInput = DEFAULT_AI_PROFILE) {
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

export async function extractCandidatesFromArticles(articles, aiProfileInput = DEFAULT_AI_PROFILE) {
  const byCompany = new Map()
  const articleDecisions = []

  for (const article of articles) {
    try {
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

  const { HEURISTIC_FALLBACK_LIMIT, MIN_LEADS_TARGET } = await import('./config.js')

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
