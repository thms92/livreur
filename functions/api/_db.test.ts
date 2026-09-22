import { describe, expect, it } from 'vitest'
import { makeTestDb } from '../../src/test/d1'
import {
  getState, createLivreur, updateLivreur, deleteLivreur,
  createTournee, updateTournee, deleteTournee,
  upsertAdresse, deleteAdresse,
  restoreTournee, restoreLivreur, getCorbeille,
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

  it('met à jour puis supprime (le livreur ne cascade plus sur ses tournées)', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    await updateLivreur(db, l.id, { telephone: '0700' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-06-18' })
    expect((await getState(db)).tournees).toHaveLength(1)
    await deleteLivreur(db, l.id)
    const state = await getState(db)
    // Le livreur reste renvoyé (marqué) : son nom doit rester résoluble sur ses tournées passées.
    expect(state.livreurs.map((x) => x.id)).toEqual([l.id])
    expect(state.livreurs[0].deletedAt).toBeGreaterThan(0)
    // Ses tournées sont de l'historique de livraison : elles survivent à son départ.
    expect(state.tournees.map((x) => x.id)).toEqual([t.id])
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

  it('persiste et relit les horaires (bornes dépôt, heure d’arrêt, ordre manuel)', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-06-18' })
    // par défaut : pas de bornes, ordre auto
    let state = await getState(db)
    expect(state.tournees[0]).toMatchObject({ departHeure: undefined, retourHeure: undefined, ordreManuel: false })
    await updateTournee(db, t.id, {
      stops: [{ id: 's1', label: 'A', ville: 'V', lat: 48, lng: 1, heure: '09:30' }],
      departHeure: '08:00',
      retourHeure: '17:00',
      ordreManuel: true,
    })
    state = await getState(db)
    expect(state.tournees[0]).toMatchObject({ departHeure: '08:00', retourHeure: '17:00', ordreManuel: true })
    expect(state.tournees[0].stops[0].heure).toBe('09:30')
    // chaîne vide → remise à null (borne effacée)
    await updateTournee(db, t.id, { departHeure: '' })
    expect((await getState(db)).tournees[0].departHeure).toBeUndefined()
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

describe('_db — option péage', () => {
  it('une tournée créée est sans péage par défaut', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-08-19' })
    expect(t.sansPeage).toBe(true)
    expect((await getState(db)).tournees[0].sansPeage).toBe(true)
  })

  it('bascule en mode péage autorisé et le relit', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-08-19' })
    await updateTournee(db, t.id, { sansPeage: false })
    expect((await getState(db)).tournees[0].sansPeage).toBe(false)
  })

  it('une mise à jour qui ne parle pas de péage ne change pas le mode', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-08-19' })
    await updateTournee(db, t.id, { sansPeage: false })
    await updateTournee(db, t.id, { date: '2026-08-20' })
    expect((await getState(db)).tournees[0].sansPeage).toBe(false)
  })
})

describe('_db — corbeille', () => {
  it('supprimer une tournée la masque sans l’effacer', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })

    await deleteTournee(db, t.id, 'Thomas')

    expect((await getState(db)).tournees).toHaveLength(0)
    const corbeille = await getCorbeille(db)
    expect(corbeille.tournees.map((x) => x.id)).toEqual([t.id])
  })

  it('restaurer une tournée la fait revenir dans l’état', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await deleteTournee(db, t.id, 'Thomas')

    await restoreTournee(db, t.id)

    expect((await getState(db)).tournees.map((x) => x.id)).toEqual([t.id])
    expect((await getCorbeille(db)).tournees).toHaveLength(0)
  })

  it('supprimer un livreur NE supprime PLUS ses tournées', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })

    await deleteLivreur(db, l.id, 'Thomas')

    const state = await getState(db)
    expect(state.tournees.map((x) => x.id)).toEqual([t.id])
  })

  it('un livreur supprimé reste renvoyé, marqué, pour que son nom reste affichable', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    await deleteLivreur(db, l.id, 'Thomas')

    const vu = (await getState(db)).livreurs.find((x) => x.id === l.id)
    expect(vu).toBeDefined()
    expect(vu!.deletedAt).toBeGreaterThan(0)
  })

  it('la corbeille retient qui a supprimé', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await deleteTournee(db, t.id, 'Alexis')
    expect((await getCorbeille(db)).tournees[0].deletedBy).toBe('Alexis')
  })
})

describe('_db — verrou optimiste', () => {
  it('une écriture à jour passe et incrémente la version', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    expect(t.version).toBe(1)

    const r = await updateTournee(db, t.id, { date: '2026-09-23', version: 1 })

    expect(r).toEqual({ ok: true, version: 2 })
    expect((await getState(db)).tournees[0].date).toBe('2026-09-23')
  })

  it('une écriture en version périmée est refusée ET ne modifie rien', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await updateTournee(db, t.id, { date: '2026-09-23', version: 1 })

    const r = await updateTournee(db, t.id, { date: '2999-01-01', version: 1 })

    expect(r).toEqual({ ok: false, raison: 'conflit' })
    expect((await getState(db)).tournees[0].date).toBe('2026-09-23')
  })

  it('une écriture sur une tournée supprimée signale qu’elle a disparu', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    await deleteTournee(db, t.id, 'Thomas')

    const r = await updateTournee(db, t.id, { date: '2999-01-01', version: 1 })

    expect(r).toEqual({ ok: false, raison: 'absente' })
  })

  it('sans version fournie, l’écriture passe sans contrôle (compatibilité)', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    const r = await updateTournee(db, t.id, { date: '2026-09-24' })
    expect(r.ok).toBe(true)
  })
})
