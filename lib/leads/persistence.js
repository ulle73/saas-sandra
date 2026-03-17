/**
 * Lead generation - database persistence functions
 */

import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  MAX_LEADS_PER_USER,
  MIN_LEADS_TARGET,
  RECENT_DUPLICATE_WINDOW_DAYS,
  COMPANY_PEOPLE_MAX_CANDIDATES,
  COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS,
} from './config.js'
import { normalizeCompanyName } from './utils.js'
import {
  buildDiscoveryRow,
  findCompanyForLead,
  fetchCompanyPeople,
  fetchCompanyAbout,
  fetchCompanyJobCount,
  buildShortlistFromPeople,
  toContactCandidates,
  writeAiLeadsFile,
} from './company.js'
import {
  buildLinkedInPeopleSearchUrl,
  summarizeCandidatePool,
  buildPersonTitleStrategy,
  extractCandidatesFromArticles,
  extractLinkedInSlug,
  buildLinkedInPeoplePageUrl,
  buildLinkedInJobsPageUrl,
  buildLinkedInAboutPageUrl,
} from './analyzer.js'
import { DEFAULT_AI_PROFILE } from './config.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

let hasWarnedMissingAiProfilesTable = false

export async function persistContactCandidatesForLead({ userId, candidate, contactCandidates }) {
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

export async function persistLinkedInCompanyMatchForLead({ userId, candidate, companyInfo, aboutText = null, jobCount = null }) {
  const companyId = String(companyInfo.company_id || '').trim()
  const slug = extractLinkedInSlug(companyInfo.company_url)
  const payload = {
    linkedin_company_id: companyId,
    linkedin_company_url: companyInfo.company_url || null,
    linkedin_people_search_hr_url: buildLinkedInPeopleSearchUrl(companyId, 'HR'),
    linkedin_people_search_ceo_url: buildLinkedInPeopleSearchUrl(companyId, 'CEO'),
    linkedin_people_url: buildLinkedInPeoplePageUrl(slug),
    linkedin_jobs_url: buildLinkedInJobsPageUrl(slug),
    linkedin_about_url: buildLinkedInAboutPageUrl(slug),
    linkedin_about_text: aboutText,
    linkedin_job_count: jobCount,
  }

  const { error } = await supabase
    .from('lead_discovery_items')
    .update(payload)
    .eq('user_id', userId)
    .eq('company_name', candidate.companyName)
    .eq('source_url', candidate.sourceUrl)

  if (error) {
    if (/column .*linkedin_jobs_url/i.test(String(error.message || ''))) {
      console.warn('lead_discovery_items.linkedin_company_* / linkedin_people_search_* saknas i databasen. Kör senaste supabase/schema.sql.')
    } else {
      console.error('Persistence error:', error.message)
    }
  }
}

export async function fetchUserIds() {
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

export async function fetchAiProfilesByUserIdsLocal(userIds) {
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

  const { normalizeAiProfileInput } = await import('../aiProfile.js')
  for (const row of data || []) {
    if (!row?.user_id) continue
    profileMap.set(row.user_id, normalizeAiProfileInput(row))
  }

  return profileMap
}

export async function fetchExistingCompanySet(userId) {
  const { data, error } = await supabase
    .from('companies')
    .select('name')
    .eq('user_id', userId)

  if (error) throw error
  return new Set((data || []).map((item) => normalizeCompanyName(item.name)).filter(Boolean))
}

export async function fetchRecentDiscoverySet(userId) {
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

export async function generateForUser(userId, candidates) {
  const existingCompanies = await fetchExistingCompanySet(userId)
  const recentDiscovery = await fetchRecentDiscoverySet(userId)

  const rows = []
  const selectedCandidates = []
  const pickedCompanies = new Set()
  const repeatPool = []
  const candidateDecisions = []
  const targetCount = Math.min(MAX_LEADS_PER_USER, Math.max(1, MIN_LEADS_TARGET))
  const { priorityLabelFromScore } = await import('./utils.js')

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCompanyName(candidate.companyName)
    if (!normalizedCandidate) {
      candidateDecisions.push({ companyName: candidate.companyName, sourceUrl: candidate.sourceUrl, outcome: 'filtered', reason: 'invalid_normalized_company' })
      continue
    }

    if (existingCompanies.has(normalizedCandidate)) {
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

export async function ensureDiscoverySchema() {
  const { error } = await supabase
    .from('lead_discovery_items')
    .select('company_name, status, source_url, contact_candidates, linkedin_company_id, linkedin_company_url, linkedin_people_search_hr_url, linkedin_people_search_ceo_url, linkedin_jobs_url, linkedin_people_url, linkedin_about_url, linkedin_about_text, linkedin_job_count')
    .limit(1)

  if (error) {
    throw new Error(
      'Database schema is outdated for AI lead discovery. Apply latest supabase/schema.sql (lead_discovery_items + contact_candidates + linkedin_company_* + linkedin_people_search_*).'
    )
  }
}

export async function runCompanyPeopleFlow(userId, selectedCandidates, aiProfileInput = DEFAULT_AI_PROFILE) {
  const { createRequestCounters, RAPIDAPI_KEYS } = await import('./config.js')
  const { slugify } = await import('./utils.js')

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

      const companyInfo = await findCompanyForLead(candidate.companyName, requestCounters, deadlineMs)
      if (!companyInfo?.company_id) {
        failedFiles += 1
        console.log(`- ${candidate.companyName}: no company_id found`)
        continue
      }

      const aboutText = await fetchCompanyAbout(companyInfo.company_url || companyInfo.company_id, requestCounters, deadlineMs)
      const jobCount = await fetchCompanyJobCount(companyInfo.company_id, requestCounters, deadlineMs)

      await persistLinkedInCompanyMatchForLead({
        userId,
        candidate,
        companyInfo,
        aboutText,
        jobCount,
      })

      if (index >= peopleEnrichmentLimit) {
        console.log(`- ${companyInfo.name}: linked company match/about saved, skipped people enrichment due cap`)
        generatedFiles += 1
        continue
      }

      const peopleResult = await fetchCompanyPeople(companyInfo.company_id, companyInfo.name, requestCounters, deadlineMs, titleStrategy)
      const shortlist = buildShortlistFromPeople(peopleResult.people, titleStrategy)
      const contactCandidates = toContactCandidates(shortlist)
      const fileName = `${slugify(companyInfo.name)}_${companyInfo.company_id}_ai_leads.json`
      const outputPath = path.join(OUTPUT_DIR, fileName)

      await writeAiLeadsFile({
        userId,
        candidate,
        companyInfo,
        peopleResult,
        shortlist,
        outputPath,
        requestCounters,
      })
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

import fs from 'fs/promises'
