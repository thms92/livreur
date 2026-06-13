import { useState, type CSSProperties } from 'react'
import type { Stop, Suggestion } from '../../types'
import type { AddressProvider } from '../../services/addressProvider'
import { IcoList, IcoX } from '../icons'
import { AddressAutocomplete } from './AddressAutocomplete'

interface Props {
  stops: Stop[]
  assign: Record<string, string>
  provider: AddressProvider
  activeColor: string
  addStop: (s: Suggestion) => void
  addBulk: (text: string) => void
  removeStop: (id: string) => void
  assignStop: (id: string) => void
}

export function StopsPanel({ stops, assign, provider, activeColor, addStop, addBulk, removeStop, assignStop }: Props) {
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')

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

      <AddressAutocomplete provider={provider} onPick={addStop} />

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

      <div className="add-hint">Cliquez un arrêt pour l’affecter au chauffeur actif. La croix le retire.</div>

      <div className="stop-list">
        {stops.map((s) => {
          const col = assign[s.id] ?? null
          return (
            <div
              className={'stopitem stopitem-click' + (col ? '' : ' unassigned')}
              key={s.id}
              style={(col ? { '--col': col } : { '--col': activeColor }) as CSSProperties}
              onClick={() => assignStop(s.id)}
              title="Affecter au chauffeur actif"
            >
              <span className={'stopitem-dot' + (col ? ' on' : '')} />
              <div className="stopitem-body">
                <div className="stopitem-ville">{s.ville}</div>
                <div className="stopitem-adr">{s.label}</div>
              </div>
              <button
                className="stopitem-x"
                onClick={(e) => {
                  e.stopPropagation()
                  removeStop(s.id)
                }}
                title="Retirer"
                aria-label="Retirer"
              >
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
