import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = resolve(process.cwd(), 'migrations')

function migrateUpTo(stop: string) {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const db = new Database(':memory:')
  let found = false
  for (const f of files) {
    db.exec(readFileSync(resolve(DIR, f), 'utf8'))
    if (f === stop) {
      found = true
      break
    }
  }
  if (!found) {
    throw new Error(`Migration file not found: ${stop}`)
  }
  return db
}

describe('migration 0004 — travail à deux', () => {
  it("laisse les tournées existantes vivantes, en version 1, sans auteur connu", () => {
    const db = migrateUpTo('0003_peage.sql')
    db.prepare(
      "INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES ('t1', 'l1', '2026-07-03', '[]', '{\"km\":81}', 1)",
    ).run()

    db.exec(readFileSync(resolve(DIR, '0004_travail_a_deux.sql'), 'utf8'))

    const r = db.prepare('SELECT * FROM tournees WHERE id = ?').get('t1') as Record<string, unknown>
    expect(r.deleted_at).toBeNull()
    expect(r.version).toBe(1)
    expect(r.created_by).toBeNull()
    expect(r.route_json).toBe('{"km":81}')
  })

  it("laisse les livreurs existants vivants", () => {
    const db = migrateUpTo('0003_peage.sql')
    db.prepare(
      "INSERT INTO livreurs (id, nom, prenom, telephone, color_index, created_at) VALUES ('l1', 'B', 'K', '', 0, 1)",
    ).run()
    db.exec(readFileSync(resolve(DIR, '0004_travail_a_deux.sql'), 'utf8'))
    const r = db.prepare('SELECT deleted_at FROM livreurs WHERE id = ?').get('l1') as { deleted_at: unknown }
    expect(r.deleted_at).toBeNull()
  })

  it("n'ajoute ni ne supprime aucune table", () => {
    const q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    const avant = migrateUpTo('0003_peage.sql').prepare(q).all()
    const apres = migrateUpTo('0004_travail_a_deux.sql').prepare(q).all()
    expect(apres).toEqual(avant)
  })

  it('ne contient aucun UPDATE de rattrapage', () => {
    const sql = readFileSync(resolve(DIR, '0004_travail_a_deux.sql'), 'utf8')
    expect(sql).not.toMatch(/^\s*UPDATE/im)
  })
})
