import type { D1Database } from '@cloudflare/workers-types'
import { getSync } from './_db'
import { json } from './_http'

// Endpoint de sondage : voir le commentaire sur getSync() dans _db.ts pour la raison
// d'être de cette route (éviter de faire circuler /api/state, 3,4 Mo, toutes les 60 s).
export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getSync(c.env.DB))
