import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { ChauffeurCard } from './ChauffeurCard'
import { TourneeMap } from '../map/TourneeMap'

const today = () => new Date().toISOString().slice(0, 10)

export function ChauffeursSection() {
  const { livreurs, tournees } = useLivreur()
  const [date, setDate] = useState(today())

  const ofDay = tournees.filter((t) => t.date === date)

  return (
    <section className="section">
      <div className="section-head">
        <h1>Chauffeurs</h1>
        <label className="field inline">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {!livreurs.length && <p className="empty">Aucun livreur.</p>}

      <div className="chauffeur-cards">
        {livreurs.map((l) => (
          <ChauffeurCard key={l.id} livreur={l} tournees={ofDay.filter((t) => t.livreurId === l.id)} />
        ))}
      </div>

      {ofDay.length > 0 && (
        <TourneeMap
          tournees={ofDay.map((t) => ({
            id: t.id,
            couleur: livreurs.find((l) => l.id === t.livreurId)?.couleur ?? 'var(--c-1)',
            stops: t.stops,
            route: t.route,
          }))}
        />
      )}
    </section>
  )
}
