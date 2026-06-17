import type { D1Database } from '@cloudflare/workers-types'
import { upsertAdresse } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const a = (await c.request.json().catch(() => null)) as
    | { id?: string; label?: string; ville?: string; lat?: number; lng?: number } | null
  if (!a || !a.id || !a.label || typeof a.lat !== 'number' || typeof a.lng !== 'number') return badRequest('adresse invalide')
  await upsertAdresse(c.env.DB, { id: a.id, label: a.label, ville: a.ville ?? '', lat: a.lat, lng: a.lng })
  return json({ ok: true }, 201)
}
