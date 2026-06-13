import type { Stop } from '../../types'

interface Props {
  arrets: Stop[]
  idx: number
  total: number
  fini: boolean
}

export function StopList({ arrets, idx, total, fini }: Props) {
  return (
    <div className="stoplist">
      <div className="stoplist-head">
        <span className="t">Arrêts de la tournée</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {Math.min(idx, total)}/{total} livrés
        </span>
      </div>
      {arrets.map((s, i) => {
        const done = i < idx
        const cur = i === idx && !fini
        return (
          <div key={s.id} className={'srow' + (done ? ' done-row' : '') + (cur ? ' current-row' : '')}>
            <span className="srow-num">{done ? '✓' : i + 1}</span>
            <div className="srow-body">
              <div className="srow-ville">{s.ville}</div>
              <div className="srow-adr">{s.label}</div>
            </div>
            {cur && <span className="srow-flag">en cours</span>}
          </div>
        )
      })}
    </div>
  )
}
