import { useEffect, useRef } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { AddressAutocomplete } from '../AddressAutocomplete'
import { TourneeMap } from '../map/TourneeMap'
import { StopList } from './StopList'
import { printTourneeSheet } from '../../services/printSheet'

interface Props {
  tourneeId: string
  onClose: () => void
}

export function TourneeEditor({ tourneeId, onClose }: Props) {
  const {
    livreurs,
    tournees,
    provider,
    adresses,
    removeAdresse,
    updateTournee,
    addStopToTournee,
    removeStopFromTournee,
    reorderStops,
    optimizeTournee,
    refreshRoute,
  } = useLivreur()

  const tournee = tournees.find((t) => t.id === tourneeId)
  const livreur = livreurs.find((l) => l.id === tournee?.livreurId)

  // Après une modification des arrêts, on relance le bon calcul :
  //  - 'optimize' (ajout/suppression) → réordonne via OSRM /trip
  //  - 'route'    (glisser-déposer)   → garde l'ordre manuel, recalcule km/temps
  const pendingRef = useRef<'optimize' | 'route' | null>(null)
  const stopsSig = tournee ? tournee.stops.map((s) => s.id).join(',') : ''

  useEffect(() => {
    if (!tournee) return
    const kind = pendingRef.current
    pendingRef.current = null
    if (kind === 'optimize') optimizeTournee(tournee.id)
    else if (kind === 'route') refreshRoute(tournee.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclenché uniquement quand la liste d'arrêts change
  }, [stopsSig])

  if (!tournee) return null

  return (
    <div className="tournee-editor">
      <div className="editor-form">
        <div className="editor-head">
          <button className="btn-ghost" onClick={onClose}>← Retour</button>
          <div className="field">
            <span>Livreur</span>
            <select
              value={tournee.livreurId}
              onChange={(e) => updateTournee(tournee.id, { livreurId: e.target.value })}
            >
              {livreurs.map((l) => (
                <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>
              ))}
            </select>
          </div>
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={tournee.date}
              onChange={(e) => updateTournee(tournee.id, { date: e.target.value })}
            />
          </label>
        </div>

        <div className="field">
          <span>Ajouter un arrêt</span>
          <AddressAutocomplete
            provider={provider}
            saved={adresses}
            onRemoveSaved={removeAdresse}
            onPick={(s) => {
              pendingRef.current = 'optimize'
              addStopToTournee(tournee.id, s)
            }}
          />
        </div>

        <StopList
          stops={tournee.stops}
          onRemove={(id) => {
            pendingRef.current = 'optimize'
            removeStopFromTournee(tournee.id, id)
          }}
          onReorder={(from, to) => {
            pendingRef.current = 'route'
            reorderStops(tournee.id, from, to)
          }}
        />

        <div className="editor-footer">
          <button className="btn-ghost" onClick={() => optimizeTournee(tournee.id)}>
            Ré-optimiser
          </button>
          <button className="btn-ghost" onClick={() => printTourneeSheet(tournee, livreur)}>
            Imprimer
          </button>
          <span className="total">
            {tournee.route
              ? `${tournee.route.km.toFixed(0)} km · ${Math.round(tournee.route.min)} min` +
                (tournee.route.approximate ? ' (approx. hors-ligne)' : '')
              : '—'}
          </span>
          <button className="btn-primary" onClick={onClose}>Enregistrer la tournée</button>
        </div>
      </div>

      <TourneeMap
        tournees={[{ id: tournee.id, couleur: livreur?.couleur ?? 'var(--c-1)', stops: tournee.stops, route: tournee.route }]}
      />
    </div>
  )
}
