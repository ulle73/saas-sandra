import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

const SEARCH_CONFIG = {
  '/calendar': {
    queryKey: 'q',
    placeholder: 'Search meetings, organizer or location...',
  },
  '/dashboard': {
    queryKey: 'q',
    placeholder: 'Search meetings, activity and contacts...',
  },
}

const HEADER_META = {
  '/dashboard': { kicker: 'Overview', helper: 'Track engagement, pipeline pulse and next actions.' },
  '/contacts': { kicker: 'Contacts', helper: 'Keep relationships structured and up to date.' },
  '/contacts/new': { kicker: 'Contacts', helper: 'Add a clean profile to keep the CRM actionable.' },
  '/contacts/[id]': { kicker: 'Contact', helper: 'Review timeline, status and company context in one place.' },
  '/contacts/edit/[id]': { kicker: 'Contact', helper: 'Update details and keep follow-up data trustworthy.' },
  '/companies': { kicker: 'Companies', helper: 'Monitor account health and relevant market signals.' },
  '/companies/new': { kicker: 'Companies', helper: 'Create a company with clear monitoring scope.' },
  '/companies/[id]': { kicker: 'Company', helper: 'Tune keywords and validate incoming news quality.' },
  '/leads': { kicker: 'AI Leads', helper: 'Prioritize high-signal opportunities with confidence.' },
  '/calendar': { kicker: 'Calendar', helper: 'Align meetings with week execution and follow-ups.' },
}

export default function Header({ user, onToggleTheme, theme, onSignOut }) {
  const router = useRouter()
  const searchConfig = SEARCH_CONFIG[router.pathname]
  const queryKey = searchConfig?.queryKey || 'q'
  const isSearchEnabled = Boolean(searchConfig)
  const queryValue = typeof router.query[queryKey] === 'string' ? router.query[queryKey] : ''
  const [searchInput, setSearchInput] = useState('')
  const searchInputRef = useRef(null)
  const headerMeta = useMemo(() => HEADER_META[router.pathname] || {
    kicker: 'Workspace',
    helper: 'Move fast with clean data and focused execution.',
  }, [router.pathname])

  useEffect(() => {
    if (isSearchEnabled) {
      setSearchInput(queryValue)
      return
    }
    setSearchInput('')
  }, [isSearchEnabled, queryValue])

  useEffect(() => {
    if (!isSearchEnabled) return

    const timeoutId = setTimeout(() => {
      const nextQuery = { ...router.query }
      const trimmed = searchInput.trim()

      if (trimmed) nextQuery[queryKey] = trimmed
      else delete nextQuery[queryKey]

      const sameQueryValue = (typeof router.query[queryKey] === 'string' ? router.query[queryKey] : '') === (trimmed || '')
      if (sameQueryValue) return

      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true, scroll: false }
      )
    }, 180)

    return () => clearTimeout(timeoutId)
  }, [isSearchEnabled, queryKey, router, searchInput])

  useEffect(() => {
    if (!isSearchEnabled) return

    const onShortcut = (event) => {
      const target = event.target
      const tagName = String(target?.tagName || '').toLowerCase()
      const isTypingContext = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable
      if (isTypingContext) return

      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [isSearchEnabled])

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <div className="app-topbar-copy">
          {/* <p className="app-topbar-kicker">{headerMeta.kicker}</p> */}
          {/* <p className="app-topbar-helper">{headerMeta.helper}</p> */}
        </div>

        <div className={`app-topbar-search ${isSearchEnabled ? '' : 'is-disabled'}`}>
          <span className="material-symbols-outlined app-topbar-search-icon">search</span>
          <input
            ref={searchInputRef}
            className="app-topbar-search-input"
            placeholder={searchConfig?.placeholder || 'Search is available on dashboard and calendar'}
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            disabled={!isSearchEnabled}
          />
          <span className="app-topbar-search-hint">{isSearchEnabled ? '/ or Ctrl+K' : 'Unavailable here'}</span>
        </div>
      </div>

      <div className="app-topbar-right">
        <button
          onClick={onToggleTheme}
          className="app-topbar-icon-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          <span className="material-symbols-outlined">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        <button onClick={onSignOut} className="app-topbar-icon-btn" title="Sign out" type="button">
          <span className="material-symbols-outlined">logout</span>
        </button>

        <div className="app-topbar-user">
          <div className="app-topbar-user-copy">
            <p className="app-topbar-user-name">{user?.email?.split('@')[0] || 'User'}</p>
            <p className="app-topbar-user-role">Sales Director</p>
          </div>
          <div className="app-topbar-user-avatar">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="Profile" className="app-topbar-user-avatar-image" />
            ) : (
              <span className="material-symbols-outlined">person</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
