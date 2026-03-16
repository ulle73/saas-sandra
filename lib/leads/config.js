/**
 * Lead generation configuration and constants
 */

import { fileURLToPath } from 'url'
import path from 'path'
import { DEFAULT_AI_PROFILE } from '../aiProfile.js'

export { DEFAULT_AI_PROFILE }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output')

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY
export const NEWSAPI_KEY = process.env.NEWSAPI_KEY

export const RAPIDAPI_KEYS = [
  ...(process.env.RAPIDAPI_KEYS || '').split(',').map((value) => value.trim()),
  process.env.RAPIDAPI_KEY_1,
  process.env.RAPIDAPI_KEY_2,
  process.env.RAPIDAPI_KEY_3,
  process.env.RAPIDAPI_KEY_4,
  process.env.RAPIDAPI_KEY_5,
  process.env.RAPIDAPI_KEY_6,
  process.env.RAPIDAPI_KEY_7,
  process.env.RAPIDAPI_KEY_8,
  process.env.RAPIDAPI_KEY_9,
  process.env.RAPIDAPI_KEY_10,
  process.env.RAPIDAPI_KEY_11,
  process.env.RAPIDAPI_KEY_12,
  process.env.RAPIDAPI_KEY_13,
  process.env.RAPIDAPI_KEY_14,
  process.env.RAPIDAPI_KEY_15,
  process.env.RAPIDAPI_KEY_16,
  process.env.RAPIDAPI_KEY_17,
  process.env.RAPIDAPI_KEY_18,
  process.env.RAPIDAPI_KEY_19,
  process.env.RAPIDAPI_KEY_20,
].filter((value) => Boolean(value) && !String(value).startsWith('KEY'))

export const MAX_LEADS_PER_USER = parsePositiveInt(process.env.LEADS_MAX_PER_USER, 10, 1, 25)
export const MIN_LEADS_TARGET = parsePositiveInt(process.env.LEADS_MIN_TARGET_PER_USER, 5, 1, 25)
export const LOOKBACK_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_LOOKBACK_DAYS, 3, 1, 30)
export const MAX_SOURCE_ARTICLES = parsePositiveInt(process.env.LEADS_DISCOVERY_MAX_ARTICLES, 40, 10, 100)
export const OPENAI_MODEL = process.env.LEADS_DISCOVERY_MODEL || 'gpt-4o-mini'
export const LEADS_DEBUG = String(process.env.LEADS_DEBUG || 'false').toLowerCase() === 'true'
export const RECENT_DUPLICATE_WINDOW_DAYS = parsePositiveInt(process.env.LEADS_DISCOVERY_DUPLICATE_WINDOW_DAYS, 60, 14, 180)
export const DISCOVERY_INCLUDE_NEWSAPI = String(process.env.LEADS_DISCOVERY_INCLUDE_NEWSAPI || 'true').toLowerCase() === 'true'
export const DISCOVERY_INCLUDE_GOOGLE_RSS = String(process.env.LEADS_DISCOVERY_INCLUDE_GOOGLE_RSS || 'true').toLowerCase() === 'true'
export const RAPIDAPI_TIMEOUT_MS = parsePositiveInt(process.env.RAPIDAPI_TIMEOUT_MS, 30000, 5000, 120000)
export const RAPIDAPI_MAX_RETRIES = parsePositiveInt(process.env.RAPIDAPI_MAX_RETRIES, 2, 0, 5)
export const COMPANY_SEARCH_MAX_PAGES = parsePositiveInt(process.env.COMPANY_SEARCH_MAX_PAGES, 5, 1, 10)
export const COMPANY_PEOPLE_MAX_CANDIDATES = parsePositiveInt(process.env.COMPANY_PEOPLE_MAX_CANDIDATES, 6, 1, 25)
export const COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS = parsePositiveInt(process.env.COMPANY_PEOPLE_CANDIDATE_TIMEOUT_MS, 240000, 30000, 900000)
export const HTTP_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.HTTP_FETCH_TIMEOUT_MS, 20000, 5000, 120000)
export const PEOPLE_MAX_PAGES = parsePositiveInt(process.env.PEOPLE_MAX_PAGES, 50, 1, 300)
export const PEOPLE_MAX_TOTAL = parsePositiveInt(process.env.PEOPLE_MAX_TOTAL, 1500, 50, 100000)
export const PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP = parsePositiveInt(process.env.PEOPLE_MIN_PAGES_BEFORE_EARLY_STOP, 20, 1, 300)
export const PEOPLE_TARGET_DECISION_MAKERS = parsePositiveInt(process.env.PEOPLE_TARGET_DECISION_MAKERS, 4, 1, 50)
export const SHORTLIST_LIMIT = parsePositiveInt(process.env.SHORTLIST_LIMIT, 15, 5, 50)
export const STRICT_SWEDEN_ONLY = String(process.env.STRICT_SWEDEN_ONLY || 'true').toLowerCase() === 'true'
export const HEURISTIC_FALLBACK_LIMIT = parsePositiveInt(process.env.LEADS_DISCOVERY_HEURISTIC_FALLBACK_LIMIT, 8, 1, 30)
export const LEADS_USER_ID = String(process.env.LEADS_USER_ID || '').trim() || null

export const COMPANY_SEARCH_HOST = 'linkedin-jobs-data-api.p.rapidapi.com'
export const COMPANY_SEARCH_URL = `https://${COMPANY_SEARCH_HOST}/companies/search`
export const PEOPLE_HOST = 'fresh-linkedin-scraper-api.p.rapidapi.com'
export const PEOPLE_URL = `https://${PEOPLE_HOST}/api/v1/company/people`
export const SOURCE_COMPANY_SEARCH = 'linkedin-jobs-data-api'
export const SOURCE_PEOPLE_PROVIDER = 'fresh-linkedin-scraper-api'

export const DISCOVERY_QUERIES = [
  '"rekryterar" OR "anstaller" OR "Head of People" OR "HR-chef"',
  '"expanderar" OR "vaxer" OR "nytt kontor" OR "investering"',
  '"stororder" OR "nytt avtal" OR partnerskap OR upphandling',
  '"people operations" OR "HR Director" OR CHRO OR "talent acquisition"',
  '"kapitalrunda" OR "growth plan" OR "scale up" OR "tillvaxt"',
  '"ramavtal" OR "strategiskt partnerskap" OR "digital transformation"',
  '"employer branding" OR "organisationsutveckling" OR "omorganisation"',
  '"forvarvar" OR "förvärvar" OR "acquires" OR "merger"',
  '"ny fabrik" OR "utokar produktion" OR "production expansion"',
  '"etablerar sig" OR "öppnar nytt kontor" OR "opens office"',
  '"anställer HR" OR "HR Manager" OR "People & Culture"',
  '"tecknar avtal" OR "vinner upphandling" OR "vunnit kontrakt"',
  '"växer teamet" OR "skalar upp" OR "satsar i Sverige"',
]

export const SOURCE_PENALTY_TERMS = [
  'mix vale',
  'vietnam.vn',
]

export const ALLOWED_SIGNALS = new Set([
  'hiring',
  'expansion',
  'order',
  'partnership',
  'public_procurement',
  'investment',
  'restructuring',
  'media',
])

export const COMPANY_SUFFIXES = new Set([
  'ab',
  'aktiebolag',
  'group',
  'holding',
  'holdings',
  'koncern',
  'the',
  'inc',
  'ltd',
  'plc',
  'corp',
  'co',
  'company',
])

export const DEFAULT_TARGET_TITLE_TERMS = [
  'chro',
  'head of hr',
  'hr director',
  'head of people',
  'vp people',
  'hr chef',
  'hr manager',
  'people culture manager',
  'people and culture manager',
  'talent acquisition lead',
  'ld manager',
  'learning development manager',
  'ceo',
  'chief executive',
  'vd',
  'managing director',
  'founder',
  'co founder',
]

export const DEFAULT_FALLBACK_TITLE_TERMS = [
  'hr business partner',
  'people partner',
  'recruiter',
  'talent acquisition specialist',
]

export const DEFAULT_EXCLUDED_TITLE_TERMS = [
  'intern',
  'internship',
  'student',
  'trainee',
  'assistent',
  'assistant',
  'junior',
  'summer',
  'praktik',
  'degree',
  'thesis',
]

export const EXECUTIVE_TITLE_TERMS = [
  'ceo',
  'chief executive',
  'vd',
  'managing director',
  'founder',
  'co founder',
]

export const SWEDEN_SIGNALS = [
  'sweden',
  'sverige',
  'stockholm',
  'goteborg',
  'gothenburg',
  'malmo',
  'orebro',
  'uppsala',
  'linkoping',
  'vasteras',
  'lund',
  'jonkoping',
  'helsingborg',
  'norrkoping',
  'umea',
]

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

export function createRequestCounters() {
  return {
    total_request_attempts: 0,
    request_attempts_company_search: 0,
    request_attempts_company_people: 0,
    company_search_requests: 0,
    people_requests: 0,
    retries: 0,
    errors: 0,
    dropped_without_profile_url: 0,
  }
}
