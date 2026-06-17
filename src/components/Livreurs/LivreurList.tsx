import { useLivreur } from '../../state/LivreurContext'

export function LivreurList() {
  const { livreurs, tournees, removeLivreur } = useLivreur()

  if (!livreurs.length) {
    return <p className="empty">Aucun livreur. Ajoutez-en un avec le formulaire.</p>
  }

  function onRemove(id: string, nomComplet: string) {
    const count = tournees.filter((t) => t.livreurId === id).length
    const msg = count
      ? `Supprimer ${nomComplet} et ses ${count} tournée(s) ?`
      : `Supprimer ${nomComplet} ?`
    if (confirm(msg)) removeLivreur(id)
  }

  return (
    <ul className="livreur-list">
      {livreurs.map((l) => {
        const nomComplet = `${l.prenom} ${l.nom}`
        const count = tournees.filter((t) => t.livreurId === l.id).length
        return (
          <li key={l.id} className="livreur-row">
            <span className="dot" style={{ background: l.couleur }} />
            <span className="livreur-name">{nomComplet}</span>
            {l.telephone && <span className="livreur-tel">{l.telephone}</span>}
            <span className="livreur-count">{count} tournée(s)</span>
            <button className="btn-danger" onClick={() => onRemove(l.id, nomComplet)}>
              Supprimer
            </button>
          </li>
        )
      })}
    </ul>
  )
}
