import type { D1Database } from '@cloudflare/workers-types'
import { restoreLivreur, restoreTournee } from '../_db'
import { badRequest, json, notFound } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPost = async (c: Ctx): Promise<Response> => {
  const { type } = (await c.request.json().catch(() => ({}))) as { type?: string }
  let rendu: boolean
  if (type === 'tournee') rendu = await restoreTournee(c.env.DB, c.params.id)
  else if (type === 'livreur') rendu = await restoreLivreur(c.env.DB, c.params.id)
  else return badRequest('type attendu : tournee ou livreur')
  // Un identifiant inconnu — ou celui d'un élément de l'autre type — ne touche aucune
  // ligne. Répondre « c'est fait » ferait recharger l'écran pour rien : l'élément serait
  // toujours là, sans la moindre explication.
  if (!rendu) return notFound()
  return json({ ok: true })
}
