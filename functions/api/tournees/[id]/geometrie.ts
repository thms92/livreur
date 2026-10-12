import type { D1Database } from '@cloudflare/workers-types'
import { getGeometrie } from '../../_db'
import { json } from '../../_http'

type Ctx = { env: { DB: D1Database }; params: { id: string } }

export const onRequestGet = async (c: Ctx): Promise<Response> =>
  json({ geometry: await getGeometrie(c.env.DB, c.params.id) })
