import { useLivreur } from '../../state/LivreurContext'

interface Props {
  onOpen: (tourneeId: string) => void
}

export function TourneeList({ onOpen }: Props) {
  const { tournees, livreurs, removeTournee } = useLivreur()

  if (!tournees.length) return <p className="empty">Aucune tournée. Créez-en une.</p>

  const sorted = [...tournees].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <ul className="tournee-list">
      {sorted.map((t) => {
        const l = livreurs.find((x) => x.id === t.livreurId)
        return (
          <li key={t.id} className="tournee-row" style={{ borderLeftColor: l?.couleur }}>
            <span className="tournee-date">{t.date}</span>
            <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
            <span className="tournee-stats">
              {t.stops.length} arrêt(s)
              {t.route ? ` · ${t.route.km.toFixed(0)} km · ${Math.round(t.route.min)} min` : ''}
            </span>
            <button className="btn-ghost" onClick={() => onOpen(t.id)}>Modifier</button>
            <button className="btn-danger" onClick={() => confirm('Supprimer cette tournée ?') && removeTournee(t.id)}>
              Supprimer
            </button>
          </li>
        )
      })}
    </ul>
  )
}
