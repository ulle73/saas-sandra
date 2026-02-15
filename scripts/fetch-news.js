const fetch = require('node-fetch')
const { createClient } = require('@supabase/supabase-js')

// Load env (Node will read .env automatically if using a library, but we keep it simple)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase credentials missing')
  process.exit(1)
}
if (!NEWSAPI_KEY) {
  console.error('NewsAPI key missing')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function fetchNewsForCompany(company) {
  const keywords = company.news_keywords || []
  if (!keywords.length) return []
  const query = encodeURIComponent(keywords.join(' OR '))
  const url = `https://newsapi.org/v2/everything?q=${query}&apiKey=${NEWSAPI_KEY}&language=en&sortBy=publishedAt&pageSize=5`
  const resp = await fetch(url)
  const data = await resp.json()
  if (!data.articles) return []
  // Transform articles to our schema
  return data.articles.map(a => ({
    company_id: company.id,
    title: a.title,
    description: a.description,
    url: a.url,
    source_name: a.source?.name,
    published_at: a.publishedAt,
  }))
}

async function main() {
  // Get all companies with keywords
  const { data: companies } = await supabase.from('companies').select('id, name, news_keywords')
  if (!companies) return
  for (const company of companies) {
    const news = await fetchNewsForCompany(company)
    if (news.length) {
      // Insert news items (ignore duplicates by URL)
      const { error } = await supabase.from('news_items').upsert(news, { onConflict: ['url'] })
      if (error) console.error('Supabase upsert error:', error)
      // Optionally send Telegram alert
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const message = `📰 *${company.name}* news updates:\n` + news.map(item => `- ${item.title}`).join('\n')
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' }),
          })
        } catch (e) {
          console.error('Telegram notify error', e)
        }
      }
    }
  }
  console.log('News fetch completed')
}

main().catch(err => console.error(err))
