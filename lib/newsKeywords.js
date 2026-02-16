export const KEYWORD_PRESETS = {
  'risk.cuts': {
    id: 'risk.cuts',
    label: 'Risk: Nedskärningar',
    keywords: ['varsel', 'nedskärning', 'sparpaket', 'omstrukturering'],
  },
  'biz.deals': {
    id: 'biz.deals',
    label: 'Affär: Nya avtal',
    keywords: ['order', 'avtal', 'kontrakt', 'partnerskap'],
  },
  'growth.hiring': {
    id: 'growth.hiring',
    label: 'Tillväxt: Rekrytering',
    keywords: ['rekryterar', 'anställer', 'hiring'],
  },
}

function normalizeToArray(input) {
  if (!input) return []
  if (Array.isArray(input)) return input
  return String(input)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseCustomKeywords(input) {
  return normalizeToArray(input)
}

export function buildKeywordsFromPresets(ids, custom, max = 10, fallback = []) {
  const selectedIds = normalizeToArray(ids)
  const customKeywords = normalizeToArray(custom)
  const fallbackKeywords = normalizeToArray(fallback)
  const deduped = new Set()

  for (const id of selectedIds) {
    const preset = KEYWORD_PRESETS[id]
    if (!preset) continue
    for (const keyword of preset.keywords) {
      deduped.add(keyword.toLowerCase().trim())
    }
  }

  for (const keyword of customKeywords) {
    deduped.add(keyword.toLowerCase().trim())
  }

  let values = [...deduped].filter(Boolean)
  if (!values.length) {
    values = fallbackKeywords.map((item) => item.toLowerCase().trim()).filter(Boolean)
  }

  return values.slice(0, max)
}

export function buildGoogleAlertsQuery(companyName, keywords) {
  const name = (companyName || '').trim()
  const escapedName = name ? `"${name}"` : '"CompanyName"'
  const terms = normalizeToArray(keywords).filter(Boolean)

  if (!terms.length) {
    return escapedName
  }

  const keywordQuery = terms.map((term) => `"${term}"`).join(' OR ')
  return `${escapedName} AND (${keywordQuery})`
}

export function buildGoogleNewsTestUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws`
}
