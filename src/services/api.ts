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
    patch: {
      livreurId?: string; date?: string; stops?: Stop[]; route?: RouteResult | null
      departHeure?: string; retourHeure?: string; ordreManuel?: boolean
    },
  ) => req<{ ok: true }>(`/api/tournees/${id}`, 'PUT', patch),
  deleteTournee: (id: string) => req<{ ok: true }>(`/api/tournees/${id}`, 'DELETE'),

  upsertAdresse: (a: Suggestion) => req<{ ok: true }>('/api/adresses', 'POST', a),
  deleteAdresse: (id: string) => req<{ ok: true }>(`/api/adresses/${id}`, 'DELETE'),
}
