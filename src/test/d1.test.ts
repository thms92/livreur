import { describe, expect, it } from 'vitest'
import { makeTestDb } from './d1'

describe('double D1', () => {
  it('run() rapporte le nombre de lignes modifiées', async () => {
    const db = makeTestDb()
    await db.prepare("INSERT INTO livreurs (id, nom, prenom, telephone, color_index, created_at) VALUES ('l1','B','K','',0,1)").bind().run()

    const touche = await db.prepare('UPDATE livreurs SET nom = ? WHERE id = ?').bind('X', 'l1').run()
    expect(touche.meta.changes).toBe(1)

    const rate = await db.prepare('UPDATE livreurs SET nom = ? WHERE id = ?').bind('X', 'inconnu').run()
    expect(rate.meta.changes).toBe(0)
  })
})
