import type { D1Database } from '@cloudflare/workers-types'
import { deleteTournee, updateTournee } from '../_db'
import { conflict, gone, json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as Record<string, unknown>
  const par = c.request.headers.get('X-Operateur') ?? undefined
  const r = await updateTournee(c.env.DB, c.params.id, { ...patch, par })
  if (r.ok) return json({ ok: true, version: r.version })
  return r.raison === 'conflit'
    ? conflict('Cette tournée a été modifiée ailleurs.')
    : gone('Cette tournée a été supprimée.')
}

export const onRequestDelete = async (c: Ctx): Promise<Response> => {
  const par = c.request.headers.get('X-Operateur') ?? undefined
  await deleteTournee(c.env.DB, c.params.id, par)
  return json({ ok: true })
}
