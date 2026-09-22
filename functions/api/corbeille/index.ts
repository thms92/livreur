import type { D1Database } from '@cloudflare/workers-types'
import { getCorbeille } from '../_db'
import { json } from '../_http'

export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getCorbeille(c.env.DB))
