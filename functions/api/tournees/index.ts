import type { D1Database } from '@cloudflare/workers-types'
import { createTournee } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const body = (await c.request.json().catch(() => null)) as { livreurId?: string; date?: string } | null
  if (!body || !body.livreurId || !body.date) return badRequest('livreurId et date requis')
  const tournee = await createTournee(c.env.DB, { livreurId: body.livreurId, date: body.date })
  return json(tournee, 201)
}
