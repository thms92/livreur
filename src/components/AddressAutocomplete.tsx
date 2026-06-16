import { useId, useState } from 'react'
import type { AddressProvider } from '../services/addressProvider'
import type { Suggestion } from '../types'
import { useAddressAutocomplete } from './useAddressAutocomplete'
import { IcoPin, IcoPlus } from './icons'

interface Props {
  provider: AddressProvider
  onPick: (s: Suggestion) => void
}

export function AddressAutocomplete({ provider, onPick }: Props) {
  const { query, setQuery, suggestions, activeIndex, setActiveIndex, move, reset } =
    useAddressAutocomplete(provider)
  const [open, setOpen] = useState(false)
  const listId = useId()

  function pick(s: Suggestion) {
    onPick(s)
    reset()
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const s = suggestions[activeIndex] ?? suggestions[0]
      if (s) pick(s)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && suggestions.length > 0

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
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
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
            const s = suggestions[activeIndex] ?? suggestions[0]
            if (s) pick(s)
          }}
        >
          <IcoPlus />
        </button>
      </div>

      {showList && (
        <ul className="ac-list" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={'ac-item' + (i === activeIndex ? ' active' : '')}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
              }}
              onClick={() => pick(s)}
            >
              <span className="ac-ico"><IcoPin /></span>
              <span className="ac-text">
                <span className="ac-label">{s.label}</span>
                {s.ville && <span className="ac-ville">{s.ville}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
