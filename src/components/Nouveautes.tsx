import { useState } from 'react'

/**
 * Identifiant de la fournée de nouveautés en cours. Le changer rouvre la fenêtre
 * sur tous les postes : c'est le seul geste à faire pour annoncer une mise à jour.
 */
export const VERSION_NOUVEAUTES = '2026-10-13'

const CLE = 'livreur:v3:nouveautes-vues'

function dejaVue(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(CLE) ?? 'null') as string | null) === VERSION_NOUVEAUTES
  } catch {
    return false // stockage inaccessible : on préfère réafficher que planter
  }
}

export function Nouveautes() {
  const [vue, setVue] = useState(dejaVue)
  if (vue) return null

  const fermer = () => {
    try {
      localStorage.setItem(CLE, JSON.stringify(VERSION_NOUVEAUTES))
    } catch {
      /* mode privé : la fenêtre reviendra, ce n'est pas grave */
    }
    setVue(true)
  }

  return (
    <div className="nouveautes-fond">
      <div className="nouveautes" role="dialog" aria-modal="true" aria-labelledby="nouveautes-titre">
        <h2 id="nouveautes-titre">Mise à jour du 13 octobre</h2>

        <p>
          <b>Les itinéraires ne se dégradent plus tout seuls.</b> Quand le calculateur ne
          répondait pas, l'application remplaçait l'itinéraire réel par une estimation à vol
          d'oiseau — kilomètres faux et carte en lignes droites. Elle réessaie désormais
          avant d'abandonner.
        </p>

        <p>
          <b>Si le calcul échoue malgré tout</b>, un bandeau rouge vous le signale, avec un
          bouton <b>« Relancer le calcul »</b>. N'imprimez pas une feuille portant cet
          avertissement : les distances y sont fausses.
        </p>

        <p>
          <b>L'application est nettement plus rapide.</b> Elle transfère cinquante fois moins
          de données qu'avant.
        </p>

        <button className="btn-primary" onClick={fermer} autoFocus>
          J'ai compris
        </button>
      </div>
    </div>
  )
}
