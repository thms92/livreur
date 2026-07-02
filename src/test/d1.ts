import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { D1Database } from '@cloudflare/workers-types'

/** Construit une fausse D1 (en mémoire) qui imite l'interface utilisée par la couche d'accès. */
export function makeTestDb(): D1Database {
  const sqlite = new Database(':memory:')
  const dir = resolve(process.cwd(), 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(dir, file), 'utf8'))
  }
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query)
      let args: unknown[] = []
      const apiStmt = {
        bind(...a: unknown[]) { args = a; return apiStmt },
        async all<T>() { return { results: stmt.all(...args) as T[] } },
        async run() { stmt.run(...args); return { success: true } },
        async first<T>() { return (stmt.get(...args) as T) ?? null },
      }
      return apiStmt
    },
  } as unknown as D1Database
}
