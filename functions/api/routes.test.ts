import { describe, expect, it } from 'vitest'
import { makeTestDb } from '../../src/test/d1'
import { onRequestGet as getState } from './state'
import { onRequestPost as postLivreur } from './livreurs/index'
import { onRequestDelete as deleteLivreur } from './livreurs/[id]'
import type { D1Database } from '@cloudflare/workers-types'

function ctx(db: D1Database, opts: { body?: unknown; params?: Record<string, string> } = {}) {
  return {
    env: { DB: db },
    params: opts.params ?? {},
    request: new Request('http://x/api', {
      method: 'POST',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: { 'content-type': 'application/json' },
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

  it('DELETE /livreurs/:id supprime', async () => {
    const db = makeTestDb()
    const created = await postLivreur(ctx(db, { body: { nom: 'B', prenom: 'K' } }))
    const { id } = await created.json()
    const res = await deleteLivreur(ctx(db, { params: { id } }))
    expect(res.status).toBe(200)
    const state = await (await getState({ env: { DB: db } } as never)).json()
    expect(state.livreurs).toEqual([])
  })
})
