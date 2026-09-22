import type { Livreur, Stop, RouteResult, Suggestion, Tournee } from '../types'
import { getOperateur } from '../state/operateur'

export interface AppState {
  livreurs: Livreur[]
  tournees: Tournee[]
  adresses: Suggestion[]
}

/** Écriture refusée par le serveur : version périmée (409) ou tournée disparue (410). */
export class ConflitError extends Error {
  type: 'conflit' | 'absente'
  constructor(type: 'conflit' | 'absente', message: string) {
    super(message)
    this.name = 'ConflitError'
    this.type = type
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
    patch: {
      livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
      departHeure?: string; retourHeure?: string; ordreManuel?: boolean
      sansPeage?: boolean
    },
  ) => req<{ ok: true }>(`/api/tournees/${id}`, 'PUT', patch),
  deleteTournee: (id: string) => req<{ ok: true }>(`/api/tournees/${id}`, 'DELETE'),

  upsertAdresse: (a: Suggestion) => req<{ ok: true }>('/api/adresses', 'POST', a),
  deleteAdresse: (id: string) => req<{ ok: true }>(`/api/adresses/${id}`, 'DELETE'),

  getSync: () => req<{ stamp: number; livreurs: number }>('/api/sync', 'GET'),
  getCorbeille: () => req<{ tournees: Tournee[]; livreurs: Livreur[] }>('/api/corbeille', 'GET'),
  restore: (id: string, type: 'tournee' | 'livreur') =>
    req<{ ok: true }>(`/api/corbeille/${id}`, 'POST', { type }),
}
