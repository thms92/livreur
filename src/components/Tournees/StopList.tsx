import { useState } from 'react'
import type { Stop } from '../../types'
import { DEPOT } from '../../data/depot'

interface Props {
  stops: Stop[]
  onRemove: (stopId: string) => void
  onReorder: (from: number, to: number) => void
}

export function StopList({ stops, onRemove, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <ol className="stop-list">
      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Départ — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
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
          <button className="stop-remove" aria-label={`Retirer ${s.label}`} onClick={() => onRemove(s.id)}>
            ✕
          </button>
        </li>
      ))}

      <li className="stop-row depot">
        <span className="stop-ico">🏭</span>
        <span className="stop-label">Retour — {DEPOT.label}</span>
        <span className="stop-ville">{DEPOT.ville}</span>
      </li>
    </ol>
  )
}
