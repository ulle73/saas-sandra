export const AI_PROFILE_FIELDS = [
  'assistant_prompt',
  'icp_description',
  'offer_summary',
  'priority_signals',
  'avoid_signals',
  'cta_style',
  'target_titles',
  'fallback_titles',
  'excluded_titles',
  'custom_instructions',
]

export const DEFAULT_AI_PROFILE = Object.freeze({
  assistant_prompt: 'Du ar en relationsbaserad Sales & Growth Coach inom B2B Learning & Development.',
  icp_description: 'HR-chefer, VD och L&D-chefer i bolag med tydliga tillvaxtsignaler.',
  offer_summary: 'Digitala larresor och L&D-losningar som kopplar kompetensutveckling till affarsnytta.',
  priority_signals: 'Rekrytering, expansion, stororder, partnerskap, omorganisation, ny marknadsetablering.',
  avoid_signals: 'Sma bolag utan HR-funktion, vaga mediesignaler utan koppling till affarsforandring.',
  cta_style: 'Tydlig nasta handling: be om mote, foresla konkret vardeerbjudande och tydligt nasta steg.',
  target_titles: 'CHRO, Head of HR, HR Director, Head of People, VP People, HR-chef, HR Manager, People & Culture Manager, L&D Manager, CEO, VD',
  fallback_titles: 'HR Business Partner, People Partner, Recruiter, Talent Acquisition Specialist',
  excluded_titles: 'Intern, Student, Trainee, Junior, Assistant, Praktik',
  custom_instructions: '',
})

function sanitizeMultiline(value, maxLen) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLen)
}

export function normalizeAiProfileInput(input = {}) {
  const normalized = {}
  for (const field of AI_PROFILE_FIELDS) {
    const fallback = DEFAULT_AI_PROFILE[field] || ''
    normalized[field] = sanitizeMultiline(input[field] ?? fallback, 4000)
  }
  return normalized
}

export function aiProfileToPrompt(profileInput = {}) {
  const profile = normalizeAiProfileInput(profileInput)
  const blocks = [
    `Roll och identitet:\n${profile.assistant_prompt}`,
    `Ideal kundprofil:\n${profile.icp_description}`,
    `Erbjudande och affarsvarde:\n${profile.offer_summary}`,
    `Signaler att prioritera:\n${profile.priority_signals}`,
    `Signaler att vara restriktiv med:\n${profile.avoid_signals}`,
    `Onskad CTA-stil:\n${profile.cta_style}`,
    `Maltitlar att prioritera i personmatchning:\n${profile.target_titles}`,
    `Fallbacktitlar om inga huvudroller hittas:\n${profile.fallback_titles}`,
    `Titlar att undvika i personmatchning:\n${profile.excluded_titles}`,
  ]

  if (profile.custom_instructions) {
    blocks.push(`Extra instruktioner:\n${profile.custom_instructions}`)
  }

  return blocks.join('\n\n')
}
