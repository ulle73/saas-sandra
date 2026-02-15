import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { ensureEnvLoaded } from './load-env.js'

ensureEnvLoaded()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const MAX_LEADS_PER_USER = Number(process.env.LEADS_MAX_PER_USER || 10)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

function computeContactStatus(contact) {
  const now = new Date()
  const nextActivity = contact.next_activity ? new Date(contact.next_activity) : null
  const lastTouchpoint = contact.last_touchpoint ? new Date(contact.last_touchpoint) : null

  if (nextActivity && nextActivity > now) return 'green'
  if (lastTouchpoint && now.getTime() - lastTouchpoint.getTime() < 28 * 24 * 60 * 60 * 1000) return 'yellow'
  return 'red'
}

async function recentCompanyNews(companyId) {
  if (!companyId) return []

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('news_items')
    .select('title, news_type, published_at')
    .eq('company_id', companyId)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Could not fetch news:', error.message)
    return []
  }

  return data || []
}

function buildPrompt(contact, status, news) {
  const companyName = contact.companies?.name || 'unknown company'
  const newsSummary = news.length
    ? news.map((item) => `- ${item.title} (${item.news_type || 'general'})`).join('\n')
    : '- No relevant company news in the last 30 days.'

  return `
You are a sales assistant. Return strict JSON with keys "reason" and "pitch".
Constraints:
- reason: max 120 characters
- pitch: max 180 characters, direct and specific

Contact:
- name: ${contact.name}
- email: ${contact.email || 'N/A'}
- status: ${status}
- company: ${companyName}

Recent company news:
${newsSummary}

Only return JSON, no markdown.
`.trim()
}

function safeParseLead(content) {
  try {
    const parsed = JSON.parse(content)
    return {
      reason: String(parsed.reason || 'Follow-up opportunity'),
      pitch: String(parsed.pitch || 'Quick intro and value proposition.'),
    }
  } catch {
    return {
      reason: 'Follow-up opportunity',
      pitch: content.slice(0, 180),
    }
  }
}

async function generateLead(contact) {
  const status = computeContactStatus(contact)
  const news = await recentCompanyNews(contact.company_id)
  const prompt = buildPrompt(contact, status, news)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  })

  const content = completion.choices[0]?.message?.content?.trim() || ''
  const parsed = safeParseLead(content)

  return {
    user_id: contact.user_id,
    contact_id: contact.id,
    company_id: contact.company_id || null,
    reason: parsed.reason,
    pitch: parsed.pitch,
    generated_at: new Date().toISOString(),
  }
}

async function main() {
  console.log('Generating weekly leads...')
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, user_id, company_id, name, email, last_touchpoint, next_activity, companies(name)')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch contacts:', error.message)
    process.exit(1)
  }

  const candidatesByUser = new Map()
  for (const contact of contacts || []) {
    const status = computeContactStatus(contact)
    if (status === 'green') continue

    const existing = candidatesByUser.get(contact.user_id) || []
    if (existing.length < MAX_LEADS_PER_USER) {
      existing.push(contact)
      candidatesByUser.set(contact.user_id, existing)
    }
  }

  if (!candidatesByUser.size) {
    console.log('No eligible contacts to generate leads from.')
    return
  }

  let generated = 0
  for (const [userId, userContacts] of candidatesByUser.entries()) {
    const leads = []
    for (const contact of userContacts) {
      try {
        const lead = await generateLead(contact)
        leads.push(lead)
      } catch (err) {
        console.error(`Lead generation failed for contact ${contact.id}:`, err.message)
      }
    }

    if (!leads.length) continue

    const { error: insertError } = await supabase.from('weekly_leads').insert(leads)
    if (insertError) {
      console.error(`Failed storing leads for user ${userId}:`, insertError.message)
      continue
    }

    generated += leads.length
  }

  console.log(`Lead generation done. New leads stored: ${generated}`)
}

main().catch((err) => {
  console.error('Unexpected error in generate-leads:', err.message)
  process.exit(1)
})
