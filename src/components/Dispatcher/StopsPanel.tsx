import { useState, type CSSProperties } from 'react'
import type { Stop } from '../../types'
import { IcoList, IcoPlus, IcoX } from '../icons'

interface Props {
  stops: Stop[]
  assign: Record<string, string>
  dispatched: boolean
  addStop: (line: string) => void
  addBulk: (text: string) => void
  removeStop: (id: string) => void
}

export function StopsPanel({ stops, assign, dispatched, addStop, addBulk, removeStop }: Props) {
  const [val, setVal] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')

  function submit() {
    if (val.trim()) {
      addStop(val)
      setVal('')
    }
  }
  function submitBulk() {
    if (bulk.trim()) {
      addBulk(bulk)
      setBulk('')
      setBulkOpen(false)
    }
  }
  const bulkCount = bulk.split('\n').filter((l) => l.trim()).length

  return (
    <div className="stops-panel">
      <div className="stops-head">
        <span className="drivers-label" style={{ padding: 0 }}>
          Arrêts à livrer · <span className="mono">{stops.length}</span>
        </span>
        <button className="link-btn" onClick={() => setBulkOpen((o) => !o)}>
          <IcoList /> Coller une liste
        </button>
      </div>

      <div className="add-row">
        <input
          className="add-input" value={val} placeholder="Adresse, commune…"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="add-btn" onClick={submit} title="Ajouter l'arrêt" aria-label="Ajouter">
          <IcoPlus />
        </button>
      </div>

      {bulkOpen && (
        <div className="bulk">
          <textarea
            className="bulk-area" value={bulk}
            placeholder={'Une adresse par ligne, ex.\n5 rue du Marché, Clamart\n18 av. Pasteur, Sceaux'}
            onChange={(e) => setBulk(e.target.value)} rows={4}
          />
          <button className="btn btn-primary" onClick={submitBulk} style={{ padding: '9px 14px', fontSize: 13 }}>
            Ajouter {bulkCount || ''} arrêt{bulkCount > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <div className="add-hint">Indiquez la commune pour un placement précis sur la carte.</div>

      <div className="stop-list">
        {stops.map((s) => {
          const col = dispatched && assign[s.id] ? assign[s.id] : null
          return (
            <div className="stopitem" key={s.id} style={col ? ({ '--col': col } as CSSProperties) : undefined}>
              <span className={'stopitem-dot' + (col ? ' on' : '')} />
              <div className="stopitem-body">
                <div className="stopitem-ville">{s.ville}</div>
                <div className="stopitem-adr">{s.adresse}</div>
              </div>
              <button className="stopitem-x" onClick={() => removeStop(s.id)} title="Retirer" aria-label="Retirer">
                <IcoX />
              </button>
            </div>
          )
        })}
        {!stops.length && <div className="stop-empty mono">Aucun arrêt — ajoutez une adresse ci-dessus.</div>}
      </div>
    </div>
  )
}
