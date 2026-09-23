import { useLivreur } from '../../state/LivreurContext'
import { AddressAutocomplete } from '../AddressAutocomplete'
import { TourneeMap } from '../map/TourneeMap'
import { StopList } from './StopList'
import { printTourneeSheet } from '../../services/printSheet'
import { formatDuree } from '../../lib/tourneeTime'

interface Props {
  tourneeId: string
  onClose: () => void
}

export function TourneeEditor({ tourneeId, onClose }: Props) {
  const {
    livreurs,
    livreursTous,
    tournees,
    provider,
    adresses,
    removeAdresse,
    updateTournee,
    addStopToTournee,
    removeStopFromTournee,
    reorderStops,
    setStopHeure,
    setTourneeHeure,
    sortTourneeByTime,
    optimizeTournee,
    setSansPeage,
  } = useLivreur()

  const tournee = tournees.find((t) => t.id === tourneeId)
  // Résolution sur la liste complète : la fiche et la carte doivent rester justes même
  // si le livreur affecté a depuis été mis à la corbeille. Le sélecteur, lui, n'offre
  // que les actifs — on ne réaffecte pas une tournée à quelqu'un qui n'est plus là.
  const livreur = livreursTous.find((l) => l.id === tournee?.livreurId)

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

        {(tournee.createdBy || tournee.updatedBy) && (
          <p className="muted attribution">
            {tournee.createdBy ? `Créée par ${tournee.createdBy}` : ''}
            {tournee.updatedBy ? ` · modifiée par ${tournee.updatedBy}` : ''}
          </p>
        )}

        <div className="field">
          <span>Ajouter un arrêt</span>
          <AddressAutocomplete
            provider={provider}
            saved={adresses}
            onRemoveSaved={removeAdresse}
            onPick={(s) => addStopToTournee(tournee.id, s)}
          />
        </div>

        <StopList
          stops={tournee.stops}
          departHeure={tournee.departHeure}
          retourHeure={tournee.retourHeure}
          onRemove={(id) => removeStopFromTournee(tournee.id, id)}
          onReorder={(from, to) => reorderStops(tournee.id, from, to)}
          onSetHeure={(id, heure) => setStopHeure(tournee.id, id, heure)}
          onDepartHeure={(heure) => setTourneeHeure(tournee.id, { departHeure: heure })}
          onRetourHeure={(heure) => setTourneeHeure(tournee.id, { retourHeure: heure })}
        />

        <label className="field inline">
          <input
            type="checkbox"
            checked={tournee.sansPeage ?? true}
            onChange={(e) => setSansPeage(tournee.id, e.target.checked)}
          />
          <span>Sans péage</span>
        </label>

        <div className="editor-footer">
          <button className="btn-ghost" onClick={() => sortTourneeByTime(tournee.id)}>
            Trier par heure
          </button>
          <button className="btn-ghost" onClick={() => optimizeTournee(tournee.id)}>
            Ré-optimiser
          </button>
          <button className="btn-ghost" onClick={() => printTourneeSheet(tournee, livreur)}>
            Imprimer
          </button>
          <span className="total">
            {tournee.route
              ? `${tournee.route.km.toFixed(0)} km · ${formatDuree(tournee.route.min)}` +
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
