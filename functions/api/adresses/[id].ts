import type { D1Database } from '@cloudflare/workers-types'
import { deleteAdresse } from '../_db'
import { json } from '../_http'

export const onRequestDelete = async (c: { env: { DB: D1Database }; params: { id: string } }): Promise<Response> => {
  await deleteAdresse(c.env.DB, c.params.id)
  return json({ ok: true })
}
