function decodeEntities(text = '') {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function firstMatch(value, regex) {
  const match = regex.exec(value)
  return match ? decodeEntities(match[1]).trim() : ''
}

function extractItems(xml = '') {
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi)
  return matches || []
}

function extractFirstHref(html = '') {
  const match = /href="([^"]+)"/i.exec(html)
  return match ? decodeEntities(match[1]).trim() : ''
}

function toIsoDate(input) {
  if (!input) return null
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function normalizeUrl(rawUrl = '') {
  const url = String(rawUrl || '').trim()
  if (!url) return ''

  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}

export function buildGoogleNewsRssSearchUrl(query, locale = {}) {
  const hl = locale.hl || 'sv'
  const gl = locale.gl || 'SE'
  const ceid = locale.ceid || 'SE:sv'
  const encodedQuery = encodeURIComponent(query)
  return `https://news.google.com/rss/search?q=${encodedQuery}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`
}

export function parseGoogleNewsRss(xml) {
  const items = extractItems(xml)
  const parsed = []

  for (const item of items) {
    const title = firstMatch(item, /<title>([\s\S]*?)<\/title>/i)
    const link = firstMatch(item, /<link>([\s\S]*?)<\/link>/i)
    const description = firstMatch(item, /<description>([\s\S]*?)<\/description>/i)
    const source = firstMatch(item, /<source[^>]*>([\s\S]*?)<\/source>/i)
    const pubDate = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i)

    const descriptionUrl = extractFirstHref(description)
    const url = normalizeUrl(descriptionUrl || link)
    if (!title || !url) continue

    parsed.push({
      title,
      url,
      description: description || '',
      source: source || 'Google News RSS',
      publishedAt: toIsoDate(pubDate),
    })
  }

  return parsed
}

export async function fetchGoogleNewsRssArticlesByQuery(query, locale = {}) {
  const url = buildGoogleNewsRssSearchUrl(query, locale)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google News RSS failed (${response.status})`)
  }

  const xml = await response.text()
  return parseGoogleNewsRss(xml)
}
