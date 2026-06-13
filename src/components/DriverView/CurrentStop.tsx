import type { Stop } from '../../types'
import { IcoCheck, IcoMaps } from '../icons'
import { openInMaps } from './openInMaps'

interface Props {
  courant: Stop
  idx: number
  total: number
  onAdvance: () => void
}

export function CurrentStop({ courant, idx, total, onAdvance }: Props) {
  return (
    <div className="current">
      <div className="current-top">
        <span className="lab">Arrêt en cours</span>
        <span className="cnt mono">Arrêt {idx + 1}/{total}</span>
      </div>
      <div className="current-body">
        <div className="current-ville">{courant.ville}</div>
        <div className="current-adr">{courant.adresse}</div>
        <div className="current-actions">
          <button className="btn btn-maps" onClick={() => openInMaps(courant)}>
            <IcoMaps /> Ouvrir cet arrêt dans Maps
          </button>
          <button className="btn btn-next" onClick={onAdvance}>
            <IcoCheck /> Arrêt livré, suivant
          </button>
        </div>
      </div>
    </div>
  )
}
