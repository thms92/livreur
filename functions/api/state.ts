import type { D1Database } from '@cloudflare/workers-types'
import { getState } from './_db'
import { json } from './_http'

export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getState(c.env.DB))
