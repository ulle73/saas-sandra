import { createClient } from '@supabase/supabase-js'
import { ensureEnvLoaded } from './load-env.js'
import { buildKeywordsFromPresets } from '../lib/newsKeywords.js'
import { fetchGoogleNewsRssArticlesByQuery } from '../lib/googleNewsRss.js'

ensureEnvLoaded()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const DEFAULT_KEYWORDS = ['varsel', 'nedskärning', 'stororder', 'nytt avtal', 'upphandling', 'expanderar', 'rekryterar', 'kundcase']
const NEWS_LANGUAGES = [
  'sv',
  // 'en', // uncomment to include English results
]
const GOOGLE_NEWS_RSS_ENABLED = (process.env.GOOGLE_NEWS_RSS_ENABLED || 'true').toLowerCase() === 'true'
const INCLUDE_MEDIA_MENTIONS = (process.env.NEWS_INCLUDE_MEDIA || 'true').toLowerCase() === 'true'
const KEYWORD_ALIASES = {
  layoff: ['layoff', 'layoffs', 'laid off', 'varsel', 'sparkar', 'avskedar', 'nedskarning'],
  layoffs: ['layoff', 'layoffs', 'laid off', 'varsel', 'sparkar', 'avskedar', 'nedskarning'],
  varsel: ['varsel', 'layoff', 'layoffs', 'avskedar', 'sparkar'],
  sparkar: ['sparkar', 'sparkar', 'varsel', 'avskedar', 'layoff'],
  avskedar: ['avskedar', 'avskedar', 'avsked', 'varsel', 'layoff'],
  avslutar: ['avslutar', 'avslut', 'sager upp', 'terminates', 'ends'],
  order: ['order', 'stororder', 'new order', 'kontrakt', 'contract'],
  kontrakt: ['kontrakt', 'contract', 'new contract', 'agreement', 'order'],
  'new contract': ['new contract', 'contract', 'kontrakt', 'agreement', 'order'],
  'marketing campaign': ['marketing campaign', 'campaign', 'kundcase', 'customer case'],
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

if (!NEWSAPI_KEY && !GOOGLE_NEWS_RSS_ENABLED) {
  console.error('Missing NEWSAPI_KEY and GOOGLE_NEWS_RSS_ENABLED=false. Need at least one news source enabled.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function classifyNewsType(text = '') {
  const normalized = text.toLowerCase()
  if (normalized.includes('layoff') || normalized.includes('varsel')) return 'layoff'
  if (normalized.includes('order') || normalized.includes('new contract') || normalized.includes('contract')) return 'order'
  if (normalized.includes('marketing campaign') || normalized.includes('campaign')) return 'marketing'
  if (normalized.includes('recruit') || normalized.includes('hiring')) return 'recruitment'
  return 'media'
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  })

  const payload = await response.json()
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram API error')
  }
}

async function fetchArticles(companyName, keywords) {
  const escapedCompany = `"${companyName}"`
  const escapedKeywords = keywords.map((keyword) => `"${keyword}"`).join(' OR ')
  const strictQuery = encodeURIComponent(`${escapedCompany} AND (${escapedKeywords})`)
  const broadQuery = encodeURIComponent(escapedCompany)
  const fromDate = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const collected = []

  if (NEWSAPI_KEY) {
    for (const language of NEWS_LANGUAGES) {
      const strictUrl = `https://newsapi.org/v2/everything?q=${strictQuery}&apiKey=${NEWSAPI_KEY}&searchIn=title,description&language=${language}&from=${fromDate}&sortBy=publishedAt&pageSize=20`
      // eslint-disable-next-line no-await-in-loop
      const strictResponse = await fetch(strictUrl)
      // eslint-disable-next-line no-await-in-loop
      const strictPayload = await strictResponse.json()
      collected.push(...(strictPayload.articles || []))

      // Fallback if strict search yields few/no hits in this language.
      if ((strictPayload.articles || []).length < 3) {
        const broadUrl = `https://newsapi.org/v2/everything?q=${broadQuery}&apiKey=${NEWSAPI_KEY}&searchIn=title,description&language=${language}&from=${fromDate}&sortBy=publishedAt&pageSize=30`
        // eslint-disable-next-line no-await-in-loop
        const broadResponse = await fetch(broadUrl)
        // eslint-disable-next-line no-await-in-loop
        const broadPayload = await broadResponse.json()
        collected.push(...(broadPayload.articles || []))
      }
    }
  }

  if (GOOGLE_NEWS_RSS_ENABLED) {
    const rssKeywords = keywords.slice(0, 8)
    const keywordPart = rssKeywords.length ? `(${rssKeywords.map((keyword) => `"${keyword}"`).join(' OR ')})` : ''
    const query = keywordPart ? `"${companyName}" ${keywordPart}` : `"${companyName}"`
    try {
      const rssArticles = await fetchGoogleNewsRssArticlesByQuery(query)
      collected.push(...rssArticles.map((item) => ({
        title: item.title,
        url: item.url,
        description: item.description || '',
        source: { name: item.source || 'Google News RSS' },
        publishedAt: item.publishedAt || new Date().toISOString(),
      })))
    } catch (rssError) {
      console.error(`Google RSS fetch failed for ${companyName}:`, rssError.message)
    }
  }

  const byUrl = new Map()
  for (const article of collected) {
    if (!article?.url) continue
    if (!byUrl.has(article.url)) byUrl.set(article.url, article)
  }
  return [...byUrl.values()]
}

function expandKeywords(keywords) {
  const expanded = new Set()

  for (const rawKeyword of keywords) {
    const keyword = rawKeyword.toLowerCase().trim()
    if (!keyword) continue
    expanded.add(keyword)

    const aliases = KEYWORD_ALIASES[keyword]
    if (aliases) {
      for (const alias of aliases) expanded.add(alias)
    }

    // Light stemming to handle swedish/english inflections.
    if (keyword.length > 5) expanded.add(keyword.slice(0, keyword.length - 1))
    if (keyword.endsWith('ar') || keyword.endsWith('er') || keyword.endsWith('na')) {
      expanded.add(keyword.slice(0, keyword.length - 2))
    }
  }

  return [...expanded].filter((term) => term.length >= 3)
}

function analyzeArticle(article, companyName, keywordPatterns) {
  const text = `${article?.title || ''}\n${article?.description || ''}`.toLowerCase()
  const companyTerms = companyName
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\w]/g, ''))
    .filter((term) => term.length > 2)

  const hasCompanyMention = companyTerms.length
    ? companyTerms.some((term) => text.includes(term))
    : text.includes(companyName.toLowerCase())

  const matchedKeyword = keywordPatterns.find((pattern) => text.includes(pattern)) || null
  const hasKeyword = Boolean(matchedKeyword)
  const isMatch = hasCompanyMention && (hasKeyword || INCLUDE_MEDIA_MENTIONS)
  return { isMatch, hasKeyword, matchedKeyword }
}

async function main() {
  console.log('Fetching company news...')
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, user_id, name, news_keyword_ids, news_custom_keywords, news_keywords')

  if (error) {
    console.error('Could not fetch companies:', error.message)
    process.exit(1)
  }

  let insertedCount = 0

  for (const company of companies || []) {
    const fallbackKeywords = company.news_keywords?.length ? company.news_keywords : DEFAULT_KEYWORDS
    const keywords = buildKeywordsFromPresets(
      company.news_keyword_ids,
      company.news_custom_keywords,
      10,
      fallbackKeywords
    )
    const keywordPatterns = expandKeywords(keywords)
    const articles = await fetchArticles(company.name, keywords)

    if (!articles.length) continue

    const allAnalyzed = articles
      .filter((article) => article?.title && article?.url && article?.publishedAt)
      .map((article) => ({ article, analysis: analyzeArticle(article, company.name, keywordPatterns) }))

    const rows = allAnalyzed.map(({ article, analysis }) => {
        const combinedText = `${article.title}\n${article.description || ''}`
        return {
          user_id: company.user_id,
          company_id: company.id,
          title: article.title,
          url: article.url,
          source: article.source?.name || null,
          is_relevant: analysis.isMatch,
          matched_keyword: analysis.matchedKeyword,
          news_type: analysis.hasKeyword ? classifyNewsType(combinedText) : 'media',
          published_at: article.publishedAt,
        }
      })

    if (!rows.length) {
      console.log(`${company.name}: 0 fetched rows after validation (fetched ${articles.length})`)
      continue
    }

    const { data: upserted, error: upsertError } = await supabase
      .from('news_items')
      .upsert(rows, { onConflict: 'company_id,url' })
      .select('title, news_type, is_relevant')

    if (upsertError) {
      console.error(`Failed storing news for ${company.name}:`, upsertError.message)
      continue
    }

    insertedCount += upserted.length
    const relevantCount = upserted.filter((item) => item.is_relevant).length
    if (!relevantCount) {
      console.log(`${company.name}: 0 relevant hits (stored ${upserted.length} fetched articles)`)
      continue
    }

    const important = upserted.filter((item) => item.is_relevant).slice(0, 3)
    if (important.length) {
      const lines = important.map((item) => `- [${item.news_type}] ${item.title}`).join('\n')
      try {
        await sendTelegram(`News alert: ${company.name}\n${lines}`)
      } catch (notifyError) {
        console.error('Telegram notification failed:', notifyError.message)
      }
    }
  }

  console.log(`News fetch finished. Processed rows: ${insertedCount}`)
}

main().catch((err) => {
  console.error('Unexpected error in fetch-news:', err.message)
  process.exit(1)
})
