import type { D1Database } from '@cloudflare/workers-types'
import { createLivreur } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const body = (await c.request.json().catch(() => null)) as
    | { nom?: string; prenom?: string; telephone?: string } | null
  if (!body || !body.nom?.trim() || !body.prenom?.trim()) return badRequest('nom et prénom requis')
  const livreur = await createLivreur(c.env.DB, { nom: body.nom, prenom: body.prenom, telephone: body.telephone })
  return json(livreur, 201)
}
