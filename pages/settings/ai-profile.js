import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { DEFAULT_AI_PROFILE, normalizeAiProfileInput, aiProfileToPrompt } from '../../lib/aiProfile'

const PROFILE_FIELDS = [
  {
    key: 'assistant_prompt',
    label: 'Roll och identitet',
    helper: 'Beskriv hur AI:n ska upptrada och coacha.',
    rows: 4,
  },
  {
    key: 'icp_description',
    label: 'Ideal kundprofil',
    helper: 'Vilka roller/bolag ska prioriteras.',
    rows: 3,
  },
  {
    key: 'offer_summary',
    label: 'Erbjudande och affarsnytta',
    helper: 'Vad ni saljer och vilken affarsnytta det skapar.',
    rows: 3,
  },
  {
    key: 'priority_signals',
    label: 'Signaler att prioritera',
    helper: 'Vilka signaler ska ge hogre prioritet.',
    rows: 3,
  },
  {
    key: 'avoid_signals',
    label: 'Signaler att undvika',
    helper: 'Vilka case ska filtreras ner eller bort.',
    rows: 3,
  },
  {
    key: 'cta_style',
    label: 'CTA-stil',
    helper: 'Hur nasta steg ska foreslas i lead-resonemang.',
    rows: 3,
  },
  {
    key: 'target_titles',
    label: 'Maltitlar att prioritera',
    helper: 'Ex: CHRO, Head of People, HR-chef, L&D Manager, VD.',
    rows: 3,
  },
  {
    key: 'fallback_titles',
    label: 'Fallbacktitlar',
    helper: 'Anvands om huvudroller saknas. Ex: HRBP, People Partner, Recruiter.',
    rows: 3,
  },
  {
    key: 'excluded_titles',
    label: 'Titlar att undvika',
    helper: 'Ex: Intern, Junior, Student, Praktik, Assistant.',
    rows: 3,
  },
  {
    key: 'custom_instructions',
    label: 'Extra instruktioner',
    helper: 'Valfritt: specifika regler for just den har kunden.',
    rows: 4,
  },
]

export default function AiProfileSettings({ session }) {
  const router = useRouter()
  const [formState, setFormState] = useState(() => ({ ...DEFAULT_AI_PROFILE }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (!session) {
      router.push('/')
      return
    }

    let active = true

    const loadProfile = async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: loadError } = await supabase
          .from('ai_profiles')
          .select('assistant_prompt, icp_description, offer_summary, priority_signals, avoid_signals, cta_style, target_titles, fallback_titles, excluded_titles, custom_instructions')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (loadError) {
          throw loadError
        }

        if (!active) return
        if (data) {
          setFormState(normalizeAiProfileInput(data))
        } else {
          setFormState({ ...DEFAULT_AI_PROFILE })
        }
      } catch (loadErr) {
        if (!active) return
        const message = String(loadErr?.message || '')
        if (/ai_profiles/i.test(message)) {
          setError('Tabellen ai_profiles saknas i databasen. Kor npm run db:init och forsok igen.')
        } else {
          setError(message || 'Failed to load AI profile.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProfile()
    return () => {
      active = false
    }
  }, [router, session])

  const promptPreview = useMemo(() => aiProfileToPrompt(formState), [formState])

  const handleChange = (key, value) => {
    setFormState((current) => ({ ...current, [key]: value }))
  }

  const handleLoadDefaults = () => {
    setFormState({ ...DEFAULT_AI_PROFILE })
    setInfo('Standardprofil laddad lokalt. Klicka Save Profile for att spara.')
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!session?.user?.id) return

    setSaving(true)
    setError('')
    setInfo('')
    try {
      const payload = normalizeAiProfileInput(formState)
      const { error: upsertError } = await supabase
        .from('ai_profiles')
        .upsert(
          {
            user_id: session.user.id,
            ...payload,
          },
          { onConflict: 'user_id' }
        )

      if (upsertError) throw upsertError

      setFormState(payload)
      setInfo('AI profile saved. Nasta leads-korning anvander den nya profilen.')
    } catch (saveErr) {
      const message = String(saveErr?.message || '')
      if (/ai_profiles/i.test(message)) {
        setError('Tabellen ai_profiles saknas i databasen. Kor npm run db:init och forsok igen.')
      } else {
        setError(message || 'Failed to save AI profile.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!session) return null

  return (
    <div className="page-wide page-stack ux-section-stagger">
      <section className="glass-panel text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">AI Settings</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Lead Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Styr hur lead-motorn prioriterar bolag och formulerar resonemang for just den har kunden.
        </p>
      </section>

      <form className="glass-panel space-y-6" onSubmit={handleSubmit}>
        {loading ? <p className="small-copy muted">Loading profile...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {info ? <p className="form-info">{info}</p> : null}

        {PROFILE_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="form-label" htmlFor={field.key}>{field.label}</label>
            <textarea
              id={field.key}
              rows={field.rows}
              className="input-field"
              value={formState[field.key] || ''}
              onChange={(event) => handleChange(field.key, event.target.value)}
              disabled={loading || saving}
            />
            <p className="tiny-copy muted top-gap-xs">{field.helper}</p>
          </div>
        ))}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleLoadDefaults} disabled={saving}>
            Load Defaults
          </button>
        </div>
      </form>

      <section className="glass-panel">
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">Prompt Preview</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Denna text injiceras i lead-generatorn tillsammans med basreglerna.
        </p>
        <pre className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 font-mono overflow-auto" style={{ minHeight: '220px', whiteSpace: 'pre-wrap' }}>
          {promptPreview}
        </pre>
      </section>
    </div>
  )
}
