import { useState } from 'react'
import type { Stop } from '../../types'
import { DEPOT } from '../../data/depot'

interface Props {
  stops: Stop[]
  departHeure?: string
  retourHeure?: string
  onRemove: (stopId: string) => void
  onReorder: (from: number, to: number) => void
  onSetHeure?: (stopId: string, heure: string) => void
  onDepartHeure?: (heure: string) => void
  onRetourHeure?: (heure: string) => void
}

export function StopList({
  stops, departHeure, retourHeure, onRemove, onReorder, onSetHeure, onDepartHeure, onRetourHeure,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <ol className="stop-list">
      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Départ — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
        <input
          type="time"
          className="stop-time"
          aria-label="Heure de départ du dépôt"
          value={departHeure ?? ''}
          onChange={(e) => onDepartHeure?.(e.target.value)}
        />
      </li>

      {stops.map((s, i) => (
        <li
          key={s.id}
          className={'stop-row' + (dragIndex === i ? ' dragging' : '')}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
        >
          <span className="stop-handle" aria-hidden="true">⋮⋮</span>
          <span className="stop-num">{i + 1}</span>
          <span className="stop-label">{s.label}</span>
          <span className="stop-ville">{s.ville}</span>
          <input
            type="time"
            className="stop-time"
            aria-label={`Heure de livraison ${s.label}`}
            value={s.heure ?? ''}
            onChange={(e) => onSetHeure?.(s.id, e.target.value)}
          />
          <button className="stop-remove" aria-label={`Retirer ${s.label}`} onClick={() => onRemove(s.id)}>
            ✕
          </button>
        </li>
      ))}

      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Retour — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
        <input
          type="time"
          className="stop-time"
          aria-label="Heure de retour au dépôt"
          value={retourHeure ?? ''}
          onChange={(e) => onRetourHeure?.(e.target.value)}
        />
      </li>
    </ol>
  )
}
