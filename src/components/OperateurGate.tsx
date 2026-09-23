import { useState, type ReactNode } from 'react'
import { getOperateur, setOperateur } from '../state/operateur'

/**
 * Identité déclarative du poste, demandée une fois. Elle sert à tracer qui fait quoi
 * entre collègues — ce n'est ni une authentification ni une preuve.
 */
export function OperateurGate({ children }: { children: ReactNode }) {
  const [nom, setNom] = useState(() => getOperateur())
  const [saisie, setSaisie] = useState('')

  if (nom) return <>{children}</>

  const valider = () => {
    const propre = saisie.trim()
    if (!propre) return
    setOperateur(propre)
    setNom(propre)
  }

  return (
    <div className="operateur-gate">
      <h1>Qui êtes-vous ?</h1>
      <p className="muted">
        Votre nom sert à indiquer qui a créé ou modifié une tournée. Il est enregistré
        sur ce poste uniquement, et vous ne le saisirez qu’une fois.
      </p>
      <label className="field">
        <span>Votre nom</span>
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valider()}
          autoFocus
        />
      </label>
      <button className="btn-primary" onClick={valider}>Continuer</button>
    </div>
  )
}
