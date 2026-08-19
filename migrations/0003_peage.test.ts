import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = resolve(process.cwd(), 'migrations')
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

/** Applique les migrations jusqu'à `stop` inclus, sur une base neuve. */
function migrateUpTo(stop: string) {
  const db = new Database(':memory:')
  for (const f of files) {
    db.exec(readFileSync(resolve(DIR, f), 'utf8'))
    if (f === stop) break
  }
  return db
}

describe('migration 0003 — option péage', () => {
  it('marque les tournées existantes « avec péage » (elles viennent d’OSRM)', () => {
    const db = migrateUpTo('0002_horaires.sql')
    db.prepare(
      "INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES ('vieille', 'l1', '2026-07-03', '[]', '{\"km\":81}', 1)",
    ).run()

    db.exec(readFileSync(resolve(DIR, '0003_peage.sql'), 'utf8'))

    const row = db.prepare('SELECT sans_peage, route_json FROM tournees WHERE id = ?').get('vieille') as {
      sans_peage: number
      route_json: string
    }
    expect(row.sans_peage).toBe(0)
    // La route déjà calculée doit être intacte : c'est la garantie de non-perte.
    expect(row.route_json).toBe('{"km":81}')
  })

  it('les tournées créées après la migration sont sans péage par défaut', () => {
    const db = migrateUpTo('0003_peage.sql')
    db.prepare(
      "INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES ('neuve', 'l1', '2026-08-19', '[]', NULL, 1)",
    ).run()
    const row = db.prepare('SELECT sans_peage FROM tournees WHERE id = ?').get('neuve') as { sans_peage: number }
    expect(row.sans_peage).toBe(1)
  })

  it('n’ajoute ni ne supprime aucune table', () => {
    const before = migrateUpTo('0002_horaires.sql')
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    const after = migrateUpTo('0003_peage.sql')
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    expect(after).toEqual(before)
  })

  it('rejouer l’UPDATE ne rebascule pas les tournées créées après la migration', () => {
    const db = migrateUpTo('0003_peage.sql')
    db.prepare(
      "INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES ('neuve', 'l1', '2026-08-20', '[]', NULL, ?)",
    ).run(Date.now())

    // Scénario redouté : la migration est relancée par erreur sur la prod.
    const sql = readFileSync(resolve(DIR, '0003_peage.sql'), 'utf8')
    for (const stmt of sql.split(';')) {
      if (/^\s*UPDATE/im.test(stmt)) db.exec(stmt)
    }

    const row = db.prepare('SELECT sans_peage FROM tournees WHERE id = ?').get('neuve') as { sans_peage: number }
    expect(row.sans_peage).toBe(1)
  })
})
