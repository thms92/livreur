import type { D1Database } from '@cloudflare/workers-types'
import { deleteTournee, updateTournee, type RouteResult, type Stop } from '../_db'
import { json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as {
    livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
  }
  await updateTournee(c.env.DB, c.params.id, patch)
  return json({ ok: true })
}

export const onRequestDelete = async (c: Ctx): Promise<Response> => {
  await deleteTournee(c.env.DB, c.params.id)
  return json({ ok: true })
}
