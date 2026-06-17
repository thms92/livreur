import { useEffect, useId, useState } from 'react'
import type { AddressProvider } from '../services/addressProvider'
import type { Suggestion } from '../types'
import { useAddressAutocomplete } from './useAddressAutocomplete'
import { IcoPin, IcoPlus } from './icons'

interface Props {
  provider: AddressProvider
  onPick: (s: Suggestion) => void
  saved?: Suggestion[]
  onRemoveSaved?: (id: string) => void
}

interface Item {
  s: Suggestion
  saved: boolean
}

export function AddressAutocomplete({ provider, onPick, saved = [], onRemoveSaved }: Props) {
  const { query, setQuery, suggestions, reset } = useAddressAutocomplete(provider)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const q = query.trim().toLowerCase()
  const savedMatches = saved
    .filter((a) => q === '' || a.label.toLowerCase().includes(q) || a.ville.toLowerCase().includes(q))
    .slice(0, 8)
  const savedIds = new Set(savedMatches.map((a) => a.id))
  const items: Item[] = [
    ...savedMatches.map((a) => ({ s: a, saved: true })),
    ...suggestions.filter((s) => !savedIds.has(s.id)).map((s) => ({ s, saved: false })),
  ]

  // remet la sélection en tête quand la requête change
  useEffect(() => {
    setActive(0)
  }, [query])

  function pick(s: Suggestion) {
    onPick(s)
    reset()
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active] ?? items[0]
      if (it) pick(it.s)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <div className="ac">
      <div className="add-row">
        <input
          className="add-input"
          value={query}
          placeholder="Adresse, commune…"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        <button
          className="add-btn"
          title="Ajouter l'arrêt"
          aria-label="Ajouter"
          onClick={() => {
            const it = items[active] ?? items[0]
            if (it) pick(it.s)
          }}
        >
          <IcoPlus />
        </button>
      </div>

      {showList && (
        <ul className="ac-list" id={listId} role="listbox">
          {items.map((it, i) => (
            <li
              key={(it.saved ? 'saved-' : 'ban-') + it.s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={'ac-item' + (i === active ? ' active' : '') + (it.saved ? ' saved' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(it.s)}
            >
              <span className="ac-ico">{it.saved ? '★' : <IcoPin />}</span>
              <span className="ac-text">
                <span className="ac-label">{it.s.label}</span>
                {it.s.ville && <span className="ac-ville">{it.s.ville}</span>}
              </span>
              {it.saved && onRemoveSaved && (
                <button
                  className="ac-remove"
                  aria-label={`Retirer ${it.s.label} du carnet`}
                  title="Retirer du carnet"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveSaved(it.s.id)
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
