# Travail à deux sans perte de données — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre LIVREUR utilisable par deux personnes simultanément sans qu'aucune donnée ne puisse être écrasée en silence ni supprimée irréversiblement.

**Architecture:** Quatre mécanismes indépendants posés sur une migration additive unique — corbeille par marquage (`deleted_at`), verrou optimiste par entier de version avec réponses `409`/`410`, relecture périodique déclenchée par un endpoint de contrôle léger, et attribution déclarative transportée par un en-tête HTTP.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library, Cloudflare Pages Functions, D1 (SQLite), better-sqlite3 pour le double de test.

**Spec:** `docs/superpowers/specs/2026-09-22-travail-a-deux-zero-perte-design.md`

## Global Constraints

- **Aucune ligne n'est jamais retirée de la base par l'interface.** Tout `DELETE FROM` sur `tournees` ou `livreurs` est un bug.
- **Migration strictement additive** : `ALTER TABLE ... ADD COLUMN` uniquement. Aucune table recréée, aucune colonne supprimée, aucun `UPDATE` de rattrapage.
- **Supprimer un livreur ne supprime plus ses tournées.**
- **TDD obligatoire** : chaque test est écrit puis vu échouer avant l'implémentation.
- Commandes : tests `npx vitest run <chemin>`, suite complète `npm test`, types `npx tsc -b`, lint `npm run lint`.
- Le projet est en français : messages d'interface, commentaires et noms de tests en français.
- Migration en production : `npx wrangler d1 execute livreur-db --remote --file <fichier>`, **jamais** `d1 migrations apply` (pas de table de suivi en prod).

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `migrations/0004_travail_a_deux.sql` | les 7 colonnes ajoutées |
| `migrations/0004_travail_a_deux.test.ts` | prouve que la migration ne détruit rien |
| `src/test/d1.ts` | double D1 — doit exposer `meta.changes` |
| `functions/api/_db.ts` | marquage, filtrage, écriture versionnée, attribution, résumé de synchro |
| `functions/api/_http.ts` | helpers `conflict()` et `gone()` |
| `functions/api/tournees/[id].ts` | `409`/`410`, lecture de `X-Operateur` |
| `functions/api/livreurs/[id].ts` | suppression par marquage |
| `functions/api/corbeille/index.ts` | `GET` liste des supprimés |
| `functions/api/corbeille/[id].ts` | `POST` restauration |
| `functions/api/sync.ts` | endpoint de contrôle léger |
| `src/services/api.ts` | en-tête opérateur, erreurs typées, corbeille, sync |
| `src/state/operateur.ts` | identité déclarative du poste |
| `src/state/LivreurContext.tsx` | relecture auto, écritures en vol, conflits, restauration |
| `src/components/Corbeille/CorbeilleSection.tsx` | écran corbeille |
| `src/components/OperateurGate.tsx` | demande du nom au premier usage |

---

### Task 1 : Migration 0004

**Files:**
- Create: `migrations/0004_travail_a_deux.sql`
- Test: `migrations/0004_travail_a_deux.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: colonnes `tournees.deleted_at`, `tournees.version`, `tournees.created_by`, `tournees.updated_by`, `tournees.deleted_by`, `livreurs.deleted_at`, `livreurs.deleted_by`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `migrations/0004_travail_a_deux.test.ts` :

```typescript
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = resolve(process.cwd(), 'migrations')
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

function migrateUpTo(stop: string) {
  const db = new Database(':memory:')
  for (const f of files) {
    db.exec(readFileSync(resolve(DIR, f), 'utf8'))
    if (f === stop) break
  }
  return db
}

describe('migration 0004 — travail à deux', () => {
  it('laisse les tournées existantes vivantes, en version 1, sans auteur connu', () => {
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

  it('laisse les livreurs existants vivants', () => {
    const db = migrateUpTo('0003_peage.sql')
    db.prepare(
      "INSERT INTO livreurs (id, nom, prenom, telephone, color_index, created_at) VALUES ('l1', 'B', 'K', '', 0, 1)",
    ).run()
    db.exec(readFileSync(resolve(DIR, '0004_travail_a_deux.sql'), 'utf8'))
    const r = db.prepare('SELECT deleted_at FROM livreurs WHERE id = ?').get('l1') as { deleted_at: unknown }
    expect(r.deleted_at).toBeNull()
  })

  it('n’ajoute ni ne supprime aucune table', () => {
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
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run migrations/0004_travail_a_deux.test.ts`
Expected: FAIL — `ENOENT: no such file ... 0004_travail_a_deux.sql`

- [ ] **Step 3 : Écrire la migration**

Créer `migrations/0004_travail_a_deux.sql` :

```sql
-- Travail à deux sans perte de données.
-- Purement additive : aucun UPDATE de rattrapage, les valeurs par défaut disent
-- déjà la vérité sur les lignes existantes (vivantes, version 1, auteur inconnu).

-- Corbeille : NULL = vivant, sinon epoch ms de la suppression.
ALTER TABLE tournees ADD COLUMN deleted_at INTEGER;
ALTER TABLE livreurs ADD COLUMN deleted_at INTEGER;

-- Verrou optimiste : incrémenté à chaque écriture, sert à refuser une écriture
-- fondée sur une lecture périmée.
ALTER TABLE tournees ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Attribution déclarative (non vérifiée, faute d'authentification).
ALTER TABLE tournees ADD COLUMN created_by TEXT;
ALTER TABLE tournees ADD COLUMN updated_by TEXT;
ALTER TABLE tournees ADD COLUMN deleted_by TEXT;
ALTER TABLE livreurs ADD COLUMN deleted_by TEXT;
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npx vitest run migrations/0004_travail_a_deux.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5 : Commit**

```bash
git add migrations/0004_travail_a_deux.sql migrations/0004_travail_a_deux.test.ts
git commit -m "feat: migration 0004 — corbeille, version, attribution"
```

---

### Task 2 : Le double D1 expose `meta.changes`

**Files:**
- Modify: `src/test/d1.ts:20` (la méthode `run`)
- Test: `src/test/d1.test.ts` (créer)

**Interfaces:**
- Consumes: rien.
- Produces: `run()` renvoie `{ success: true, meta: { changes: number } }`. Sans cela, la détection de conflit de la Task 4 n'est pas testable.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/test/d1.test.ts` :

```typescript
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
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/test/d1.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'changes')`

- [ ] **Step 3 : Implémenter**

Dans `src/test/d1.ts`, remplacer la méthode `run` :

```typescript
        async run() {
          const info = stmt.run(...args)
          return { success: true, meta: { changes: info.changes } }
        },
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npx vitest run src/test/d1.test.ts`
Expected: PASS

Puis `npm test` — la suite complète doit rester verte.

- [ ] **Step 5 : Commit**

```bash
git add src/test/d1.ts src/test/d1.test.ts
git commit -m "test: le double D1 expose meta.changes"
```

---

### Task 3 : Corbeille côté base

**Files:**
- Modify: `functions/api/_db.ts` (types `Tournee`/`Livreur`, `rowToTournee`, `rowToLivreur`, `getState`, `deleteTournee`, `deleteLivreur`)
- Test: `functions/api/_db.test.ts` (ajouter un bloc `describe`)

**Interfaces:**
- Consumes: colonnes de la Task 1.
- Produces:
  - `deleteTournee(db, id, par?: string): Promise<void>` — marque, ne supprime pas.
  - `deleteLivreur(db, id, par?: string): Promise<void>` — marque le livreur **seul**.
  - `restoreTournee(db, id): Promise<void>` et `restoreLivreur(db, id): Promise<void>`.
  - `getCorbeille(db): Promise<{ tournees: Tournee[]; livreurs: Livreur[] }>`.
  - `Livreur` gagne `deletedAt?: number`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `functions/api/_db.test.ts` (et compléter l'import en tête du fichier avec `restoreTournee, restoreLivreur, getCorbeille`) :

```typescript
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
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: FAIL — `getCorbeille is not a function`, puis des tournées toujours présentes après suppression du livreur.

- [ ] **Step 3 : Implémenter**

Dans `functions/api/_db.ts` :

Étendre les interfaces exportées :

```typescript
export interface Livreur {
  id: string; nom: string; prenom: string; telephone: string; colorIndex: number
  deletedAt?: number
}
```

Ajouter à `Tournee` :

```typescript
  deletedAt?: number
  deletedBy?: string
```

Étendre les types de lignes :

```typescript
interface LivreurRow { /* … existant … */ deleted_at: number | null }
interface TourneeRow { /* … existant … */ deleted_at: number | null; deleted_by: string | null }
```

Compléter les convertisseurs :

```typescript
const rowToLivreur = (r: LivreurRow): Livreur => ({
  id: r.id, nom: r.nom, prenom: r.prenom, telephone: r.telephone, colorIndex: r.color_index,
  deletedAt: r.deleted_at ?? undefined,
})
```

et dans `rowToTournee`, ajouter :

```typescript
  deletedAt: r.deleted_at ?? undefined,
  deletedBy: r.deleted_by ?? undefined,
```

Filtrer dans `getState` — **les tournées supprimées sortent, les livreurs supprimés restent** (leur nom doit rester résoluble sur les tournées anciennes) :

```typescript
    db.prepare('SELECT * FROM livreurs ORDER BY created_at').all<LivreurRow>(),
    db.prepare('SELECT * FROM tournees WHERE deleted_at IS NULL ORDER BY date DESC').all<TourneeRow>(),
```

Remplacer les suppressions :

```typescript
export async function deleteTournee(db: D1Database, id: string, par?: string): Promise<void> {
  await db
    .prepare('UPDATE tournees SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?')
    .bind(Date.now(), par ?? null, Date.now(), id)
    .run()
}

/** Marque le livreur seul : ses tournées sont de l'historique de livraison, elles restent. */
export async function deleteLivreur(db: D1Database, id: string, par?: string): Promise<void> {
  await db
    .prepare('UPDATE livreurs SET deleted_at = ?, deleted_by = ? WHERE id = ?')
    .bind(Date.now(), par ?? null, id)
    .run()
}

export async function restoreTournee(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE tournees SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?')
    .bind(Date.now(), id)
    .run()
}

export async function restoreLivreur(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE livreurs SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(id).run()
}

export async function getCorbeille(db: D1Database) {
  const [tou, liv] = await Promise.all([
    db.prepare('SELECT * FROM tournees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all<TourneeRow>(),
    db.prepare('SELECT * FROM livreurs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all<LivreurRow>(),
  ])
  return { tournees: tou.results.map(rowToTournee), livreurs: liv.results.map(rowToLivreur) }
}
```

**Supprimer entièrement** la ligne `DELETE FROM tournees WHERE livreur_id = ?` qui précédait la suppression du livreur : c'est le cœur du changement.

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: PASS. Le test existant « met à jour puis supprime (cascade tournées) » va échouer — il encode l'ancien comportement. Le réécrire pour affirmer le nouveau : après `deleteLivreur`, `getState(db).tournees` contient **toujours** la tournée.

- [ ] **Step 5 : Commit**

```bash
git add functions/api/_db.ts functions/api/_db.test.ts
git commit -m "feat: corbeille — suppression par marquage, le livreur ne cascade plus"
```

---

### Task 4 : Verrou optimiste et conflits

**Files:**
- Modify: `functions/api/_db.ts` (`updateTournee`), `functions/api/_http.ts`, `functions/api/tournees/[id].ts`
- Test: `functions/api/_db.test.ts`, `functions/api/routes.test.ts`

**Interfaces:**
- Consumes: `tournees.version` (Task 1), `meta.changes` (Task 2).
- Produces:
  - `Tournee` gagne `version: number`.
  - `updateTournee(db, id, patch)` où `patch.version?: number` ; renvoie `{ ok: true; version: number } | { ok: false; raison: 'conflit' | 'absente' }`.
  - `conflict(msg)` → `409`, `gone(msg)` → `410` dans `_http.ts`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `functions/api/_db.test.ts` :

```typescript
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
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: FAIL — `updateTournee` renvoie `undefined`, pas d'objet `{ ok }`.

- [ ] **Step 3 : Implémenter**

Dans `functions/api/_db.ts`, ajouter `version: number` à l'interface `Tournee` et `version: number` à `TourneeRow`, puis `version: r.version` dans `rowToTournee`. Dans `createTournee`, l'objet renvoyé porte `version: 1`.

Remplacer `updateTournee` :

```typescript
export type ResultatEcriture =
  | { ok: true; version: number }
  | { ok: false; raison: 'conflit' | 'absente' }

export async function updateTournee(
  db: D1Database,
  id: string,
  patch: {
    livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
    departHeure?: string; retourHeure?: string; ordreManuel?: boolean; sansPeage?: boolean
    version?: number; par?: string
  },
): Promise<ResultatEcriture> {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.livreurId !== undefined) { sets.push('livreur_id = ?'); vals.push(patch.livreurId) }
  if (patch.date !== undefined) { sets.push('date = ?'); vals.push(patch.date) }
  if (patch.stops !== undefined) { sets.push('stops_json = ?'); vals.push(JSON.stringify(patch.stops)) }
  if (patch.route !== undefined) { sets.push('route_json = ?'); vals.push(patch.route ? JSON.stringify(patch.route) : null) }
  if (patch.departHeure !== undefined) { sets.push('depart_heure = ?'); vals.push(patch.departHeure || null) }
  if (patch.retourHeure !== undefined) { sets.push('retour_heure = ?'); vals.push(patch.retourHeure || null) }
  if (patch.ordreManuel !== undefined) { sets.push('ordre_manuel = ?'); vals.push(patch.ordreManuel ? 1 : 0) }
  if (patch.sansPeage !== undefined) { sets.push('sans_peage = ?'); vals.push(patch.sansPeage ? 1 : 0) }
  sets.push('updated_by = ?'); vals.push(patch.par ?? null)
  sets.push('updated_at = ?'); vals.push(Date.now())
  sets.push('version = version + 1')

  // Le verrou : on n'écrit que si la version lue par le client est toujours d'actualité,
  // et jamais sur une tournée mise à la corbeille.
  const garde = patch.version !== undefined ? ' AND version = ?' : ''
  vals.push(id)
  if (patch.version !== undefined) vals.push(patch.version)

  const res = await db
    .prepare(`UPDATE tournees SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL${garde}`)
    .bind(...vals)
    .run()

  if (res.meta.changes === 1) {
    const row = await db.prepare('SELECT version FROM tournees WHERE id = ?').bind(id).first<{ version: number }>()
    return { ok: true, version: row?.version ?? 0 }
  }
  const vivante = await db
    .prepare('SELECT 1 AS v FROM tournees WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{ v: number }>()
  return { ok: false, raison: vivante ? 'conflit' : 'absente' }
}
```

Dans `functions/api/_http.ts`, ajouter :

```typescript
export const conflict = (msg: string) => json({ error: msg }, 409)
export const gone = (msg: string) => json({ error: msg }, 410)
```

Dans `functions/api/tournees/[id].ts`, traduire le résultat :

```typescript
export const onRequestPut = async (c: Ctx): Promise<Response> => {
  const patch = (await c.request.json().catch(() => ({}))) as Record<string, unknown>
  const par = c.request.headers.get('X-Operateur') ?? undefined
  const r = await updateTournee(c.env.DB, c.params.id, { ...patch, par })
  if (r.ok) return json({ ok: true, version: r.version })
  return r.raison === 'conflit'
    ? conflict('Cette tournée a été modifiée ailleurs.')
    : gone('Cette tournée a été supprimée.')
}
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run functions/api/_db.test.ts functions/api/routes.test.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add functions/api/_db.ts functions/api/_http.ts "functions/api/tournees/[id].ts" functions/api/_db.test.ts
git commit -m "feat: verrou optimiste par version, réponses 409 et 410"
```

---

### Task 5 : Attribution et endpoints corbeille / sync

**Files:**
- Modify: `functions/api/_db.ts` (`createTournee`), `functions/api/tournees/index.ts`, `functions/api/livreurs/[id].ts`
- Create: `functions/api/corbeille/index.ts`, `functions/api/corbeille/[id].ts`, `functions/api/sync.ts`
- Test: `functions/api/_db.test.ts`

**Interfaces:**
- Consumes: `getCorbeille`, `restoreTournee`, `restoreLivreur` (Task 3).
- Produces:
  - `createTournee(db, { livreurId, date, par? })` écrit `created_by`.
  - `getSync(db): Promise<{ stamp: number; livreurs: number }>`.
  - `GET /api/corbeille`, `POST /api/corbeille/:id` (corps `{ type: 'tournee' | 'livreur' }`), `GET /api/sync`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Compléter l'import en tête de `functions/api/_db.test.ts` avec `getSync`, puis ajouter :

```typescript
describe('_db — attribution et synchro', () => {
  it('la création retient son auteur', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    await createTournee(db, { livreurId: l.id, date: '2026-09-22', par: 'Thomas' })
    expect((await getState(db)).tournees[0].createdBy).toBe('Thomas')
  })

  it('la modification retient son auteur', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22', par: 'Thomas' })
    await updateTournee(db, t.id, { date: '2026-09-23', par: 'Alexis' })
    const vue = (await getState(db)).tournees[0]
    expect(vue.createdBy).toBe('Thomas')
    expect(vue.updatedBy).toBe('Alexis')
  })

  it('sans en-tête d’opérateur, l’écriture passe et l’auteur reste inconnu', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const t = await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    expect(t.createdBy).toBeUndefined()
  })

  it('le résumé de synchro bouge à chaque écriture', async () => {
    const db = makeTestDb()
    const l = await createLivreur(db, { nom: 'B', prenom: 'K' })
    const avant = await getSync(db)
    await createTournee(db, { livreurId: l.id, date: '2026-09-22' })
    const apres = await getSync(db)
    expect(apres.stamp).toBeGreaterThanOrEqual(avant.stamp)
    expect(apres.livreurs).toBe(1)
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run functions/api/_db.test.ts`
Expected: FAIL — `getSync is not a function`, `createdBy` vaut `undefined`.

- [ ] **Step 3 : Implémenter**

Dans `_db.ts`, ajouter à `Tournee` : `createdBy?: string; updatedBy?: string`, à `TourneeRow` : `created_by: string | null; updated_by: string | null`, et dans `rowToTournee` :

```typescript
  createdBy: r.created_by ?? undefined,
  updatedBy: r.updated_by ?? undefined,
```

`createTournee` accepte et écrit l'auteur :

```typescript
export async function createTournee(
  db: D1Database,
  input: { livreurId: string; date: string; par?: string },
): Promise<Tournee> {
  const tournee: Tournee = {
    id: newId(), livreurId: input.livreurId, date: input.date, stops: [],
    sansPeage: true, version: 1, createdBy: input.par,
  }
  await db
    .prepare('INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(tournee.id, tournee.livreurId, tournee.date, '[]', null, Date.now(), input.par ?? null, input.par ?? null)
    .run()
  return tournee
}

/** Résumé minuscule : sondé périodiquement à la place de l'état complet (3,4 Mo). */
export async function getSync(db: D1Database) {
  const [t, l] = await Promise.all([
    db.prepare('SELECT MAX(updated_at) AS stamp FROM tournees').first<{ stamp: number | null }>(),
    db.prepare('SELECT COUNT(*) AS n FROM livreurs').first<{ n: number }>(),
  ])
  return { stamp: t?.stamp ?? 0, livreurs: l?.n ?? 0 }
}
```

Créer `functions/api/sync.ts` :

```typescript
import type { D1Database } from '@cloudflare/workers-types'
import { getSync } from './_db'
import { json } from './_http'

export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getSync(c.env.DB))
```

Créer `functions/api/corbeille/index.ts` :

```typescript
import type { D1Database } from '@cloudflare/workers-types'
import { getCorbeille } from '../_db'
import { json } from '../_http'

export const onRequestGet = async (c: { env: { DB: D1Database } }): Promise<Response> =>
  json(await getCorbeille(c.env.DB))
```

Créer `functions/api/corbeille/[id].ts` :

```typescript
import type { D1Database } from '@cloudflare/workers-types'
import { restoreLivreur, restoreTournee } from '../_db'
import { badRequest, json } from '../_http'

type Ctx = { env: { DB: D1Database }; request: Request; params: { id: string } }

export const onRequestPost = async (c: Ctx): Promise<Response> => {
  const { type } = (await c.request.json().catch(() => ({}))) as { type?: string }
  if (type === 'tournee') await restoreTournee(c.env.DB, c.params.id)
  else if (type === 'livreur') await restoreLivreur(c.env.DB, c.params.id)
  else return badRequest('type attendu : tournee ou livreur')
  return json({ ok: true })
}
```

Dans `functions/api/tournees/index.ts` et `functions/api/livreurs/[id].ts`, lire l'en-tête et le transmettre :

```typescript
const par = c.request.headers.get('X-Operateur') ?? undefined
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run functions/api/` puis `npm test`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add functions/api/
git commit -m "feat: attribution des écritures, endpoints corbeille et sync"
```

---

### Task 6 : Client API — en-tête, conflits typés, corbeille

**Files:**
- Modify: `src/services/api.ts`
- Create: `src/state/operateur.ts`
- Test: `src/services/api.test.ts`

**Interfaces:**
- Consumes: les endpoints de la Task 5.
- Produces:
  - `ConflitError` (classe) avec `type: 'conflit' | 'absente'`.
  - `setOperateur(nom: string)` / `getOperateur(): string` dans `src/state/operateur.ts`.
  - `api.getSync()`, `api.getCorbeille()`, `api.restore(id, type)`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `src/services/api.test.ts` :

```typescript
import { ConflitError } from './api'
import { setOperateur } from '../state/operateur'

describe('api — travail à deux', () => {
  it('joint le nom de l’opérateur à chaque écriture', async () => {
    setOperateur('Thomas')
    const fn = mockFetch({ ok: true, version: 2 })
    await api.updateTournee('t1', { date: '2026-09-23' })
    const init = fn.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers['X-Operateur']).toBe('Thomas')
  })

  it('traduit un 409 en conflit exploitable', async () => {
    mockFetch({ error: 'modifiée ailleurs' }, false, 409)
    await expect(api.updateTournee('t1', { date: 'x' })).rejects.toBeInstanceOf(ConflitError)
  })

  it('traduit un 410 en disparition', async () => {
    mockFetch({ error: 'supprimée' }, false, 410)
    await api.updateTournee('t1', { date: 'x' }).catch((e: ConflitError) => {
      expect(e.type).toBe('absente')
    })
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/services/api.test.ts`
Expected: FAIL — `ConflitError` n'existe pas.

- [ ] **Step 3 : Implémenter**

Créer `src/state/operateur.ts` :

```typescript
const CLE = 'livreur:v3:operateur'

/** Identité déclarative du poste. Non vérifiée : sert à tracer, pas à sécuriser. */
export function getOperateur(): string {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '""') as string
  } catch {
    return ''
  }
}

export function setOperateur(nom: string): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(nom))
  } catch {
    /* mode privé : on continue sans mémoriser */
  }
}
```

Dans `src/services/api.ts`, remplacer `req` :

```typescript
import { getOperateur } from '../state/operateur'

/** Écriture refusée par le serveur : version périmée (409) ou tournée disparue (410). */
export class ConflitError extends Error {
  constructor(public type: 'conflit' | 'absente', message: string) {
    super(message)
    this.name = 'ConflitError'
  }
}

async function req<T>(url: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  const op = getOperateur()
  if (op) headers['X-Operateur'] = op

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const msg = (detail as { error?: string } | null)?.error ?? `Erreur ${res.status}`
    if (res.status === 409) throw new ConflitError('conflit', msg)
    if (res.status === 410) throw new ConflitError('absente', msg)
    throw new Error(msg)
  }
  return (await res.json()) as T
}
```

Ajouter à l'objet `api` :

```typescript
  getSync: () => req<{ stamp: number; livreurs: number }>('/api/sync', 'GET'),
  getCorbeille: () => req<{ tournees: Tournee[]; livreurs: Livreur[] }>('/api/corbeille', 'GET'),
  restore: (id: string, type: 'tournee' | 'livreur') =>
    req<{ ok: true }>(`/api/corbeille/${id}`, 'POST', { type }),
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run src/services/api.test.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/services/api.ts src/state/operateur.ts src/services/api.test.ts
git commit -m "feat: client — en-tête opérateur, conflits typés, corbeille"
```

---

### Task 7 : Rafraîchissement automatique et gestion du conflit

**Files:**
- Modify: `src/state/LivreurContext.tsx`
- Test: `src/state/LivreurContext.test.tsx`

**Interfaces:**
- Consumes: `api.getSync`, `ConflitError`, `api.restore` (Task 6).
- Produces: `LivreurState` gagne `recharger: () => Promise<void>` et `restaurer: (id, type) => Promise<void>`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `src/state/LivreurContext.test.tsx` (compléter le mock d'`api` avec `getSync: vi.fn(async () => ({ stamp: 1, livreurs: 0 }))`, `getCorbeille`, `restore`, et importer `ConflitError` depuis `../services/api`) :

```typescript
describe('LivreurContext — travail à deux', () => {
  it('relit l’état quand l’onglet redevient visible et que le serveur a bougé', async () => {
    vi.mocked(api.getSync).mockResolvedValue({ stamp: 999, livreurs: 0 })
    const { result } = await ready()
    vi.mocked(api.getState).mockClear()

    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
    expect(result.current.error).toBeNull()
  })

  it('ne relit pas si le serveur n’a pas bougé', async () => {
    await ready()
    const stampInitial = vi.mocked(api.getSync).mock.results[0]
    expect(stampInitial).toBeDefined()
    vi.mocked(api.getState).mockClear()

    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getState).not.toHaveBeenCalled()
  })

  it('un conflit annule la modification locale et prévient', async () => {
    const { result } = await ready()
    await act(async () => { await result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }) })
    let tid = ''
    await act(async () => {
      tid = await result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-09-22' })
    })
    vi.mocked(api.updateTournee).mockRejectedValueOnce(new ConflitError('conflit', 'modifiée ailleurs'))

    await act(async () => { await result.current.updateTournee(tid, { date: '2026-09-23' }) })

    expect(result.current.error).toMatch(/modifiée ailleurs/i)
    expect(api.getState).toHaveBeenCalledTimes(2) // chargement initial + rechargement après conflit
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL — aucune relecture déclenchée, `error` reste `null`.

- [ ] **Step 3 : Implémenter**

Dans `LivreurContext.tsx`, après le chargement initial :

```typescript
  // Écritures en vol : on ne relit pas pendant qu'une requête est en cours,
  // sinon un état serveur antérieur écraserait brièvement une mise à jour optimiste.
  const enVol = useRef(0)
  const dernierStamp = useRef<number>(0)

  const recharger = useCallback(async () => {
    const s = await api.getState()
    setLivreursRaw(s.livreurs); setTournees(s.tournees); setAdresses(s.adresses)
  }, [])

  // Sonde le résumé (quelques octets) plutôt que l'état complet (3,4 Mo),
  // et ne recharge que si le serveur a effectivement bougé.
  const sonder = useCallback(async () => {
    if (enVol.current > 0 || document.visibilityState !== 'visible') return
    try {
      const { stamp, livreurs: n } = await api.getSync()
      const clef = stamp * 1000 + n
      if (clef === dernierStamp.current) return
      dernierStamp.current = clef
      await recharger()
    } catch { /* hors-ligne : on retentera au prochain tour */ }
  }, [recharger])

  useEffect(() => {
    const onVisible = () => { void sonder() }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => { void sonder() }, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [sonder])
```

Adapter `fail` pour traiter le conflit :

```typescript
  const fail = useCallback((e: unknown) => {
    if (e instanceof ConflitError) {
      setError(
        e.type === 'conflit'
          ? 'Cette tournée a été modifiée ailleurs. Les données ont été rechargées.'
          : 'Cette tournée a été supprimée ailleurs. Les données ont été rechargées.',
      )
      void recharger()
      return
    }
    setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
  }, [recharger])
```

Encadrer chaque appel `api.*` d'écriture par `enVol.current++` / `enVol.current--` dans un `try/finally`, et ajouter `restaurer` :

```typescript
  const restaurer = useCallback(async (id: string, type: 'tournee' | 'livreur') => {
    try {
      await api.restore(id, type)
      await recharger()
    } catch (e) { fail(e) }
  }, [recharger, fail])
```

Exposer `recharger` et `restaurer` dans l'interface `LivreurState` et dans l'objet `value`.

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/state/LivreurContext.tsx src/state/LivreurContext.test.tsx
git commit -m "feat: relecture automatique de l'état et gestion des conflits"
```

---

### Task 8 : Écran Corbeille

**Files:**
- Create: `src/components/Corbeille/CorbeilleSection.tsx`, `src/components/Corbeille/CorbeilleSection.test.tsx`
- Modify: `src/types.ts` (type `Section`), `src/components/layout/Sidebar.tsx`, `src/App.tsx`, `src/styles/app.css`

**Interfaces:**
- Consumes: `api.getCorbeille`, `restaurer` (Tasks 6-7).
- Produces: `Section` gagne `'corbeille'`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/components/Corbeille/CorbeilleSection.test.tsx` :

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CorbeilleSection } from './CorbeilleSection'

const restaurer = vi.fn()

vi.mock('../../services/api', () => ({
  api: {
    getCorbeille: vi.fn(async () => ({
      tournees: [{
        id: 't1', livreurId: 'l1', date: '2026-09-11', stops: [], version: 1,
        deletedAt: 1758500000000, deletedBy: 'Alexis',
      }],
      livreurs: [],
    })),
  },
}))

vi.mock('../../state/LivreurContext', () => ({
  useLivreur: () => ({ restaurer, livreurs: [{ id: 'l1', nom: 'MACE', prenom: 'Julian', couleur: 'var(--c-1)' }] }),
}))

describe('CorbeilleSection', () => {
  it('liste les tournées supprimées avec leur auteur', async () => {
    render(<CorbeilleSection />)
    expect(await screen.findByText(/2026-09-11/)).toBeInTheDocument()
    expect(screen.getByText(/Alexis/)).toBeInTheDocument()
  })

  it('restaure une tournée', async () => {
    render(<CorbeilleSection />)
    await userEvent.click(await screen.findByRole('button', { name: /restaurer/i }))
    await waitFor(() => expect(restaurer).toHaveBeenCalledWith('t1', 'tournee'))
  })

  it('annonce une corbeille vide', async () => {
    const { api } = await import('../../services/api')
    vi.mocked(api.getCorbeille).mockResolvedValueOnce({ tournees: [], livreurs: [] })
    render(<CorbeilleSection />)
    expect(await screen.findByText(/corbeille est vide/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/components/Corbeille/CorbeilleSection.test.tsx`
Expected: FAIL — module `./CorbeilleSection` introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/components/Corbeille/CorbeilleSection.tsx` :

```typescript
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useLivreur } from '../../state/LivreurContext'
import type { Livreur, Tournee } from '../../types'

const dateFr = (ms: number) => new Date(ms).toLocaleString('fr-FR')

export function CorbeilleSection() {
  const { restaurer, livreurs } = useLivreur()
  const [contenu, setContenu] = useState<{ tournees: Tournee[]; livreurs: Livreur[] } | null>(null)

  const charger = useCallback(() => { void api.getCorbeille().then(setContenu) }, [])
  useEffect(charger, [charger])

  const rendre = async (id: string, type: 'tournee' | 'livreur') => {
    await restaurer(id, type)
    charger()
  }

  if (!contenu) return <p className="empty">Chargement…</p>
  const vide = !contenu.tournees.length && !contenu.livreurs.length

  return (
    <section>
      <h1>Corbeille</h1>
      <p className="muted">Rien n’est jamais supprimé définitivement. Tout élément ici peut être restauré.</p>
      {vide && <p className="empty">La corbeille est vide.</p>}
      <ul className="tournee-list">
        {contenu.tournees.map((t) => {
          const l = livreurs.find((x) => x.id === t.livreurId)
          return (
            <li key={t.id} className="tournee-row">
              <span className="tournee-date">{t.date}</span>
              <span className="tournee-livreur">{l ? `${l.prenom} ${l.nom}` : '—'}</span>
              <span className="tournee-stats">
                {t.stops.length} arrêt(s)
                {t.deletedAt ? ` · supprimée le ${dateFr(t.deletedAt)}` : ''}
                {t.deletedBy ? ` par ${t.deletedBy}` : ''}
              </span>
              <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => void rendre(t.id, 'tournee')}>
                Restaurer
              </button>
            </li>
          )
        })}
        {contenu.livreurs.map((l) => (
          <li key={l.id} className="tournee-row">
            <span className="tournee-livreur">{l.prenom} {l.nom}</span>
            <span className="tournee-stats">
              {l.deletedAt ? `supprimé le ${dateFr(l.deletedAt)}` : ''}
              {l.deletedBy ? ` par ${l.deletedBy}` : ''}
            </span>
            <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => void rendre(l.id, 'livreur')}>
              Restaurer
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Dans `src/types.ts` :

```typescript
export type Section = 'livreurs' | 'tournees' | 'chauffeurs' | 'historique' | 'corbeille'
```

et ajouter à `Tournee` : `version?: number; deletedAt?: number; deletedBy?: string; createdBy?: string; updatedBy?: string`, à `Livreur` : `deletedAt?: number; deletedBy?: string`.

Dans `Sidebar.tsx`, ajouter à `ITEMS` :

```typescript
  { id: 'corbeille', label: 'Corbeille', icon: '🗑️' },
```

Dans `App.tsx`, importer `CorbeilleSection` et ajouter :

```typescript
        {section === 'corbeille' && <CorbeilleSection />}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npx vitest run src/components/Corbeille/` puis `npm test`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/components/Corbeille/ src/types.ts src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat: écran Corbeille avec restauration"
```

---

### Task 9 : Séparer livreurs actifs et livreurs supprimés dans l'interface

`getState` renvoie **aussi** les livreurs supprimés, pour qu'une tournée ancienne puisse
encore afficher le nom de son livreur. Sans distinction côté interface, un livreur mis à la
corbeille resterait listé et **resterait proposé à l'affectation d'une nouvelle tournée**.
Deux besoins opposés cohabitent donc, et il faut deux listes.

**Files:**
- Modify: `src/state/LivreurContext.tsx` (dérivation des listes + interface `LivreurState`)
- Modify: `src/components/Livreurs/LivreurList.tsx`, `src/components/Tournees/TourneesSection.tsx`,
  `src/components/Tournees/TourneeEditor.tsx:32,47`, `src/components/Chauffeurs/ChauffeursSection.tsx:61,67,76`,
  `src/components/Tournees/TourneeList.tsx:21`, `src/components/Historique/HistoriqueSection.tsx:23`
- Test: `src/state/LivreurContext.test.tsx`

**Interfaces:**
- Consumes: `Livreur.deletedAt` (Task 3).
- Produces sur `LivreurState` :
  - `livreurs: LivreurWithColor[]` — **actifs seulement**, pour les listes et les sélecteurs.
  - `livreursTous: LivreurWithColor[]` — tous, y compris supprimés, pour résoudre un nom
    depuis `tournee.livreurId`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/state/LivreurContext.test.tsx` :

```typescript
  it('un livreur supprimé sort des listes mais reste résoluble par son nom', async () => {
    vi.mocked(api.getState).mockResolvedValueOnce({
      livreurs: [
        { id: 'l1', nom: 'ACTIF', prenom: 'A', telephone: '', colorIndex: 0 },
        { id: 'l2', nom: 'PARTI', prenom: 'P', telephone: '', colorIndex: 1, deletedAt: 1758500000000 },
      ],
      tournees: [],
      adresses: [],
    })
    const { result } = await ready()

    expect(result.current.livreurs.map((l) => l.nom)).toEqual(['ACTIF'])
    expect(result.current.livreursTous.map((l) => l.nom)).toEqual(['ACTIF', 'PARTI'])
  })
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL — `livreursTous` est `undefined`, et `livreurs` contient encore `PARTI`.

- [ ] **Step 3 : Implémenter**

Dans `LivreurContext.tsx`, remplacer la dérivation actuelle :

```typescript
  // Deux vues : les actifs pilotent les listes et l'affectation ; la liste complète
  // sert à résoudre le nom d'un livreur sur une tournée ancienne, même après son retrait.
  const livreursTous = useMemo<LivreurWithColor[]>(
    () => livreursRaw.map((l) => ({ ...l, couleur: driverColor(l.colorIndex) })),
    [livreursRaw],
  )
  const livreurs = useMemo<LivreurWithColor[]>(
    () => livreursTous.filter((l) => !l.deletedAt),
    [livreursTous],
  )
```

Ajouter `livreursTous: LivreurWithColor[]` à l'interface `LivreurState` et à l'objet `value`.

Basculer les **quatre** sites de résolution de nom sur `livreursTous` — et eux seuls :

- `src/components/Historique/HistoriqueSection.tsx:23` → `livreursTous.find(...)`
- `src/components/Tournees/TourneeList.tsx:21` → `livreursTous.find(...)`
- `src/components/Tournees/TourneeEditor.tsx:32` → `livreursTous.find(...)` (résolution)
- `src/components/Chauffeurs/ChauffeursSection.tsx:76` → `livreursTous.find(...)` (couleur du tracé)

Laisser sur `livreurs` **tous les sites de liste et de sélection**, qui doivent exclure les
supprimés : `LivreurList.tsx:6,20`, `TourneesSection.tsx:16,45`, `TourneeEditor.tsx:47`
(le `<select>` d'affectation), `ChauffeursSection.tsx:61,62,67`.

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run src/state/` puis `npm test`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/state/LivreurContext.tsx src/state/LivreurContext.test.tsx src/components/
git commit -m "feat: les livreurs supprimés sortent des listes sans devenir illisibles"
```

---

### Task 10 : Identité du poste et affichage de l'attribution

**Files:**
- Create: `src/components/OperateurGate.tsx`, `src/components/OperateurGate.test.tsx`
- Modify: `src/App.tsx`, `src/components/Tournees/TourneeEditor.tsx`, `src/components/Livreurs/LivreurList.tsx`

**Interfaces:**
- Consumes: `getOperateur`/`setOperateur` (Task 6), `Tournee.createdBy`/`updatedBy` (Task 5).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/components/OperateurGate.test.tsx` :

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { OperateurGate } from './OperateurGate'
import { getOperateur } from '../state/operateur'

afterEach(() => localStorage.clear())

describe('OperateurGate', () => {
  it('demande le nom tant qu’aucun n’est enregistré', () => {
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    expect(screen.getByLabelText(/votre nom/i)).toBeInTheDocument()
    expect(screen.queryByText('contenu')).not.toBeInTheDocument()
  })

  it('mémorise le nom saisi et laisse passer', async () => {
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    await userEvent.type(screen.getByLabelText(/votre nom/i), 'Thomas')
    await userEvent.click(screen.getByRole('button', { name: /continuer/i }))
    expect(getOperateur()).toBe('Thomas')
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })

  it('n’interroge plus une fois le nom connu', () => {
    localStorage.setItem('livreur:v3:operateur', JSON.stringify('Alexis'))
    render(<OperateurGate><p>contenu</p></OperateurGate>)
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/components/OperateurGate.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/components/OperateurGate.tsx` :

```typescript
import { useState, type ReactNode } from 'react'
import { getOperateur, setOperateur } from '../state/operateur'

/**
 * Identité déclarative du poste, demandée une fois. Elle sert à tracer qui fait quoi
 * entre collègues — ce n'est ni une authentification ni une preuve.
 */
export function OperateurGate({ children }: { children: ReactNode }) {
  const [nom, setNom] = useState(() => getOperateur())
  const [saisie, setSaisie] = useState('')

  if (nom) return <>{children}</>

  const valider = () => {
    const propre = saisie.trim()
    if (!propre) return
    setOperateur(propre)
    setNom(propre)
  }

  return (
    <div className="operateur-gate">
      <h1>Qui êtes-vous ?</h1>
      <p className="muted">
        Votre nom sert à indiquer qui a créé ou modifié une tournée. Il est enregistré
        sur ce poste uniquement, et vous ne le saisirez qu’une fois.
      </p>
      <label className="field">
        <span>Votre nom</span>
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valider()}
          autoFocus
        />
      </label>
      <button className="btn-primary" onClick={valider}>Continuer</button>
    </div>
  )
}
```

Dans `App.tsx`, envelopper le contenu par `<OperateurGate>`.

Dans `TourneeEditor.tsx`, sous l'en-tête, afficher l'attribution :

```typescript
        {(tournee.createdBy || tournee.updatedBy) && (
          <p className="muted attribution">
            {tournee.createdBy ? `Créée par ${tournee.createdBy}` : ''}
            {tournee.updatedBy ? ` · modifiée par ${tournee.updatedBy}` : ''}
          </p>
        )}
```

Dans `LivreurList.tsx`, remplacer le message de confirmation, qui annonce aujourd'hui une cascade qui n'existe plus :

```typescript
    const msg = `Mettre ${prenom} ${nom} à la corbeille ? Ses tournées sont conservées.`
```

Ajouter dans `src/styles/app.css` :

```css
.operateur-gate { max-width: 420px; margin: 15vh auto; display: flex; flex-direction: column; gap: 14px; }
.attribution { font-size: 12px; }
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `npx vitest run src/components/OperateurGate.test.tsx` puis `npm test`, `npx tsc -b`, `npm run lint`
Expected: PASS, aucun avertissement

- [ ] **Step 5 : Commit**

```bash
git add src/components/OperateurGate.tsx src/components/OperateurGate.test.tsx src/App.tsx src/components/Tournees/TourneeEditor.tsx src/components/Livreurs/LivreurList.tsx src/styles/app.css
git commit -m "feat: identité du poste et affichage de l'attribution"
```

---

### Task 11 : Mise en production

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1 : Sauvegarder la base avant migration**

```bash
npx wrangler d1 export livreur-db --remote --output backups/backup-avant-0004.sql
```

Vérifier que le dump est **restaurable**, pas seulement téléchargé :

```bash
python3 -c "
import sqlite3
db = sqlite3.connect(':memory:')
db.executescript(open('backups/backup-avant-0004.sql', encoding='utf8').read())
for t in ('livreurs','tournees','adresses'):
    print(t, db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0])
"
```

- [ ] **Step 2 : Appliquer la migration en production**

```bash
npx wrangler d1 execute livreur-db --remote --file migrations/0004_travail_a_deux.sql
```

Attendu : `7 commands executed successfully` (une par `ALTER TABLE`).

- [ ] **Step 3 : Vérifier le schéma**

```bash
npx wrangler d1 execute livreur-db --remote --json \
  --command "SELECT COUNT(*) AS vivantes, SUM(version) AS v FROM tournees WHERE deleted_at IS NULL"
```

Attendu : `vivantes` = le nombre de tournées connu avant migration, `v` = ce même nombre (toutes en version 1).

- [ ] **Step 4 : Documenter puis déployer**

Mettre à jour la section « Base de données » du `README.md` : mentionner `0004_travail_a_deux.sql`, la corbeille, le verrou de version, et **le fait que le lien reste public**.

```bash
npm test && npx tsc -b && npm run lint && npm run build
git add README.md && git commit -m "docs: corbeille, verrou de version, attribution"
git push origin main
```

- [ ] **Step 5 : Vérifier en ligne**

Attendre que le bundle servi corresponde au build local, puis :

```bash
curl -s https://livreur-7bf.pages.dev/api/sync
curl -s https://livreur-7bf.pages.dev/api/corbeille
```

Attendu : `/api/sync` renvoie `{"stamp":…,"livreurs":3}`, `/api/corbeille` renvoie deux listes vides. Vérifier enfin que `/api/state` renvoie toujours le nombre attendu de tournées.
