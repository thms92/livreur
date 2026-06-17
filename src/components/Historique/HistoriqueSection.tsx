import { useLivreur } from '../../state/LivreurContext'
import { partitionTournees } from '../../lib/tourneeTime'
import { printTourneeSheet } from '../../services/printSheet'

export function HistoriqueSection() {
  const { tournees, livreurs } = useLivreur()
  const past = partitionTournees(tournees).past.sort((a, b) => b.date.localeCompare(a.date))

  if (!past.length) {
    return (
      <section className="section">
        <h1>Historique</h1>
        <p className="empty">Aucune tournée passée pour le moment.</p>
      </section>
    )
  }

  return (
    <section className="section">
      <h1>Historique</h1>
      <ul className="tournee-list">
        {past.map((t) => {
          const l = livreurs.find((x) => x.id === t.livreurId)
          return (
            <li key={t.id} className="tournee-row" style={{ borderLeftColor: l?.couleur }}>
              <span className="tournee-date">{t.date}</span>
              <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
              <span className="tournee-stats">
                {t.stops.length} arrêt(s)
                {t.route ? ` · ${t.route.km.toFixed(0)} km · ${Math.round(t.route.min)} min` : ''}
              </span>
              <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => printTourneeSheet(t, l)}>
                Imprimer
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
