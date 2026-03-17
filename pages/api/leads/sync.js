import { requireApiUser } from '../../../lib/apiAuth'
import { enrichLeadData } from '../../../lib/leads/persistence.js'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../../../lib/leads/config.js'

export default async function handler(req, res) {
  // 1. Authenticate user
  const auth = await requireApiUser(req, res)
  if (!auth) return

  // 2. Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { leadId, linkedinUrl } = req.body
  if (!leadId) {
    return res.status(400).json({ error: 'Missing leadId' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  
  // 3. Fetch current lead state to ensure ownership and get metadata
  const { data: lead, error: fetchError } = await supabase
    .from('lead_discovery_items')
    .select('*')
    .eq('id', leadId)
    .eq('user_id', auth.user.id)
    .single()

  if (fetchError || !lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }

  // 4. Run enrichment flow
  // We reconstruct a candidate object that enrichLeadData expects
  const candidate = {
    companyName: lead.company_name,
    companyDomain: lead.company_domain,
    sourceUrl: lead.source_url,
    sourceTitle: lead.source_title,
    sourcePublishedAt: lead.source_published_at,
    reason: lead.reason,
    pitch: lead.pitch,
    score: lead.score,
  }

  const result = await enrichLeadData(auth.user.id, candidate, {
    manualLinkedInUrl: linkedinUrl || null
  })

  if (!result.success) {
    return res.status(500).json({ 
      error: result.error || result.reason || 'Sync failed',
      details: result
    })
  }

  return res.status(200).json({ 
    message: 'Manual sync successful', 
    result 
  })
}
