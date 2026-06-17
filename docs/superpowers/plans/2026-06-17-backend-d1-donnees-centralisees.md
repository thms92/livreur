# Backend Cloudflare D1 + Historique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le stockage localStorage par une base Cloudflare D1 (via Pages Functions, API `/api/*`, sans authentification), rewirer le front en asynchrone (optimiste + rollback), et ajouter une section **Historique** des tournées passées.

**Architecture:** Pages Functions sous `functions/api/` lisent/écrivent une base D1 (binding `DB`). Une couche d'accès pure et testable (`functions/api/_db.ts`) est exercée en test via un shim `better-sqlite3` qui imite l'interface D1. Le front parle à l'API via `src/services/api.ts` ; `LivreurContext` charge l'état au démarrage et applique des mises à jour optimistes avec rollback. Le découpage passé/à‑venir est une fonction pure.

**Tech Stack:** TypeScript, React 19, Cloudflare Pages Functions + D1, Wrangler, Vitest, better-sqlite3 (devDep de test).

---

## File Structure

**Créés (backend) :**
- `wrangler.toml` — config Pages + binding D1.
- `migrations/0001_init.sql` — schéma.
- `functions/api/_db.ts` — couche d'accès données (types, mappers, requêtes).
- `functions/api/state.ts` — `GET /api/state`.
- `functions/api/livreurs/index.ts` — `POST /api/livreurs`.
- `functions/api/livreurs/[id].ts` — `PUT` / `DELETE /api/livreurs/:id`.
- `functions/api/tournees/index.ts` — `POST /api/tournees`.
- `functions/api/tournees/[id].ts` — `PUT` / `DELETE /api/tournees/:id`.
- `functions/api/adresses/index.ts` — `POST /api/adresses`.
- `functions/api/adresses/[id].ts` — `DELETE /api/adresses/:id`.
- `functions/tsconfig.json` — types workers pour les Functions.
- `src/test/d1.ts` — shim de test D1 sur better-sqlite3.
- `functions/api/_db.test.ts` — tests de la couche d'accès.

**Créés (front) :**
- `src/services/api.ts` (+ `.test.ts`) — client API.
- `src/lib/tourneeTime.ts` (+ `.test.ts`) — `isPast` / partition passé‑à venir.
- `src/components/Historique/HistoriqueSection.tsx` — vue historique.

**Modifiés :**
- `src/types.ts` — `Section` ajoute `'historique'`.
- `src/state/LivreurContext.tsx` (+ test) — rewire async API.
- `src/components/layout/Sidebar.tsx` — 4e entrée Historique.
- `src/components/Tournees/TourneesSection.tsx` — n'affiche que jour + à venir.
- `src/App.tsx` (+ test) — état de chargement + routage Historique.
- `package.json` — devDeps `@cloudflare/workers-types`, `better-sqlite3`, `@types/better-sqlite3`.
- `.gitignore` — ignore `.wrangler/` et `*.sqlite` locaux.

---

## Task 1: Infra — dépendances, wrangler.toml, schéma, base D1

**Files:**
- Create: `wrangler.toml`, `migrations/0001_init.sql`, `functions/tsconfig.json`
- Modify: `package.json` (devDeps), `.gitignore`

- [ ] **Step 1: Installer les devDeps**

```bash
npm i -D @cloudflare/workers-types better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Créer `migrations/0001_init.sql`**

```sql
CREATE TABLE IF NOT EXISTS livreurs (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  telephone   TEXT NOT NULL DEFAULT '',
  color_index INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournees (
  id          TEXT PRIMARY KEY,
  livreur_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  stops_json  TEXT NOT NULL DEFAULT '[]',
  route_json  TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tournees_date ON tournees(date);
CREATE INDEX IF NOT EXISTS idx_tournees_livreur ON tournees(livreur_id);

CREATE TABLE IF NOT EXISTS adresses (
  id     TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  ville  TEXT NOT NULL DEFAULT '',
  lat    REAL NOT NULL,
  lng    REAL NOT NULL
);
```

- [ ] **Step 3: Créer la base D1 et appliquer la migration en local**

```bash
npx wrangler d1 create livreur-db
```
Noter l'`database_id` renvoyé. Puis créer `wrangler.toml` :

```toml
name = "livreur"
compatibility_date = "2025-01-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "livreur-db"
database_id = "REMPLACER_PAR_LE_DATABASE_ID"
```

Appliquer la migration en local (crée une D1 locale dans `.wrangler/`) :
```bash
npx wrangler d1 execute livreur-db --local --file migrations/0001_init.sql
```
Expected: `Executed ... commands`.

- [ ] **Step 4: `functions/tsconfig.json`** (types workers pour les Functions)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 5: `.gitignore`** — ajouter :

```
.wrangler/
*.sqlite
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json migrations wrangler.toml functions/tsconfig.json .gitignore
git commit -m "chore: infra Cloudflare D1 (wrangler.toml, schéma, devDeps)"
```

---

## Task 2: Couche d'accès données + tests (better-sqlite3 shim)

**Files:**
- Create: `src/test/d1.ts`, `functions/api/_db.ts`, `functions/api/_db.test.ts`

- [ ] **Step 1: Créer le shim de test `src/test/d1.ts`**

```ts
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { D1Database } from '@cloudflare/workers-types'

/** Construit une fausse D1 (en mémoire) qui imite l'interface utilisée par la couche d'accès. */
export function makeTestDb(): D1Database {
  const sqlite = new Database(':memory:')
  const sql = readFileSync(
    fileURLToPath(new URL('../../migrations/0001_init.sql', import.meta.url)),
    'utf8',
  )
  sqlite.exec(sql)
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query)
      let args: unknown[] = []
      const api = {
        bind(...a: unknown[]) { args = a; return api },
        async all<T>() { return { results: stmt.all(...args) as T[] } },
        async run() { stmt.run(...args); return { success: true } },
        async first<T>() { return (stmt.get(...args) as T) ?? null },
      }
      return api
    },
  } as unknown as D1Database
}
```

- [ ] **Step 2: Écrire les tests `functions/api/_db.test.ts`**

```ts
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
```

- [ ] **Step 3: Lancer, voir échouer**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: FAIL (`_db.ts` absent).

- [ ] **Step 4: Implémenter `functions/api/_db.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types'

export interface Livreur { id: string; nom: string; prenom: string; telephone: string; colorIndex: number }
export interface Stop { id: string; label: string; ville: string; lat: number; lng: number }
export interface RouteResult {
  km: number; min: number; geometry: [number, number][]; optimized: boolean; approximate: boolean
}
export interface Tournee { id: string; livreurId: string; date: string; stops: Stop[]; route?: RouteResult }
export interface Adresse { id: string; label: string; ville: string; lat: number; lng: number }

interface LivreurRow { id: string; nom: string; prenom: string; telephone: string; color_index: number; created_at: number }
interface TourneeRow { id: string; livreur_id: string; date: string; stops_json: string; route_json: string | null; updated_at: number }
interface AdresseRow { id: string; label: string; ville: string; lat: number; lng: number }

function newId(): string {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const rowToLivreur = (r: LivreurRow): Livreur => ({
  id: r.id, nom: r.nom, prenom: r.prenom, telephone: r.telephone, colorIndex: r.color_index,
})
const rowToTournee = (r: TourneeRow): Tournee => ({
  id: r.id, livreurId: r.livreur_id, date: r.date,
  stops: JSON.parse(r.stops_json) as Stop[],
  route: r.route_json ? (JSON.parse(r.route_json) as RouteResult) : undefined,
})
const rowToAdresse = (r: AdresseRow): Adresse => ({
  id: r.id, label: r.label, ville: r.ville, lat: r.lat, lng: r.lng,
})

export async function getState(db: D1Database) {
  const [liv, tou, adr] = await Promise.all([
    db.prepare('SELECT * FROM livreurs ORDER BY created_at').all<LivreurRow>(),
    db.prepare('SELECT * FROM tournees ORDER BY date DESC').all<TourneeRow>(),
    db.prepare('SELECT * FROM adresses').all<AdresseRow>(),
  ])
  return {
    livreurs: liv.results.map(rowToLivreur),
    tournees: tou.results.map(rowToTournee),
    adresses: adr.results.map(rowToAdresse),
  }
}

export async function createLivreur(
  db: D1Database,
  input: { nom: string; prenom: string; telephone?: string },
): Promise<Livreur> {
  const used = await db.prepare('SELECT color_index FROM livreurs').all<{ color_index: number }>()
  const set = new Set(used.results.map((r) => r.color_index))
  let colorIndex = 0
  while (set.has(colorIndex)) colorIndex++
  const livreur: Livreur = {
    id: newId(),
    nom: input.nom.trim(),
    prenom: input.prenom.trim(),
    telephone: (input.telephone ?? '').trim(),
    colorIndex,
  }
  await db
    .prepare('INSERT INTO livreurs (id, nom, prenom, telephone, color_index, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(livreur.id, livreur.nom, livreur.prenom, livreur.telephone, colorIndex, Date.now())
    .run()
  return livreur
}

export async function updateLivreur(
  db: D1Database,
  id: string,
  patch: { nom?: string; prenom?: string; telephone?: string },
): Promise<void> {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.nom !== undefined) { sets.push('nom = ?'); vals.push(patch.nom.trim()) }
  if (patch.prenom !== undefined) { sets.push('prenom = ?'); vals.push(patch.prenom.trim()) }
  if (patch.telephone !== undefined) { sets.push('telephone = ?'); vals.push(patch.telephone.trim()) }
  if (!sets.length) return
  vals.push(id)
  await db.prepare(`UPDATE livreurs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
}

export async function deleteLivreur(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM tournees WHERE livreur_id = ?').bind(id).run()
  await db.prepare('DELETE FROM livreurs WHERE id = ?').bind(id).run()
}

export async function createTournee(
  db: D1Database,
  input: { livreurId: string; date: string },
): Promise<Tournee> {
  const tournee: Tournee = { id: newId(), livreurId: input.livreurId, date: input.date, stops: [] }
  await db
    .prepare('INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(tournee.id, tournee.livreurId, tournee.date, '[]', null, Date.now())
    .run()
  return tournee
}

export async function updateTournee(
  db: D1Database,
  id: string,
  patch: { livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null },
): Promise<void> {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.livreurId !== undefined) { sets.push('livreur_id = ?'); vals.push(patch.livreurId) }
  if (patch.date !== undefined) { sets.push('date = ?'); vals.push(patch.date) }
  if (patch.stops !== undefined) { sets.push('stops_json = ?'); vals.push(JSON.stringify(patch.stops)) }
  if (patch.route !== undefined) { sets.push('route_json = ?'); vals.push(patch.route ? JSON.stringify(patch.route) : null) }
  sets.push('updated_at = ?'); vals.push(Date.now())
  vals.push(id)
  await db.prepare(`UPDATE tournees SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
}

export async function deleteTournee(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM tournees WHERE id = ?').bind(id).run()
}

export async function upsertAdresse(db: D1Database, a: Adresse): Promise<void> {
  await db
    .prepare('INSERT INTO adresses (id, label, ville, lat, lng) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
    .bind(a.id, a.label, a.ville, a.lat, a.lng)
    .run()
}

export async function deleteAdresse(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM adresses WHERE id = ?').bind(id).run()
}
```

- [ ] **Step 5: Lancer, voir passer**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/api/_db.ts functions/api/_db.test.ts src/test/d1.ts
git commit -m "feat: couche d'accès D1 (livreurs/tournées/adresses) + tests sqlite"
```

---

## Task 3: Routes API (Pages Functions)

**Files:**
- Create: `functions/api/state.ts`, `functions/api/livreurs/index.ts`, `functions/api/livreurs/[id].ts`, `functions/api/tournees/index.ts`, `functions/api/tournees/[id].ts`, `functions/api/adresses/index.ts`, `functions/api/adresses/[id].ts`
- Create: `functions/api/_http.ts` (helpers réponse), `functions/api/routes.test.ts`

- [ ] **Step 1: `functions/api/_http.ts`** (helpers JSON)

```ts
export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export const badRequest = (msg: string) => json({ error: msg }, 400)
export const notFound = () => json({ error: 'introuvable' }, 404)
```

- [ ] **Step 2: Écrire les tests `functions/api/routes.test.ts`** (on appelle directement les handlers)

```ts
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
```

- [ ] **Step 3: Lancer, voir échouer**

Run: `npx vitest run functions/api/routes.test.ts`
Expected: FAIL (handlers absents).

- [ ] **Step 4: Implémenter les handlers**

`functions/api/state.ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { getState } from './_db'
import { json } from './_http'

export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getState(c.env.DB))
```

`functions/api/livreurs/index.ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { createLivreur } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const body = (await c.request.json().catch(() => null)) as { nom?: string; prenom?: string; telephone?: string } | null
  if (!body || !body.nom?.trim() || !body.prenom?.trim()) return badRequest('nom et prénom requis')
  const livreur = await createLivreur(c.env.DB, { nom: body.nom, prenom: body.prenom, telephone: body.telephone })
  return json(livreur, 201)
}
```

`functions/api/livreurs/[id].ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { deleteLivreur, updateLivreur } from '../_db'
import { json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as { nom?: string; prenom?: string; telephone?: string }
  await updateLivreur(c.env.DB, c.params.id, patch)
  return json({ ok: true })
}

export const onRequestDelete = async (c: Ctx): Promise<Response> => {
  await deleteLivreur(c.env.DB, c.params.id)
  return json({ ok: true })
}
```

`functions/api/tournees/index.ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { createTournee } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const body = (await c.request.json().catch(() => null)) as { livreurId?: string; date?: string } | null
  if (!body || !body.livreurId || !body.date) return badRequest('livreurId et date requis')
  const tournee = await createTournee(c.env.DB, { livreurId: body.livreurId, date: body.date })
  return json(tournee, 201)
}
```

`functions/api/tournees/[id].ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { deleteTournee, updateTournee, type RouteResult, type Stop } from '../_db'
import { json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as {
    livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
  }
  await updateTournee(c.env.DB, c.params.id, patch)
  return json({ ok: true })
}

export const onRequestDelete = async (c: Ctx): Promise<Response> => {
  await deleteTournee(c.env.DB, c.params.id)
  return json({ ok: true })
}
```

`functions/api/adresses/index.ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { upsertAdresse } from '../_db'
import { badRequest, json } from '../_http'

export const onRequestPost = async (c: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  const a = (await c.request.json().catch(() => null)) as
    | { id?: string; label?: string; ville?: string; lat?: number; lng?: number } | null
  if (!a || !a.id || !a.label || typeof a.lat !== 'number' || typeof a.lng !== 'number') return badRequest('adresse invalide')
  await upsertAdresse(c.env.DB, { id: a.id, label: a.label, ville: a.ville ?? '', lat: a.lat, lng: a.lng })
  return json({ ok: true }, 201)
}
```

`functions/api/adresses/[id].ts` :
```ts
import type { D1Database } from '@cloudflare/workers-types'
import { deleteAdresse } from '../_db'
import { json } from '../_http'

export const onRequestDelete = async (c: { env: { DB: D1Database }; params: { id: string } }): Promise<Response> => {
  await deleteAdresse(c.env.DB, c.params.id)
  return json({ ok: true })
}
```

- [ ] **Step 5: Lancer, voir passer**

Run: `npx vitest run functions/api/routes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add functions/api
git commit -m "feat: routes API Pages Functions (state, livreurs, tournées, adresses)"
```

---

## Task 4: Client API front (`src/services/api.ts`)

**Files:**
- Create: `src/services/api.ts`, `src/services/api.test.ts`

- [ ] **Step 1: Écrire le test `src/services/api.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(json) })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api client', () => {
  it('getState appelle GET /api/state', async () => {
    const fn = mockFetch({ livreurs: [], tournees: [], adresses: [] })
    const state = await api.getState()
    expect(fn).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'GET' }))
    expect(state).toEqual({ livreurs: [], tournees: [], adresses: [] })
  })

  it('createLivreur POST avec le corps JSON et renvoie le livreur', async () => {
    const fn = mockFetch({ id: 'l1', nom: 'B', prenom: 'K', telephone: '', colorIndex: 0 }, true, 201)
    const l = await api.createLivreur({ nom: 'B', prenom: 'K', telephone: '' })
    expect(fn).toHaveBeenCalledWith('/api/livreurs', expect.objectContaining({ method: 'POST' }))
    expect(l.id).toBe('l1')
  })

  it('lève une erreur si la réponse n’est pas ok', async () => {
    mockFetch({ error: 'boom' }, false, 400)
    await expect(api.createTournee({ livreurId: 'l1', date: '2026-06-18' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Lancer, voir échouer**

Run: `npx vitest run src/services/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `src/services/api.ts`**

```ts
import type { Livreur, Stop, RouteResult, Suggestion, Tournee } from '../types'

export interface AppState {
  livreurs: Livreur[]
  tournees: Tournee[]
  adresses: Suggestion[]
}

async function req<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error((detail as { error?: string } | null)?.error ?? `Erreur ${res.status}`)
  }
  return (await res.json()) as T
}

export const api = {
  getState: () => req<AppState>('/api/state', 'GET'),

  createLivreur: (input: { nom: string; prenom: string; telephone: string }) =>
    req<Livreur>('/api/livreurs', 'POST', input),
  updateLivreur: (id: string, patch: { nom?: string; prenom?: string; telephone?: string }) =>
    req<{ ok: true }>(`/api/livreurs/${id}`, 'PUT', patch),
  deleteLivreur: (id: string) => req<{ ok: true }>(`/api/livreurs/${id}`, 'DELETE'),

  createTournee: (input: { livreurId: string; date: string }) =>
    req<Tournee>('/api/tournees', 'POST', input),
  updateTournee: (
    id: string,
    patch: { livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null },
  ) => req<{ ok: true }>(`/api/tournees/${id}`, 'PUT', patch),
  deleteTournee: (id: string) => req<{ ok: true }>(`/api/tournees/${id}`, 'DELETE'),

  upsertAdresse: (a: Suggestion) => req<{ ok: true }>('/api/adresses', 'POST', a),
  deleteAdresse: (id: string) => req<{ ok: true }>(`/api/adresses/${id}`, 'DELETE'),
}
```

- [ ] **Step 4: Lancer, voir passer**

Run: `npx vitest run src/services/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "feat: client API front (getState + CRUD)"
```

---

## Task 5: Rewire LivreurContext en async (optimiste + rollback) + App

**Files:**
- Modify: `src/state/LivreurContext.tsx` (remplacement complet)
- Modify: `src/state/LivreurContext.test.tsx` (remplacement complet)
- Modify: `src/App.tsx`

> Le contexte conserve la **même surface d'actions** (mêmes noms) pour ne pas casser les composants, mais : l'état initial vient de l'API, les actions appellent l'API en arrière-plan, et `theme`/`section` restent locaux (`usePersistentState`). Le calcul OSRM (`optimizeTournee`/`refreshRoute`) appelle ensuite `api.updateTournee` pour persister stops+route.

- [ ] **Step 1: Remplacer `src/state/LivreurContext.test.tsx`** par :

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { LivreurProvider, useLivreur } from './LivreurContext'

vi.mock('../services/routing', () => ({
  optimizeTrip: vi.fn(async (stops: { id: string }[]) => ({
    order: stops.map((_, i) => i),
    route: { km: 10, min: 15, geometry: [], optimized: true, approximate: false },
  })),
  computeRoute: vi.fn(async () => ({ km: 5, min: 8, geometry: [], optimized: false, approximate: false })),
}))

vi.mock('../services/api', () => {
  const state = { livreurs: [] as never[], tournees: [] as never[], adresses: [] as never[] }
  return {
    api: {
      getState: vi.fn(async () => structuredClone(state)),
      createLivreur: vi.fn(async (i: { nom: string; prenom: string; telephone: string }) => ({
        id: 'L' + Math.random().toString(36).slice(2, 6), ...i, colorIndex: 0,
      })),
      updateLivreur: vi.fn(async () => ({ ok: true })),
      deleteLivreur: vi.fn(async () => ({ ok: true })),
      createTournee: vi.fn(async (i: { livreurId: string; date: string }) => ({
        id: 'T' + Math.random().toString(36).slice(2, 6), ...i, stops: [],
      })),
      updateTournee: vi.fn(async () => ({ ok: true })),
      deleteTournee: vi.fn(async () => ({ ok: true })),
      upsertAdresse: vi.fn(async () => ({ ok: true })),
      deleteAdresse: vi.fn(async () => ({ ok: true })),
    },
  }
})

import { api } from '../services/api'

const wrapper = ({ children }: { children: ReactNode }) => <LivreurProvider>{children}</LivreurProvider>

beforeEach(() => vi.clearAllMocks())
afterEach(() => localStorage.clear())

async function ready() {
  const hook = renderHook(() => useLivreur(), { wrapper })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('LivreurContext (API)', () => {
  it('charge l’état via getState au démarrage', async () => {
    const { result } = await ready()
    expect(api.getState).toHaveBeenCalled()
    expect(result.current.livreurs).toEqual([])
  })

  it('addLivreur : mise à jour optimiste + appel API', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'Benali', prenom: 'Karim', telephone: '' }) })
    expect(api.createLivreur).toHaveBeenCalled()
    expect(result.current.livreurs.map((l) => l.nom)).toEqual(['Benali'])
    expect(result.current.livreurs[0].couleur).toBe('var(--c-1)')
  })

  it('rollback si l’API échoue', async () => {
    vi.mocked(api.createLivreur).mockRejectedValueOnce(new Error('boom'))
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'X', prenom: 'Y', telephone: '' }) })
    expect(result.current.livreurs).toEqual([]) // annulé
    expect(result.current.error).toBeTruthy()
  })

  it('addStopToTournee mémorise l’adresse (upsert) et persiste', async () => {
    const { result } = await ready()
    let tid = ''
    await act(async () => {
      await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' })
    })
    await act(async () => {
      tid = await result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' })
    })
    await act(async () => {
      await result.current.addStopToTournee(tid, { id: 'ban-1', label: 'A', ville: 'V', lat: 48, lng: 1 })
    })
    expect(api.upsertAdresse).toHaveBeenCalled()
    expect(result.current.adresses.map((a) => a.id)).toEqual(['ban-1'])
  })
})
```

- [ ] **Step 2: Lancer, voir échouer**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL (le contexte n'expose pas encore `loading`/`error`, ni l'API).

- [ ] **Step 3: Remplacer `src/state/LivreurContext.tsx`** par :

```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import type { Livreur, Section, Stop, Suggestion, Theme, Tournee } from '../types'
import { driverColor, nextColorIndex } from '../data/palette'
import { BanProvider, type AddressProvider } from '../services/addressProvider'
import { computeRoute, optimizeTrip } from '../services/routing'
import { api } from '../services/api'
import { usePersistentState } from './usePersistentState'

const defaultProvider = new BanProvider()

export interface LivreurInput { nom: string; prenom: string; telephone: string }
export type LivreurWithColor = Livreur & { couleur: string }

export interface LivreurState {
  theme: Theme
  section: Section
  loading: boolean
  error: string | null
  livreurs: LivreurWithColor[]
  tournees: Tournee[]
  adresses: Suggestion[]
  provider: AddressProvider
  reduceMotion: boolean
  toggleTheme: () => void
  setSection: (s: Section) => void
  dismissError: () => void
  addLivreur: (input: LivreurInput) => Promise<void>
  updateLivreur: (id: string, patch: Partial<LivreurInput>) => Promise<void>
  removeLivreur: (id: string) => Promise<void>
  addTournee: (input: { livreurId: string; date: string }) => Promise<string>
  updateTournee: (id: string, patch: { livreurId?: string; date?: string }) => Promise<void>
  removeTournee: (id: string) => Promise<void>
  addStopToTournee: (tourneeId: string, s: Suggestion) => Promise<void>
  removeStopFromTournee: (tourneeId: string, stopId: string) => Promise<void>
  reorderStops: (tourneeId: string, from: number, to: number) => Promise<void>
  optimizeTournee: (tourneeId: string) => Promise<void>
  refreshRoute: (tourneeId: string) => Promise<void>
  removeAdresse: (id: string) => Promise<void>
}

const Ctx = createContext<LivreurState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components -- hook colocalisé avec son provider
export function useLivreur(): LivreurState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLivreur doit être utilisé dans <LivreurProvider>')
  return v
}

export function LivreurProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>('theme', 'light')
  const [section, setSection] = usePersistentState<Section>('section', 'tournees')
  const [livreursRaw, setLivreursRaw] = useState<Livreur[]>([])
  const [tournees, setTournees] = useState<Tournee[]>([])
  const [adresses, setAdresses] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  // chargement initial
  useEffect(() => {
    let alive = true
    api.getState()
      .then((s) => { if (alive) { setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses) } })
      .catch(() => { if (alive) setError('Chargement impossible. Vérifiez votre connexion et rechargez.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [setTheme])
  const dismissError = useCallback(() => setError(null), [])

  // Applique une mise à jour optimiste ; en cas d'échec API, restaure les snapshots et signale.
  const optimistic = useCallback(async (apply: () => void, call: () => Promise<unknown>, snapshots: () => () => void) => {
    const restore = snapshots()
    apply()
    try {
      await call()
    } catch (e) {
      restore()
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
    }
  }, [])

  const addLivreur = useCallback(async (input: LivreurInput) => {
    if (!input.nom.trim() || !input.prenom.trim()) return
    const prev = livreursRaw
    try {
      const created = await api.createLivreur({
        nom: input.nom.trim(), prenom: input.prenom.trim(), telephone: input.telephone.trim(),
      })
      setLivreursRaw((p) => [...p, created])
    } catch (e) {
      setLivreursRaw(prev)
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
    }
  }, [livreursRaw])

  const updateLivreur = useCallback(async (id: string, patch: Partial<LivreurInput>) => {
    const prev = livreursRaw
    await optimistic(
      () => setLivreursRaw((p) => p.map((l) => (l.id === id ? {
        ...l,
        ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}),
        ...(patch.prenom !== undefined ? { prenom: patch.prenom.trim() } : {}),
        ...(patch.telephone !== undefined ? { telephone: patch.telephone.trim() } : {}),
      } : l))),
      () => api.updateLivreur(id, patch),
      () => () => setLivreursRaw(prev),
    )
  }, [livreursRaw, optimistic])

  const removeLivreur = useCallback(async (id: string) => {
    const prevL = livreursRaw, prevT = tournees
    await optimistic(
      () => { setLivreursRaw((p) => p.filter((l) => l.id !== id)); setTournees((p) => p.filter((t) => t.livreurId !== id)) },
      () => api.deleteLivreur(id),
      () => () => { setLivreursRaw(prevL); setTournees(prevT) },
    )
  }, [livreursRaw, tournees, optimistic])

  const addTournee = useCallback(async (input: { livreurId: string; date: string }) => {
    const created = await api.createTournee(input).catch((e) => {
      setError(e instanceof Error ? e.message : 'Échec'); return null
    })
    if (!created) return ''
    setTournees((p) => [...p, created])
    return created.id
  }, [])

  const updateTournee = useCallback(async (id: string, patch: { livreurId?: string; date?: string }) => {
    const prev = tournees
    await optimistic(
      () => setTournees((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t))),
      () => api.updateTournee(id, patch),
      () => () => setTournees(prev),
    )
  }, [tournees, optimistic])

  const removeTournee = useCallback(async (id: string) => {
    const prev = tournees
    await optimistic(
      () => setTournees((p) => p.filter((t) => t.id !== id)),
      () => api.deleteTournee(id),
      () => () => setTournees(prev),
    )
  }, [tournees, optimistic])

  // Persiste stops + route d'une tournée donnée (après calcul OSRM ou édition d'arrêts).
  const persistStops = useCallback(async (id: string, stops: Stop[], route: Tournee['route'], prev: Tournee[]) => {
    try {
      await api.updateTournee(id, { stops, route: route ?? null })
    } catch (e) {
      setTournees(prev)
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
    }
  }, [])

  const addStopToTournee = useCallback(async (tourneeId: string, s: Suggestion) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stop: Stop = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }
    const stops = [...t.stops, stop]
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route: undefined } : x)))
    // carnet d'adresses (dédup par id)
    if (!adresses.some((a) => a.id === s.id)) {
      setAdresses((p) => [...p, { id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }])
      api.upsertAdresse({ id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }).catch(() => {})
    }
    await persistStops(tourneeId, stops, undefined, prev)
  }, [tournees, adresses, persistStops])

  const removeStopFromTournee = useCallback(async (tourneeId: string, stopId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stops = t.stops.filter((s) => s.id !== stopId)
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route: undefined } : x)))
    await persistStops(tourneeId, stops, undefined, prev)
  }, [tournees, persistStops])

  const reorderStops = useCallback(async (tourneeId: string, from: number, to: number) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const stops = t.stops.slice()
    const [m] = stops.splice(from, 1)
    stops.splice(to, 0, m)
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route: undefined } : x)))
    await persistStops(tourneeId, stops, undefined, prev)
  }, [tournees, persistStops])

  const optimizeTournee = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const { order, route } = await optimizeTrip(t.stops)
    const stops = order.map((i) => t.stops[i])
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, stops, route } : x)))
    await persistStops(tourneeId, stops, route, prev)
  }, [tournees, persistStops])

  const refreshRoute = useCallback(async (tourneeId: string) => {
    const prev = tournees
    const t = prev.find((x) => x.id === tourneeId)
    if (!t) return
    const route = await computeRoute(t.stops)
    setTournees((p) => p.map((x) => (x.id === tourneeId ? { ...x, route } : x)))
    await persistStops(tourneeId, t.stops, route, prev)
  }, [tournees, persistStops])

  const removeAdresse = useCallback(async (id: string) => {
    const prev = adresses
    setAdresses((p) => p.filter((a) => a.id !== id))
    api.deleteAdresse(id).catch((e) => {
      setAdresses(prev); setError(e instanceof Error ? e.message : 'Échec')
    })
  }, [adresses])

  // évite l'avertissement « nextColorIndex inutilisé » : la couleur vient du serveur, mais on
  // garde l'import pour la dérivation locale si besoin futur.
  void nextColorIndex

  const value: LivreurState = {
    theme, section, loading, error, livreurs, tournees, adresses, provider: defaultProvider,
    reduceMotion: !!reduceMotion, toggleTheme, setSection, dismissError,
    addLivreur, updateLivreur, removeLivreur,
    addTournee, updateTournee, removeTournee,
    addStopToTournee, removeStopFromTournee, reorderStops, optimizeTournee, refreshRoute, removeAdresse,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

> Note : `nextColorIndex` n'est plus nécessaire (couleur calculée côté serveur). Pour éviter un import mort, **retirer** `nextColorIndex` de l'import `../data/palette` (ne garder que `driverColor`) et supprimer la ligne `void nextColorIndex`. (Inclus ici en commentaire pour ne pas l'oublier.)

- [ ] **Step 4: Nettoyer l'import palette** — dans `LivreurContext.tsx`, remplacer
`import { driverColor, nextColorIndex } from '../data/palette'` par
`import { driverColor } from '../data/palette'` et supprimer la ligne `void nextColorIndex`.

- [ ] **Step 5: Mettre à jour `src/App.tsx`** pour l'état de chargement + l'erreur :

```tsx
import { LivreurProvider, useLivreur } from './state/LivreurContext'
import { Sidebar } from './components/layout/Sidebar'
import { LivreursSection } from './components/Livreurs/LivreursSection'
import { TourneesSection } from './components/Tournees/TourneesSection'
import { ChauffeursSection } from './components/Chauffeurs/ChauffeursSection'
import { HistoriqueSection } from './components/Historique/HistoriqueSection'

function Shell() {
  const { section, loading, error, dismissError } = useLivreur()
  if (loading) return <div className="app-loading">Chargement…</div>
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="btn-ghost" onClick={dismissError}>OK</button>
          </div>
        )}
        {section === 'livreurs' && <LivreursSection />}
        {section === 'tournees' && <TourneesSection />}
        {section === 'chauffeurs' && <ChauffeursSection />}
        {section === 'historique' && <HistoriqueSection />}
      </main>
    </div>
  )
}

export function App() {
  return (
    <LivreurProvider>
      <Shell />
    </LivreurProvider>
  )
}
```

> `HistoriqueSection` est créé en Task 6 — cette modif d'`App` peut être faite en même temps que Task 6 pour éviter un import cassé. **Faire Step 5 dans la Task 6** (après création du composant). Ici, se limiter à l'état de chargement + bannière d'erreur sans la ligne `historique`/import si on exécute Task 5 isolément.

- [ ] **Step 6: Lancer les tests du contexte**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/LivreurContext.tsx src/state/LivreurContext.test.tsx src/App.tsx
git commit -m "feat: contexte rewiré sur l'API (chargement + optimiste + rollback)"
```

---

## Task 6: Section Historique + filtrage Tournées + sidebar

**Files:**
- Create: `src/lib/tourneeTime.ts` (+ `.test.ts`), `src/components/Historique/HistoriqueSection.tsx`
- Modify: `src/types.ts`, `src/components/layout/Sidebar.tsx`, `src/components/Tournees/TourneesSection.tsx`, `src/App.tsx` (import + route Historique)

- [ ] **Step 1: `src/types.ts`** — étendre `Section` :

```ts
export type Section = 'livreurs' | 'tournees' | 'chauffeurs' | 'historique'
```

- [ ] **Step 2: Écrire `src/lib/tourneeTime.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { isPast, partitionTournees } from './tourneeTime'
import type { Tournee } from '../types'

const t = (id: string, date: string): Tournee => ({ id, livreurId: 'l', date, stops: [] })

describe('tourneeTime', () => {
  it('isPast : strictement avant aujourd’hui', () => {
    expect(isPast('2000-01-01', '2026-06-17')).toBe(true)
    expect(isPast('2026-06-17', '2026-06-17')).toBe(false) // aujourd'hui = à venir
    expect(isPast('2999-01-01', '2026-06-17')).toBe(false)
  })

  it('partitionne en à‑venir / passées', () => {
    const { upcoming, past } = partitionTournees(
      [t('a', '2026-06-10'), t('b', '2026-06-17'), t('c', '2026-06-25')],
      '2026-06-17',
    )
    expect(upcoming.map((x) => x.id)).toEqual(['b', 'c'])
    expect(past.map((x) => x.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 3: Implémenter `src/lib/tourneeTime.ts`**

```ts
import type { Tournee } from '../types'

export const todayIso = (): string => new Date().toISOString().slice(0, 10)

/** Une date "YYYY-MM-DD" est passée si strictement antérieure à `today`. */
export function isPast(date: string, today: string = todayIso()): boolean {
  return date < today
}

export function partitionTournees(
  tournees: Tournee[],
  today: string = todayIso(),
): { upcoming: Tournee[]; past: Tournee[] } {
  const upcoming: Tournee[] = []
  const past: Tournee[] = []
  for (const t of tournees) (isPast(t.date, today) ? past : upcoming).push(t)
  return { upcoming, past }
}
```

- [ ] **Step 4: Lancer, voir passer**

Run: `npx vitest run src/lib/tourneeTime.test.ts`
Expected: PASS.

- [ ] **Step 5: `src/components/Historique/HistoriqueSection.tsx`** (lecture seule + Imprimer)

```tsx
import { useLivreur } from '../../state/LivreurContext'
import { partitionTournees } from '../../lib/tourneeTime'
import { printTourneeSheet } from '../../services/printSheet'

export function HistoriqueSection() {
  const { tournees, livreurs } = useLivreur()
  const past = partitionTournees(tournees).past.sort((a, b) => b.date.localeCompare(a.date))

  if (!past.length) return (
    <section className="section">
      <h1>Historique</h1>
      <p className="empty">Aucune tournée passée pour le moment.</p>
    </section>
  )

  return (
    <section className="section">
      <h1>Historique</h1>
      <ul className="tournee-list">
        {past.map((t) => {
          const l = livreurs.find((x) => x.id === t.livreurId)
          return (
            <li key={t.id} className="tournee-row" style={{ borderLeftColor: l?.couleur }}>
              <span className="tournee-date">{t.date}</span>
              <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
              <span className="tournee-stats">
                {t.stops.length} arrêt(s)
                {t.route ? ` · ${t.route.km.toFixed(0)} km · ${Math.round(t.route.min)} min` : ''}
              </span>
              <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => printTourneeSheet(t, l)}>
                Imprimer
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 6: `src/components/layout/Sidebar.tsx`** — ajouter l'entrée dans `ITEMS` :

```ts
const ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'livreurs', label: 'Livreurs', icon: '👤' },
  { id: 'tournees', label: 'Tournées', icon: '🗺️' },
  { id: 'chauffeurs', label: 'Chauffeurs', icon: '📋' },
  { id: 'historique', label: 'Historique', icon: '🗂️' },
]
```

- [ ] **Step 7: `src/components/Tournees/TourneesSection.tsx`** — filtrer sur jour + à venir.

Ajouter l'import :
```ts
import { partitionTournees } from '../../lib/tourneeTime'
```
Le composant `TourneesSection` utilise `useLivreur()` et passe `tournees` à `TourneeList` via le contexte. Comme `TourneeList` lit `tournees` du contexte, on filtre **dans `TourneeList`**. Modifier `src/components/Tournees/TourneeList.tsx` :

remplacer
```tsx
  const { tournees, livreurs, removeTournee } = useLivreur()
  if (!tournees.length) return <p className="empty">Aucune tournée. Créez-en une.</p>
  const sorted = [...tournees].sort((a, b) => b.date.localeCompare(a.date))
```
par
```tsx
  const { tournees, livreurs, removeTournee } = useLivreur()
  const upcoming = partitionTournees(tournees).upcoming
  if (!upcoming.length) return <p className="empty">Aucune tournée à venir. Créez-en une.</p>
  const sorted = [...upcoming].sort((a, b) => b.date.localeCompare(a.date))
```
et ajouter en haut de `TourneeList.tsx` :
```ts
import { partitionTournees } from '../../lib/tourneeTime'
```

- [ ] **Step 8: `src/App.tsx`** — ajouter l'import et la route Historique (si pas déjà fait en Task 5) :
```tsx
import { HistoriqueSection } from './components/Historique/HistoriqueSection'
```
et dans le `Shell`, la ligne :
```tsx
        {section === 'historique' && <HistoriqueSection />}
```

- [ ] **Step 9: Styles `src/styles/app.css`** — état de chargement + bannière d'erreur :

```css
.app-loading { display: grid; place-items: center; min-height: 100vh; color: var(--text-2); }
.error-banner {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
  padding: 10px 14px; border-radius: 8px; background: rgba(229, 72, 77, 0.12);
  color: #b42318; border: 1px solid rgba(229, 72, 77, 0.3);
}
.error-banner .btn-ghost { margin-left: auto; }
```

- [ ] **Step 10: Vérifier la suite + lint + build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 11: Commit**

```bash
git add src/lib src/components/Historique src/components/layout/Sidebar.tsx src/components/Tournees/TourneeList.tsx src/App.tsx src/types.ts src/styles/app.css
git commit -m "feat: section Historique (tournées passées) + Tournées limitées au jour/à venir"
```

---

## Task 7: Intégration locale, déploiement, vérification

**Files:** aucun (exécution)

- [ ] **Step 1: Lint des Functions** — vérifier que les Functions typent correctement :

Run: `npx tsc -p functions/tsconfig.json`
Expected: 0 erreur.

- [ ] **Step 2: Test local bout‑en‑bout avec D1 locale**

```bash
npm run build
npx wrangler pages dev dist --d1 DB=livreur-db
```
Ouvrir l'URL locale affichée, créer un livreur + une tournée avec 2 arrêts, recharger la page → les données **persistent** (viennent de la D1 locale). Vérifier la section **Historique** avec une tournée datée d'hier.

- [ ] **Step 3: Appliquer la migration sur la D1 de production**

```bash
npx wrangler d1 execute livreur-db --remote --file migrations/0001_init.sql
```
Expected: succès.

- [ ] **Step 4: Lier la D1 au projet Pages (prod) et déployer**

- S'assurer que le binding D1 `DB` est attaché au projet Pages `livreur` (via `wrangler.toml`
  pris en compte au déploiement, ou Dashboard → projet → Settings → Functions → D1 bindings →
  ajouter `DB = livreur-db` pour Production).
```bash
npx wrangler pages deploy dist --project-name=livreur --branch=main --commit-dirty=true
```
Expected: déploiement réussi.

- [ ] **Step 5: Vérification en production**

Ouvrir `https://livreur-7bf.pages.dev/` : l'app charge l'état depuis l'API, créer un livreur, recharger → persistant ; ouvrir sur un **autre appareil/navigateur** → mêmes données (centralisées). Vérifier qu'une requête `GET /api/state` renvoie bien du JSON.

- [ ] **Step 6: Mettre à jour le README** (sections + backend D1, commandes de déploiement/migration) puis commit.

```bash
git add README.md
git commit -m "docs: README — backend D1, API, déploiement"
```

---

## Self-Review (effectuée à la rédaction)

- **Couverture spec :** D1 + schéma (Task 1) ; couche d'accès CRUD + cascade + JSON stops/route
  (Task 2) ; routes API sans auth (Task 3) ; client API (Task 4) ; contexte async optimiste +
  rollback + chargement + carnet upsert (Task 5) ; Historique auto par date + Tournées filtrées +
  sidebar (Task 6) ; migration prod + déploiement + multi‑appareils (Task 7). Aucune auth (conforme
  au choix). ✔
- **Pas de placeholder** : tout le code est fourni ; les `database_id`/URL locales sont des valeurs
  d'environnement légitimes (récupérées via commande).
- **Cohérence des types/signatures :** `getState`/`createLivreur`/`updateLivreur`/`deleteLivreur`/
  `createTournee`/`updateTournee`/`deleteTournee`/`upsertAdresse`/`deleteAdresse` identiques entre
  `_db.ts`, routes, `api.ts` et contexte ; `LivreurWithColor`, `partitionTournees`, `isPast`
  cohérents entre `tourneeTime.ts` et les composants ; `Section` étendu partout (Sidebar/App).
- **Risque connu :** tester les Functions D1 via shim better-sqlite3 (réel SQL) plutôt que Miniflare
  — assez fidèle pour la logique ; l'intégration réelle est validée en Task 7 (wrangler pages dev).
