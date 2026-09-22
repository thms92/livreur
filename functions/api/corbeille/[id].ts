import type { D1Database } from '@cloudflare/workers-types'
import { restoreLivreur, restoreTournee } from '../_db'
import { badRequest, json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPost = async (c: Ctx): Promise<Response> => {
  const { type } = (await c.request.json().catch(() => ({}))) as { type?: string }
  if (type === 'tournee') await restoreTournee(c.env.DB, c.params.id)
  else if (type === 'livreur') await restoreLivreur(c.env.DB, c.params.id)
  else return badRequest('type attendu : tournee ou livreur')
  return json({ ok: true })
}
