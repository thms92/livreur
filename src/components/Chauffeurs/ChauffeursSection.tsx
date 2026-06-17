import { useMemo, useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { ChauffeurCard } from './ChauffeurCard'
import { TourneeMap } from '../map/TourneeMap'

const todayIso = () => new Date().toISOString().slice(0, 10)

/** "2026-06-17" → "Mardi 17 juin 2026" (lisible). */
function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Date par défaut : aujourd'hui si planifié, sinon la prochaine date à venir, sinon la plus récente. */
function pickDefault(dates: string[]): string {
  if (!dates.length) return ''
  const today = todayIso()
  if (dates.includes(today)) return today
  const future = dates.filter((d) => d >= today)
  return future.length ? future[0] : dates[dates.length - 1]
}

export function ChauffeursSection() {
  const { livreurs, tournees } = useLivreur()

  // dates distinctes ayant au moins une tournée, triées
  const availableDates = useMemo(
    () => Array.from(new Set(tournees.map((t) => t.date))).sort(),
    [tournees],
  )

  const [date, setDate] = useState(() => pickDefault(availableDates))
  const selected = availableDates.includes(date) ? date : pickDefault(availableDates)

  const ofDay = tournees.filter((t) => t.date === selected)

  return (
    <section className="section">
      <div className="section-head">
        <h1>Chauffeurs</h1>
        {availableDates.length > 0 && (
          <label className="field inline">
            <span>Date</span>
            <select
              className="date-select"
              value={selected}
              onChange={(e) => setDate(e.target.value)}
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDateFr(d)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!livreurs.length && <p className="empty">Aucun livreur.</p>}
      {livreurs.length > 0 && availableDates.length === 0 && (
        <p className="empty">Aucune tournée planifiée.</p>
      )}

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
