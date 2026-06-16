import { useState } from 'react'
import { useLivreur } from '../../state/LivreurContext'

export function LivreurForm() {
  const { addLivreur } = useLivreur()
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [telephone, setTelephone] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !prenom.trim()) return
    addLivreur({ nom, prenom, telephone })
    setNom('')
    setPrenom('')
    setTelephone('')
  }

  return (
    <form className="livreur-form" onSubmit={submit}>
      <label className="field">
        <span>Nom</span>
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <label className="field">
        <span>Prénom</span>
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      </label>
      <label className="field">
        <span>Téléphone</span>
        <input
          type="tel"
          inputMode="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary">
        Enregistrer
      </button>
    </form>
  )
}
