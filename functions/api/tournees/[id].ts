import type { D1Database } from '@cloudflare/workers-types'
import { deleteTournee, updateTournee } from '../_db'
import { badRequest, conflict, gone, json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as Record<string, unknown>
  const par = c.request.headers.get('X-Operateur') ?? undefined
  // La version est obligatoire : sans elle, l'écriture passerait sans contrôle et
  // écraserait en silence le travail de l'autre poste — précisément ce que le verrou
  // existe pour empêcher. Ce n'est pas qu'une précaution contre un client fautif : un
  // onglet resté ouvert sur le bundle d'avant le déploiement envoie exactement cela.
  if (typeof patch.version !== 'number') return badRequest('version requise')
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
