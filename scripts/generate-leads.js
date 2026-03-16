/**
 * AI Lead Generation Script
 * Entry point for generating leads from news articles
 */

import { ensureEnvLoaded } from './load-env.js'
import {
  LEADS_USER_ID,
  LEADS_DEBUG,
  DEFAULT_AI_PROFILE,
} from '../lib/leads/config.js'
import {
  fetchDiscoveryArticles,
  extractCandidatesFromArticles,
  summarizeCandidatePool,
} from '../lib/leads/analyzer.js'
import {
  fetchUserIds,
  fetchAiProfilesByUserIdsLocal,
  generateForUser,
  ensureDiscoverySchema,
  runCompanyPeopleFlow,
} from '../lib/leads/persistence.js'
import { aiProfileToPrompt } from '../lib/aiProfile.js'

ensureEnvLoaded()

async function main() {
  console.log('Generating AI discovery leads (news lookback + company people flow)...')
  await ensureDiscoverySchema()

  let userIds = []
  if (LEADS_USER_ID) {
    userIds = [LEADS_USER_ID]
    console.log(`Starting lead generation for specific user: ${LEADS_USER_ID}`)
  } else {
    userIds = await fetchUserIds()
    console.log(`Starting lead generation for ${userIds.length} users found in database...`)
  }

  if (!userIds.length) {
    console.log('No users to process.')
    return
  }

  const articles = await fetchDiscoveryArticles()

  if (!articles.length) {
    console.log('No discovery articles found.')
    return
  }

  const aiProfilesByUser = await fetchAiProfilesByUserIdsLocal(userIds)
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
        console.log(`User ${userId}: no valid candidates found by AI after article analysis.`)
        continue
      }

      console.log(`User ${userId}: passing ${extraction.candidates.length} potential candidates to generation flow...`)
      const { insertedCount, candidateDecisions, selectedCandidates } = await generateForUser(userId, extraction.candidates)
      
      const filteredCount = candidateDecisions.filter(d => d.outcome === 'filtered').length
      const deferredCount = candidateDecisions.filter(d => d.outcome === 'deferred').length
      const selectedCount = candidateDecisions.filter(d => d.outcome === 'selected' || d.outcome === 'selected_repeat').length
      
      console.log(`User ${userId} generation results: selected=${selectedCount}, filtered=${filteredCount}, deferred=${deferredCount}`)
      
      totalInserted += insertedCount
      console.log(`User ${userId}: inserted ${insertedCount} discovery leads`)

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
