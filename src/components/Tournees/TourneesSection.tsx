import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'
import { TourneeList } from './TourneeList'
import { TourneeEditor } from './TourneeEditor'

const today = () => new Date().toISOString().slice(0, 10)

export function TourneesSection() {
  const { livreurs, addTournee } = useLivreur()
  const [editing, setEditing] = useState<string | null>(null)

  if (editing) return <TourneeEditor tourneeId={editing} onClose={() => setEditing(null)} />

  function create() {
    if (!livreurs.length) {
      alert("Ajoutez d'abord un livreur dans la section Livreurs.")
      return
    }
    const id = addTournee({ livreurId: livreurs[0].id, date: today() })
    setEditing(id)
  }

  return (
    <section className="section">
      <div className="section-head">
        <h1>Tournées</h1>
        <button className="btn-primary" onClick={create}>Nouvelle tournée</button>
      </div>
      <TourneeList onOpen={(id) => setEditing(id)} />
    </section>
  )
}
