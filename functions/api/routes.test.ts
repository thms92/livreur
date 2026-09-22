import { describe, expect, it } from 'vitest'
import { makeTestDb } from '../../src/test/d1'
import { onRequestGet as getState } from './state'
import { onRequestPost as postLivreur } from './livreurs/index'
import { onRequestDelete as deleteLivreur } from './livreurs/[id]'
import { onRequestPut as putTournee } from './tournees/[id]'
import { createLivreur, createTournee, deleteTournee } from './_db'
import type { D1Database } from '@cloudflare/workers-types'

function ctx(
  db: D1Database,
  opts: {
    body?: unknown; params?: Record<string, string>; method?: string; headers?: Record<string, string>
  } = {},
) {
  return {
    env: { DB: db },
    params: opts.params ?? {},
    request: new Request('http://x/api', {
      method: opts.method ?? 'POST',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: { 'content-type': 'application/json', ...opts.headers },
    }),
  } as never
}

describe('routes API', () => {
  it('POST /livreurs crée puis GET /state le renvoie', async () => {
    const db = makeTestDb()
    const created = await postLivreur(ctx(db, { body: { nom: 'Benali', prenom: 'Karim', telephone: '06' } }))
    expect(created.status).toBe(201)
    const res = await getState({ env: { DB: db } } as never)
    const state = await res.json()
    expect(state.livreurs[0]).toMatchObject({ nom: 'Benali', colorIndex: 0 })
  })

  it('POST /livreurs sans nom → 400', async () => {
    const db = makeTestDb()
    const res = await postLivreur(ctx(db, { body: { prenom: 'Karim' } }))
    expect(res.status).toBe(400)
  })

  it('DELETE /livreurs/:id marque le livreur sans le supprimer (corbeille)', async () => {
    const db = makeTestDb()
    const created = await postLivreur(ctx(db, { body: { nom: 'B', prenom: 'K' } }))
    const { id } = await created.json()
    const res = await deleteLivreur(ctx(db, { params: { id } }))
    expect(res.status).toBe(200)
    const state = await (await getState({ env: { DB: db } } as never)).json()
    const vu = state.livreurs.find((l: { id: string }) => l.id === id)
    expect(vu).toBeDefined()
    expect(vu.deletedAt).toBeGreaterThan(0)
  })
})

// Le code HTTP EST le contrat que le front distingue (200 accepté, 409 conflit à relire,
// 410 tournée disparue) : sans ces tests, rien ne signale une régression sur la traduction
// ResultatEcriture → réponse, et ce fichier n'est de toute façon pas couvert par tsc -b
// (tsconfig.app.json ne porte que sur src/).
describe('PUT /tournees/:id — verrou optimiste (409/410)', () => {
  it('version à jour → 200 avec la nouvelle version dans le corps', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })

    const res = await putTournee(ctx(db, {
      method: 'PUT', params: { id: t.id }, body: { date: '2026-09-23', version: 1 },
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, version: 2 })
  })

  it('version périmée → 409', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await putTournee(ctx(db, {
      method: 'PUT', params: { id: t.id }, body: { date: '2026-09-23', version: 1 },
    }))

    const res = await putTournee(ctx(db, {
      method: 'PUT', params: { id: t.id }, body: { date: '2999-01-01', version: 1 },
    }))

    expect(res.status).toBe(409)
  })

  it('tournée en corbeille → 410', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await deleteTournee(db, t.id, 'Thomas')

    const res = await putTournee(ctx(db, {
      method: 'PUT', params: { id: t.id }, body: { date: '2999-01-01', version: 1 },
    }))

    expect(res.status).toBe(410)
  })

  it('l’en-tête X-Operateur est reporté dans updated_by', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })

    const res = await putTournee(ctx(db, {
      method: 'PUT',
      params: { id: t.id },
      headers: { 'X-Operateur': 'Thomas' },
      body: { date: '2026-09-23' },
    }))

    expect(res.status).toBe(200)
    const row = await db
      .prepare('SELECT updated_by FROM tournees WHERE id = ?')
      .bind(t.id)
      .first<{ updated_by: string }>()
    expect(row?.updated_by).toBe('Thomas')
  })
})
