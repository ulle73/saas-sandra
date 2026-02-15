/**
 * generate-leads.js
 *
 * Generates weekly AI‑driven outreach leads.
 *
 * How it works:
 *   1. Fetch contacts (with their company and any recent news items).
 *   2. For each contact, ask OpenAI to craft a short, personalized pitch
 *      based on the contact’s name, role (if known), company and recent news.
 *   3. Store the generated pitch + reason in the `weekly_leads` table.
 *   4. (Optional) Notify via Telegram with the number of new leads.
 *
 * Run with:
 *   node scripts/generate-leads.js
 *
 * Dependencies:
 *   - @supabase/supabase-js
 *   - openai
 *   - node-fetch (built‑in from Node 18) for Telegram calls
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// ---------- CONFIG ----------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌  Supabase credentials missing')
  process.exit(1)
}
if (!OPENAI_API_KEY) {
  console.error('❌  OpenAI API key missing')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// ---------- HELPERS ----------

/** Send a simple text message via Telegram (optional). */
async function telegramNotify(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️  Telegram credentials missing – skipping notification')
    return
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.description)
    console.log('📨  Telegram notification sent')
  } catch (err) {
    console.error('❌  Telegram notification error:', err.message)
  }
}

/** Build a prompt for OpenAI based on contact + news. */
function buildPrompt(contact, newsList) {
  const newsBlock = newsList.length
    ? `Recent news about ${contact.company_name}:\n${newsList.map(n => `- ${n.title}`).join('\n')}`
    : `No recent news for ${contact.company_name}.`

  const role = contact.role ? ` (${contact.role})` : ''
  return `Write a short outreach message (max 150 characters) for ${contact.name}${role} at ${contact.company_name}.
Context: ${newsBlock}
Give a concise reason why this person is a good target (e.g., "Recent funding round", "New product launch").
Return JSON with two fields: "reason" and "pitch".`
}

/** Generate lead for a single contact using OpenAI. */
async function generateLead(contact) {
  // Fetch recent news for the contact's company (last 30 days)
  const { data: news } = await supabase
    .from('news_items')
    .select('title, published_at')
    .eq('company_id', contact.company_id)
    .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('published_at', { ascending: false })
    .limit(5)

  const prompt = buildPrompt(contact, news || [])

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // lightweight model for speed
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  })

  const content = completion.choices[0].message.content.trim()
  // Parse JSON – the model should output valid JSON, but we guard against malformed output
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    // fallback: try to extract fields manually
    const reasonMatch = content.match(/"reason"\s*:\s*"([^"]+)"/)
    const pitchMatch = content.match(/"pitch"\s*:\s*"([^"]+)"/)
    parsed = {
      reason: reasonMatch ? reasonMatch[1] : 'General outreach',
      pitch: pitchMatch ? pitchMatch[1] : content,
    }
  }

  return {
    contact_id: contact.id,
    reason: parsed.reason || 'General outreach',
    pitch: parsed.pitch || '',
    generated_at: new Date().toISOString(),
  }
}

// ---------- MAIN ----------

async function main() {
  console.log('🚀  Starting weekly lead generation...')

  // 1️⃣  Fetch contacts (including company name and role)
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, role, companies(id, name)')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id) // ensure we only get current user contacts
    .is('status', null) // optional: only contacts without a lead? not needed for now
  if (error) {
    console.error('❌  Failed to fetch contacts:', error.message)
    process.exit(1)
  }

  if (!contacts || contacts.length === 0) {
    console.log('ℹ️  No contacts found – nothing to generate.')
    return
  }

  let generated = 0
  const errors = []

  for (const contact of contacts) {
    try {
      const lead = await generateLead({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        company_id: contact.companies?.id,
        company_name: contact.companies?.name,
      })

      const { error: insertError } = await supabase.from('weekly_leads').insert(lead)
      if (insertError) {
        console.error(`❌  Insert error for ${contact.name}:`, insertError.message)
        errors.push(contact.name)
      } else {
        generated += 1
      }
    } catch (err) {
      console.error(`❌  Generation error for ${contact.name}:`, err.message)
      errors.push(contact.name)
    }
  }

  console.log(`✅  Generated ${generated} new leads (${errors.length} errors).`)

  // Optional Telegram notification
  if (generated > 0) {
    await telegramNotify(`🔔 *New weekly leads generated:* ${generated}`)
  }

  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})