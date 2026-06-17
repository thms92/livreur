import { describe, expect, it } from 'vitest'
import { makeTestDb } from '../../src/test/d1'
import {
  getState, createLivreur, updateLivreur, deleteLivreur,
  createTournee, updateTournee, deleteTournee,
  upsertAdresse, deleteAdresse,
} from './_db'

describe('_db — livreurs', () => {
  it('crée avec color_index auto (0 puis 1) et liste via getState', async () => {
    const db = makeTestDb()
    const a = await createLivreur(db, { nom: 'Benali', prenom: 'Karim', telephone: '06' })
    const b = await createLivreur(db, { nom: 'Martin', prenom: 'Léa' })
    expect(a.colorIndex).toBe(0)
    expect(b.colorIndex).toBe(1)
    const state = await getState(db)
    expect(state.livreurs.map((l) => l.nom)).toEqual(['Benali', 'Martin'])
  })

  it('met à jour puis supprime (cascade tournées)', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    await updateLivreur(db, l.id, { telephone: '0700' })
    await createTournee(db, { livreurId: l.id, date: '2026-06-18' })
    expect((await getState(db)).tournees).toHaveLength(1)
    await deleteLivreur(db, l.id)
    const state = await getState(db)
    expect(state.livreurs).toEqual([])
    expect(state.tournees).toEqual([]) // cascade
  })
})

describe('_db — tournées', () => {
  it('crée, met à jour stops/route (JSON), supprime', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-06-18' })
    expect(t.stops).toEqual([])
    await updateTournee(db, t.id, {
      stops: [{ id: 's1', label: 'A', ville: 'V', lat: 48, lng: 1 }],
      route: { km: 10, min: 15, geometry: [[48, 1]], optimized: true, approximate: false },
    })
    const state = await getState(db)
    expect(state.tournees[0].stops.map((s) => s.label)).toEqual(['A'])
    expect(state.tournees[0].route).toMatchObject({ km: 10, optimized: true })
    await deleteTournee(db, t.id)
    expect((await getState(db)).tournees).toEqual([])
  })
})

describe('_db — adresses', () => {
  it('upsert dédup par id puis supprime', async () => {
    const db = makeTestDb()
    const a = { id: 'ban-1', label: '12 Rue', ville: 'Chartres', lat: 48, lng: 1 }
    await upsertAdresse(db, a)
    await upsertAdresse(db, a)
    expect((await getState(db)).adresses).toHaveLength(1)
    await deleteAdresse(db, 'ban-1')
    expect((await getState(db)).adresses).toEqual([])
  })
})
