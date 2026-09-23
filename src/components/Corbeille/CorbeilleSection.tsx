import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useLivreur } from '../../state/LivreurContext'
import type { Livreur, Tournee } from '../../types'

const dateFr = (ms: number) => new Date(ms).toLocaleString('fr-FR')

export function CorbeilleSection() {
  const { restaurer, livreurs } = useLivreur()
  const [contenu, setContenu] = useState<{ tournees: Tournee[]; livreurs: Livreur[] } | null>(null)

  const charger = useCallback(() => { void api.getCorbeille().then(setContenu) }, [])
  useEffect(charger, [charger])

  const rendre = async (id: string, type: 'tournee' | 'livreur') => {
    await restaurer(id, type)
    charger()
  }

  if (!contenu) return <p className="empty">Chargement…</p>
  const vide = !contenu.tournees.length && !contenu.livreurs.length

  return (
    <section className="section">
      <h1>Corbeille</h1>
      <p className="muted">Rien n’est jamais supprimé définitivement. Tout élément ici peut être restauré.</p>
      {vide && <p className="empty">La corbeille est vide.</p>}
      <ul className="tournee-list">
        {contenu.tournees.map((t) => {
          const l = livreurs.find((x) => x.id === t.livreurId)
          return (
            <li key={t.id} className="tournee-row">
              <span className="tournee-date">{t.date}</span>
              <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
              <span className="tournee-stats">
                {t.stops.length} arrêt(s)
                {t.deletedAt ? ` · supprimée le ${dateFr(t.deletedAt)}` : ''}
                {t.deletedBy ? ` par ${t.deletedBy}` : ''}
              </span>
              <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => void rendre(t.id, 'tournee')}>
                Restaurer
              </button>
            </li>
          )
        })}
        {contenu.livreurs.map((l) => (
          <li key={l.id} className="tournee-row">
            <span className="tournee-livreur">{l.prenom} {l.nom}</span>
            <span className="tournee-stats">
              {l.deletedAt ? `supprimé le ${dateFr(l.deletedAt)}` : ''}
              {l.deletedBy ? ` par ${l.deletedBy}` : ''}
            </span>
            <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => void rendre(l.id, 'livreur')}>
              Restaurer
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
