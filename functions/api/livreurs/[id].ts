import type { D1Database } from '@cloudflare/workers-types'
import { deleteLivreur, updateLivreur } from '../_db'
import { json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as { nom?: string; prenom?: string; telephone?: string }
  await updateLivreur(c.env.DB, c.params.id, patch)
  return json({ ok: true })
}

export const onRequestDelete = async (c: Ctx): Promise<Response> => {
  await deleteLivreur(c.env.DB, c.params.id)
  return json({ ok: true })
}
