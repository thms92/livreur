# Impression d'une tournée + Carnet d'adresses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter (1) l'impression d'une feuille de tournée pour le livreur, et (2) un carnet d'adresses auto‑mémorisé réutilisable dans le champ d'ajout d'arrêt.

**Architecture:** Une fonction pure `buildSheetHtml` (testable) + un wrapper `printTourneeSheet` qui ouvre une fenêtre d'impression isolée. Le carnet est un nouvel état `adresses` dans `LivreurContext`, alimenté automatiquement par `addStopToTournee` et fusionné dans `AddressAutocomplete` (entrées ★ en tête, puis BAN). Boutons « Imprimer » dans l'éditeur de tournée et la section Chauffeurs.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, localStorage (`livreur:v3:`).

---

## File Structure

**Créés :**
- `src/services/printSheet.ts` — `buildSheetHtml` (pur) + `printTourneeSheet` (effet).
- `src/services/printSheet.test.ts`.
- `src/components/AddressAutocomplete.test.tsx`.

**Modifiés :**
- `src/state/LivreurContext.tsx` — état `adresses`, `removeAdresse`, upsert dans `addStopToTournee`.
- `src/state/LivreurContext.test.tsx` — tests carnet.
- `src/components/AddressAutocomplete.tsx` — props `saved`/`onRemoveSaved`, fusion d'affichage + nav clavier sur liste combinée.
- `src/components/Tournees/TourneeEditor.tsx` — passe `saved`/`onRemoveSaved`, bouton « Imprimer ».
- `src/components/Chauffeurs/ChauffeurCard.tsx` — bouton « Imprimer » par tournée.
- `src/styles/app.css` — styles ★/✕ et bouton d'impression.

---

## Task 1: Service d'impression (`printSheet`)

**Files:**
- Create: `src/services/printSheet.ts`
- Test: `src/services/printSheet.test.ts`

- [ ] **Step 1: Écrire le test (TDD)**

Créer `src/services/printSheet.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { buildSheetHtml } from './printSheet'
import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'

const livreur: LivreurWithColor = {
  id: 'l1', nom: 'Benali', prenom: 'Karim', telephone: '0612345678', colorIndex: 0, couleur: 'var(--c-1)',
}

const tournee: Tournee = {
  id: 't1', livreurId: 'l1', date: '2026-06-18',
  stops: [
    { id: 's1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 },
    { id: 's2', label: '4 Avenue de la Gare', ville: 'Auneau', lat: 48.1, lng: 1.1 },
  ],
  route: { km: 47, min: 72, geometry: [], optimized: true, approximate: false },
}

describe('buildSheetHtml', () => {
  it('contient le livreur, le téléphone, la date FR et le total', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect(html).toContain('Karim Benali')
    expect(html).toContain('0612345678')
    expect(html).toContain('18/06/2026')
    expect(html).toContain('47 km')
    expect(html).toContain('72 min')
  })

  it('place Letourville en départ ET en retour', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect((html.match(/Letourville/g) ?? []).length).toBe(2)
    expect(html).toContain('Départ')
    expect(html).toContain('Retour')
  })

  it('liste les arrêts dans l’ordre', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect(html.indexOf('12 Rue des Lilas')).toBeLessThan(html.indexOf('4 Avenue de la Gare'))
  })

  it('omet le total quand la route est absente', () => {
    const html = buildSheetHtml({ ...tournee, route: undefined }, livreur)
    expect(html).not.toContain('Total :')
  })

  it('signale l’estimation hors-ligne', () => {
    const html = buildSheetHtml(
      { ...tournee, route: { km: 47, min: 72, geometry: [], optimized: false, approximate: true } },
      livreur,
    )
    expect(html).toContain('estimation hors-ligne')
  })

  it('échappe le HTML des libellés', () => {
    const html = buildSheetHtml(
      { ...tournee, stops: [{ id: 'x', label: '<script>x', ville: 'V', lat: 0, lng: 0 }] },
      livreur,
    )
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x')
  })
})
```

- [ ] **Step 2: Lancer le test, le voir échouer**

Run: `npx vitest run src/services/printSheet.test.ts`
Expected: FAIL (module/exports manquants).

- [ ] **Step 3: Implémenter `src/services/printSheet.ts`**

```ts
import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'
import { DEPOT } from '../data/depot'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Construit le document HTML autonome de la feuille de tournée (pur, testable). */
export function buildSheetHtml(tournee: Tournee, livreur: LivreurWithColor | undefined): string {
  const nom = livreur ? `${livreur.prenom} ${livreur.nom}` : '—'
  const tel = livreur?.telephone ? ` · ${esc(livreur.telephone)}` : ''
  const depotLine = `${DEPOT.label}, ${DEPOT.ville} (${DEPOT.codePostal})`
  const total = tournee.route
    ? `${tournee.route.km.toFixed(0)} km · ${Math.round(tournee.route.min)} min` +
      (tournee.route.approximate ? ' (estimation hors-ligne)' : '')
    : ''
  const rows = tournee.stops
    .map(
      (s, i) =>
        `<li><span class="n">${i + 1}.</span> <span class="a">${esc(s.label)}</span>` +
        (s.ville ? ` — <span class="v">${esc(s.ville)}</span>` : '') +
        `</li>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Feuille de tournée</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { font-size: 14px; margin-bottom: 16px; line-height: 1.5; }
  .meta b { font-size: 16px; }
  ol { list-style: none; padding: 0; margin: 0; font-size: 15px; }
  li { padding: 8px 4px; border-bottom: 1px solid #ccc; }
  li.depot { font-weight: bold; }
  .n { display: inline-block; width: 1.8em; font-weight: bold; }
  .v { color: #444; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Feuille de tournée</h1>
  <div class="meta"><b>${esc(nom)}</b>${tel}<br>Date : ${esc(formatDateFr(tournee.date))}${
    total ? `<br>Total : ${esc(total)}` : ''
  }</div>
  <ol>
    <li class="depot">🏭 Départ — ${esc(depotLine)}</li>
    ${rows}
    <li class="depot">🏭 Retour — ${esc(depotLine)}</li>
  </ol>
</body></html>`
}

/** Ouvre une fenêtre isolée et lance l'impression. Déclenché par un clic utilisateur. */
export function printTourneeSheet(tournee: Tournee, livreur: LivreurWithColor | undefined): void {
  const html = buildSheetHtml(tournee, livreur)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}
```

- [ ] **Step 4: Lancer le test, le voir passer**

Run: `npx vitest run src/services/printSheet.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/printSheet.ts src/services/printSheet.test.ts
git commit -m "feat: service printSheet (feuille de tournée imprimable)"
```

---

## Task 2: Carnet d'adresses dans le contexte

**Files:**
- Modify: `src/state/LivreurContext.tsx`
- Modify: `src/state/LivreurContext.test.tsx`

- [ ] **Step 1: Ajouter les tests carnet (TDD)**

Dans `src/state/LivreurContext.test.tsx`, ajouter ce `describe` à la fin du fichier (le helper `sugg` et le `wrapper` existent déjà plus haut dans ce fichier — les réutiliser) :

```tsx
describe('LivreurContext — carnet d’adresses', () => {
  it('mémorise automatiquement l’adresse ajoutée (dédup par id)', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' }) })
    const a = { id: 'ban-1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 }
    act(() => result.current.addStopToTournee(tid, a))
    act(() => result.current.addStopToTournee(tid, a)) // même adresse → pas de doublon
    expect(result.current.adresses).toHaveLength(1)
    expect(result.current.adresses[0]).toMatchObject({ id: 'ban-1', label: '12 Rue des Lilas', ville: 'Chartres' })
  })

  it('removeAdresse retire l’entrée du carnet', () => {
    const { result } = renderHook(() => useLivreur(), { wrapper })
    act(() => result.current.addLivreur({ nom: 'B', prenom: 'K', telephone: '' }))
    let tid = ''
    act(() => { tid = result.current.addTournee({ livreurId: result.current.livreurs[0].id, date: '2026-06-18' }) })
    act(() => result.current.addStopToTournee(tid, { id: 'ban-9', label: 'X', ville: 'Y', lat: 0, lng: 0 }))
    expect(result.current.adresses).toHaveLength(1)
    act(() => result.current.removeAdresse('ban-9'))
    expect(result.current.adresses).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test, le voir échouer**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: FAIL (`adresses` / `removeAdresse` n'existent pas).

- [ ] **Step 3: Modifier `src/state/LivreurContext.tsx`**

(a) Importer `SavedAddress` n'est pas nécessaire (on réutilise `Suggestion`). Dans l'interface `LivreurState`, ajouter après `tournees: Tournee[]` :

```ts
  adresses: Suggestion[]
```

et dans la zone des actions (près de `removeTournee`) ajouter :

```ts
  removeAdresse: (id: string) => void
```

(b) Ajouter l'état, près des autres `usePersistentState` :

```ts
  const [adresses, setAdresses] = usePersistentState<Suggestion[]>('adresses', [])
```

(c) Dans `addStopToTournee`, ajouter l'upsert du carnet après le `setTournees(...)` existant, et ajouter `setAdresses` aux deps :

```ts
  const addStopToTournee = useCallback(
    (tourneeId: string, s: Suggestion) => {
      const stop: Stop = { id: makeStopId(), label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }
      setTournees((prev) =>
        prev.map((t) => (t.id === tourneeId ? { ...t, stops: [...t.stops, stop], route: undefined } : t)),
      )
      setAdresses((prev) =>
        prev.some((a) => a.id === s.id)
          ? prev
          : [...prev, { id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }],
      )
    },
    [setTournees, setAdresses],
  )
```

(d) Ajouter l'action :

```ts
  const removeAdresse = useCallback(
    (id: string) => setAdresses((prev) => prev.filter((a) => a.id !== id)),
    [setAdresses],
  )
```

(e) Ajouter `adresses` et `removeAdresse` à l'objet `value` retourné.

- [ ] **Step 4: Lancer toute la suite du contexte**

Run: `npx vitest run src/state/LivreurContext.test.tsx`
Expected: PASS (livreurs + tournées + carnet).

- [ ] **Step 5: Commit**

```bash
git add src/state/LivreurContext.tsx src/state/LivreurContext.test.tsx
git commit -m "feat: carnet d'adresses dans le contexte (auto-mémorisation + removeAdresse)"
```

---

## Task 3: Fusion du carnet dans `AddressAutocomplete`

**Files:**
- Modify: `src/components/AddressAutocomplete.tsx` (remplacement complet)
- Test: `src/components/AddressAutocomplete.test.tsx` (nouveau)

- [ ] **Step 1: Écrire le test (TDD)**

Créer `src/components/AddressAutocomplete.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddressAutocomplete } from './AddressAutocomplete'
import type { Suggestion } from '../types'

const provider = {
  suggest: vi.fn(async () => [] as Suggestion[]),
  geocodeFirst: vi.fn(async () => null),
}
const saved: Suggestion[] = [
  { id: 's1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 },
  { id: 's2', label: '4 Avenue de la Gare', ville: 'Auneau', lat: 48.1, lng: 1.1 },
]

describe('AddressAutocomplete — carnet', () => {
  it('affiche les adresses enregistrées au focus (champ vide)', async () => {
    render(<AddressAutocomplete provider={provider} onPick={() => {}} saved={saved} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('12 Rue des Lilas')).toBeInTheDocument()
    expect(screen.getByText('4 Avenue de la Gare')).toBeInTheDocument()
  })

  it('clic sur une adresse enregistrée appelle onPick', async () => {
    const onPick = vi.fn()
    render(<AddressAutocomplete provider={provider} onPick={onPick} saved={saved} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByText('12 Rue des Lilas'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('clic sur ✕ retire du carnet sans sélectionner', async () => {
    const onPick = vi.fn()
    const onRemoveSaved = vi.fn()
    render(
      <AddressAutocomplete provider={provider} onPick={onPick} saved={saved} onRemoveSaved={onRemoveSaved} />,
    )
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('button', { name: /Retirer 12 Rue des Lilas/ }))
    expect(onRemoveSaved).toHaveBeenCalledWith('s1')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('filtre les adresses enregistrées selon la requête', async () => {
    render(<AddressAutocomplete provider={provider} onPick={() => {}} saved={saved} />)
    await userEvent.type(screen.getByRole('combobox'), 'Lilas')
    expect(screen.getByText('12 Rue des Lilas')).toBeInTheDocument()
    expect(screen.queryByText('4 Avenue de la Gare')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test, le voir échouer**

Run: `npx vitest run src/components/AddressAutocomplete.test.tsx`
Expected: FAIL (props `saved` non gérées / pas d'entrées affichées).

- [ ] **Step 3: Remplacer `src/components/AddressAutocomplete.tsx`**

```tsx
import { useEffect, useId, useState } from 'react'
import type { AddressProvider } from '../services/addressProvider'
import type { Suggestion } from '../types'
import { useAddressAutocomplete } from './useAddressAutocomplete'
import { IcoPin, IcoPlus } from './icons'

interface Props {
  provider: AddressProvider
  onPick: (s: Suggestion) => void
  saved?: Suggestion[]
  onRemoveSaved?: (id: string) => void
}

interface Item {
  s: Suggestion
  saved: boolean
}

export function AddressAutocomplete({ provider, onPick, saved = [], onRemoveSaved }: Props) {
  const { query, setQuery, suggestions, reset } = useAddressAutocomplete(provider)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const q = query.trim().toLowerCase()
  const savedMatches = saved
    .filter((a) => q === '' || a.label.toLowerCase().includes(q) || a.ville.toLowerCase().includes(q))
    .slice(0, 8)
  const savedIds = new Set(savedMatches.map((a) => a.id))
  const items: Item[] = [
    ...savedMatches.map((a) => ({ s: a, saved: true })),
    ...suggestions.filter((s) => !savedIds.has(s.id)).map((s) => ({ s, saved: false })),
  ]

  // remet la sélection en tête quand la requête change
  useEffect(() => {
    setActive(0)
  }, [query])

  function pick(s: Suggestion) {
    onPick(s)
    reset()
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active] ?? items[0]
      if (it) pick(it.s)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <div className="ac">
      <div className="add-row">
        <input
          className="add-input"
          value={query}
          placeholder="Adresse, commune…"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        <button
          className="add-btn"
          title="Ajouter l'arrêt"
          aria-label="Ajouter"
          onClick={() => {
            const it = items[active] ?? items[0]
            if (it) pick(it.s)
          }}
        >
          <IcoPlus />
        </button>
      </div>

      {showList && (
        <ul className="ac-list" id={listId} role="listbox">
          {items.map((it, i) => (
            <li
              key={(it.saved ? 'saved-' : 'ban-') + it.s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={'ac-item' + (i === active ? ' active' : '') + (it.saved ? ' saved' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(it.s)}
            >
              <span className="ac-ico">{it.saved ? '★' : <IcoPin />}</span>
              <span className="ac-text">
                <span className="ac-label">{it.s.label}</span>
                {it.s.ville && <span className="ac-ville">{it.s.ville}</span>}
              </span>
              {it.saved && onRemoveSaved && (
                <button
                  className="ac-remove"
                  aria-label={`Retirer ${it.s.label} du carnet`}
                  title="Retirer du carnet"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveSaved(it.s.id)
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test, le voir passer**

Run: `npx vitest run src/components/AddressAutocomplete.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/AddressAutocomplete.tsx src/components/AddressAutocomplete.test.tsx
git commit -m "feat: carnet fusionné dans l'autocomplétion (★ en tête, ✕ pour retirer)"
```

---

## Task 4: Câblage UI (éditeur + chauffeurs + styles)

**Files:**
- Modify: `src/components/Tournees/TourneeEditor.tsx`
- Modify: `src/components/Chauffeurs/ChauffeurCard.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: `TourneeEditor` — passer le carnet + bouton Imprimer**

Dans `src/components/Tournees/TourneeEditor.tsx` :

(a) Ajouter l'import en haut :
```ts
import { printTourneeSheet } from '../../services/printSheet'
```

(b) Dans la destructuration de `useLivreur()`, ajouter `adresses` et `removeAdresse` :
```ts
  const {
    livreurs,
    tournees,
    provider,
    adresses,
    removeAdresse,
    updateTournee,
    addStopToTournee,
    removeStopFromTournee,
    reorderStops,
    optimizeTournee,
    refreshRoute,
  } = useLivreur()
```

(c) Passer le carnet au champ d'ajout. Remplacer le bloc `<AddressAutocomplete ... />` par :
```tsx
          <AddressAutocomplete
            provider={provider}
            saved={adresses}
            onRemoveSaved={removeAdresse}
            onPick={(s) => {
              pendingRef.current = 'optimize'
              addStopToTournee(tournee.id, s)
            }}
          />
```

(d) Ajouter le bouton « Imprimer » dans `editor-footer`, juste après le bouton « Ré-optimiser » :
```tsx
          <button className="btn-ghost" onClick={() => printTourneeSheet(tournee, livreur)}>
            Imprimer
          </button>
```
(`livreur` est déjà calculé plus haut dans le composant.)

- [ ] **Step 2: `ChauffeurCard` — bouton Imprimer par tournée**

Remplacer le contenu de `src/components/Chauffeurs/ChauffeurCard.tsx` par :

```tsx
import type { Tournee } from '../../types'
import type { LivreurWithColor } from '../../state/LivreurContext'
import { printTourneeSheet } from '../../services/printSheet'

interface Props {
  livreur: LivreurWithColor
  tournees: Tournee[]
}

export function ChauffeurCard({ livreur, tournees }: Props) {
  const stopsTotal = tournees.reduce((n, t) => n + t.stops.length, 0)
  const kmTotal = tournees.reduce((n, t) => n + (t.route?.km ?? 0), 0)
  const minTotal = tournees.reduce((n, t) => n + (t.route?.min ?? 0), 0)

  return (
    <div className="chauffeur-card" style={{ borderLeftColor: livreur.couleur }}>
      <div className="chauffeur-head">
        <span className="dot" style={{ background: livreur.couleur }} />
        <b>{livreur.prenom} {livreur.nom}</b>
        {livreur.telephone && <span className="muted">· {livreur.telephone}</span>}
        <span className="chauffeur-stats">
          {tournees.length
            ? `${stopsTotal} arrêts · ${kmTotal.toFixed(0)} km · ${Math.round(minTotal)} min`
            : "Aucune tournée ce jour"}
        </span>
      </div>
      {tournees.map((t) => (
        <div key={t.id} className="chauffeur-trip">
          <span className="chauffeur-trip-line">
            🏭 {t.stops.map((s, i) => `→ ${i + 1}. ${s.ville || s.label}`).join(' ')} → 🏭
          </span>
          <button className="btn-ghost btn-print" onClick={() => printTourneeSheet(t, livreur)}>
            Imprimer
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Styles dans `src/styles/app.css`**

Ajouter à la fin du fichier :

```css
/* Carnet d'adresses dans l'autocomplétion */
.ac-item.saved .ac-ico { color: #e0a400; }
.ac-remove {
  margin-left: auto; border: 0; background: transparent; cursor: pointer;
  opacity: 0.55; font-size: 13px; padding: 2px 6px;
}
.ac-remove:hover { opacity: 1; }

/* Bouton imprimer dans la section Chauffeurs */
.chauffeur-trip { display: flex; align-items: center; gap: 10px; }
.chauffeur-trip-line { flex: 1; }
.btn-print { padding: 4px 10px; font-size: 13px; }
```

- [ ] **Step 4: Vérifier build + lint + suite complète**

Run: `npx tsc -b --noEmit && npm run lint && npx vitest run`
Expected: tsc 0 erreur, lint clean, tous les tests verts.

- [ ] **Step 5: Commit**

```bash
git add src/components/Tournees/TourneeEditor.tsx src/components/Chauffeurs/ChauffeurCard.tsx src/styles/app.css
git commit -m "feat: bouton Imprimer (éditeur + chauffeurs) + carnet branché sur l'éditeur"
```

---

## Task 5: Vérification finale

- [ ] **Step 1: Suite complète + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 2: Vérification manuelle**

Run: `npm run dev`
- Crée/ouvre une tournée, ajoute 2-3 adresses → vérifie qu'elles réapparaissent ★ en tête au focus du champ pour une nouvelle tournée ; clique‑en une (ajout instantané) ; retire‑en une via ✕.
- Clique « Imprimer » dans l'éditeur → la feuille s'ouvre dans une fenêtre et la boîte d'impression apparaît (vérifie l'ordre des arrêts, départ/retour Letourville, total).
- Section Chauffeurs → « Imprimer » sur une tournée → même feuille.

- [ ] **Step 3 (optionnel) : mettre à jour le README**

Mentionner l'impression de feuille de tournée et le carnet d'adresses dans `README.md`.

```bash
git add README.md
git commit -m "docs: README — impression de tournée + carnet d'adresses"
```

---

## Self-Review (effectuée à la rédaction)

- **Couverture spec :** carnet auto‑mémorisé + dédup (Task 2) ; réutilisation ★ en tête / BAN ensuite / ✕ pour retirer (Task 3) ; `buildSheetHtml` + `printTourneeSheet` texte seul, départ/retour entrepôt, total, échappement (Task 1) ; boutons Imprimer éditeur + chauffeurs (Task 4) ; tests à chaque tâche. ✔
- **Pas de placeholder** : tout le code est fourni.
- **Cohérence des types/signatures** : `adresses: Suggestion[]`, `removeAdresse(id)`, `buildSheetHtml(tournee, livreur)`, `printTourneeSheet(tournee, livreur)`, props `saved?/onRemoveSaved?` — identiques entre définition et usages.
- **Hors périmètre** respecté : pas de libellé perso, pas de section dédiée, pas d'impression de carte.
