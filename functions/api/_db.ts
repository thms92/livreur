import type { D1Database } from '@cloudflare/workers-types'

export interface Livreur {
  id: string; nom: string; prenom: string; telephone: string; colorIndex: number
  deletedAt?: number
}
export interface Stop { id: string; label: string; ville: string; lat: number; lng: number; heure?: string }
export interface RouteResult {
  km: number; min: number; geometry: [number, number][]; optimized: boolean; approximate: boolean
}
export interface Tournee {
  id: string; livreurId: string; date: string; stops: Stop[]; route?: RouteResult
  departHeure?: string; retourHeure?: string; ordreManuel?: boolean
  sansPeage?: boolean // true = itinéraire évitant les péages (défaut des nouvelles tournées)
  deletedAt?: number
  deletedBy?: string
}
export interface Adresse { id: string; label: string; ville: string; lat: number; lng: number }

interface LivreurRow {
  id: string; nom: string; prenom: string; telephone: string; color_index: number; created_at: number
  deleted_at: number | null
}
interface TourneeRow {
  id: string; livreur_id: string; date: string; stops_json: string; route_json: string | null; updated_at: number
  depart_heure: string | null; retour_heure: string | null; ordre_manuel: number
  sans_peage: number
  deleted_at: number | null; deleted_by: string | null
}
interface AdresseRow { id: string; label: string; ville: string; lat: number; lng: number }

function newId(): string {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const rowToLivreur = (r: LivreurRow): Livreur => ({
  id: r.id, nom: r.nom, prenom: r.prenom, telephone: r.telephone, colorIndex: r.color_index,
  deletedAt: r.deleted_at ?? undefined,
})
const rowToTournee = (r: TourneeRow): Tournee => ({
  id: r.id, livreurId: r.livreur_id, date: r.date,
  stops: JSON.parse(r.stops_json) as Stop[],
  route: r.route_json ? (JSON.parse(r.route_json) as RouteResult) : undefined,
  departHeure: r.depart_heure ?? undefined,
  retourHeure: r.retour_heure ?? undefined,
  ordreManuel: r.ordre_manuel === 1,
  sansPeage: r.sans_peage === 1,
  deletedAt: r.deleted_at ?? undefined,
  deletedBy: r.deleted_by ?? undefined,
})
const rowToAdresse = (r: AdresseRow): Adresse => ({
  id: r.id, label: r.label, ville: r.ville, lat: r.lat, lng: r.lng,
})

export async function getState(db: D1Database) {
  // Les livreurs supprimés restent ici (marqués) : une tournée ancienne doit pouvoir
  // afficher le nom d'un livreur qui n'est plus actif. Seules les tournées supprimées
  // sortent de l'état courant ; elles vivent désormais dans la corbeille.
  const [liv, tou, adr] = await Promise.all([
    db.prepare('SELECT * FROM livreurs ORDER BY created_at').all<LivreurRow>(),
    db.prepare('SELECT * FROM tournees WHERE deleted_at IS NULL ORDER BY date DESC').all<TourneeRow>(),
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

// Marque le livreur seul : ses tournées sont de l'historique de livraison et doivent
// survivre à son départ. L'ancienne cascade (DELETE FROM tournees WHERE livreur_id = ?)
// a disparu : elle effaçait des rounds entiers, ce qui viole « zéro perte de données ».
export async function deleteLivreur(db: D1Database, id: string, par?: string): Promise<void> {
  await db
    .prepare('UPDATE livreurs SET deleted_at = ?, deleted_by = ? WHERE id = ?')
    .bind(Date.now(), par ?? null, id)
    .run()
}

export async function restoreLivreur(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE livreurs SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(id).run()
}

export async function createTournee(
  db: D1Database,
  input: { livreurId: string; date: string },
): Promise<Tournee> {
  // sans_peage n'est pas dans l'INSERT : la colonne porte le défaut (1 = sans péage).
  const tournee: Tournee = {
    id: newId(), livreurId: input.livreurId, date: input.date, stops: [], sansPeage: true,
  }
  await db
    .prepare('INSERT INTO tournees (id, livreur_id, date, stops_json, route_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(tournee.id, tournee.livreurId, tournee.date, '[]', null, Date.now())
    .run()
  return tournee
}

export async function updateTournee(
  db: D1Database,
  id: string,
  patch: {
    livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
    departHeure?: string; retourHeure?: string; ordreManuel?: boolean
    sansPeage?: boolean
  },
): Promise<void> {
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
  sets.push('updated_at = ?'); vals.push(Date.now())
  vals.push(id)
  await db.prepare(`UPDATE tournees SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
}

export async function deleteTournee(db: D1Database, id: string, par?: string): Promise<void> {
  await db
    .prepare('UPDATE tournees SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?')
    .bind(Date.now(), par ?? null, Date.now(), id)
    .run()
}

export async function restoreTournee(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE tournees SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?')
    .bind(Date.now(), id)
    .run()
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

/** Le contenu de la corbeille : tournées et livreurs marqués supprimés, les plus récents d'abord. */
export async function getCorbeille(db: D1Database): Promise<{ tournees: Tournee[]; livreurs: Livreur[] }> {
  const [tou, liv] = await Promise.all([
    db.prepare('SELECT * FROM tournees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all<TourneeRow>(),
    db.prepare('SELECT * FROM livreurs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all<LivreurRow>(),
  ])
  return { tournees: tou.results.map(rowToTournee), livreurs: liv.results.map(rowToLivreur) }
}
