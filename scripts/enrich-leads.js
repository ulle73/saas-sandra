/**
 * AI Lead Enrichment Script
 * Fetches existing discovery leads that are missing contact candidates and runs the enrichment flow.
 */

import { ensureEnvLoaded } from './load-env.js'
import {
  LEADS_USER_ID,
  DEFAULT_AI_PROFILE,
} from '../lib/leads/config.js'
import {
  fetchAiProfilesByUserIdsLocal,
  ensureDiscoverySchema,
  runCompanyPeopleFlow,
} from '../lib/leads/persistence.js'
import { supabaseAdmin } from '../lib/supabase.js'

ensureEnvLoaded()

async function main() {
  console.log('Enriching existing AI discovery leads with LinkedIn data and people...')
  await ensureDiscoverySchema()

  if (!LEADS_USER_ID) {
    console.error('Error: LEADS_USER_ID environment variable is required.')
    process.exit(1)
  }

  // Fetch leads for this user that are missing contact candidates
  const { data: leads, error } = await supabaseAdmin
    .from('lead_discovery_items')
    .select('*')
    .eq('user_id', LEADS_USER_ID)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch leads:', error.message)
    process.exit(1)
  }

  console.log(`Total leads in DB for user ${LEADS_USER_ID}: ${leads.length}`)

  // Filter for leads that REALLY need enrichment (missing contacts OR missing LinkedIn ID)
  const toEnrich = leads.filter(l => {
    const contacts = Array.isArray(l.contact_candidates) ? l.contact_candidates : JSON.parse(l.contact_candidates || '[]')
    const needsEnrichment = contacts.length === 0 || !l.linkedin_company_id
    if (!needsEnrichment) {
      console.log(`- Skipping ${l.company_name}: already has ${contacts.length} contacts and LinkedIn ID ${l.linkedin_company_id}`)
    }
    return needsEnrichment
  })

  if (!toEnrich.length) {
    console.log(`User ${LEADS_USER_ID}: No leads found that need enrichment.`)
    return
  }

  console.log(`User ${LEADS_USER_ID}: Found ${toEnrich.length} leads to enrich.`)

  const aiProfilesByUser = await fetchAiProfilesByUserIdsLocal([LEADS_USER_ID])
  const profile = aiProfilesByUser.get(LEADS_USER_ID) || DEFAULT_AI_PROFILE

  // Prepare candidates in the format expected by runCompanyPeopleFlow
  const candidates = toEnrich.map(l => ({
    companyName: l.company_name,
    sourceUrl: l.source_url,
    // We recreate enough of the candidate object for the flow
    score: l.score,
    industry: l.industry
  }))

  const { generatedFiles, failedFiles } = await runCompanyPeopleFlow(LEADS_USER_ID, candidates, profile)

  console.log(`Enrichment done. Successful: ${generatedFiles}. Failed: ${failedFiles}.`)
}

main().catch((error) => {
  console.error('Unexpected error in enrich-leads:', error.message)
  process.exit(1)
})
