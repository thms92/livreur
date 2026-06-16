import type { Tournee } from '../../types'
import type { LivreurWithColor } from '../../state/LivreurContext'

interface Props {
  livreur: LivreurWithColor
  tournees: Tournee[]
}

export function ChauffeurCard({ livreur, tournees }: Props) {
  const stopsTotal = tournees.reduce((n, t) => n + t.stops.length, 0)
  const kmTotal = tournees.reduce((n, t) => n + (t.route?.km ?? 0), 0)
  const minTotal = tournees.reduce((n, t) => n + (t.route?.min ?? 0), 0)

  return (
    <div className="chauffeur-card" style={{ borderLeftColor: livreur.couleur }}>
      <div className="chauffeur-head">
        <span className="dot" style={{ background: livreur.couleur }} />
        <b>{livreur.prenom} {livreur.nom}</b>
        {livreur.telephone && <span className="muted">· {livreur.telephone}</span>}
        <span className="chauffeur-stats">
          {tournees.length
            ? `${stopsTotal} arrêts · ${kmTotal.toFixed(0)} km · ${Math.round(minTotal)} min`
            : "Aucune tournée ce jour"}
        </span>
      </div>
      {tournees.map((t) => (
        <div key={t.id} className="chauffeur-trip">
          🏭 {t.stops.map((s, i) => `→ ${i + 1}. ${s.ville || s.label}`).join(' ')} → 🏭
        </div>
      ))}
    </div>
  )
}
