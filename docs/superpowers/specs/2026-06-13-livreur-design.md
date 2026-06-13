# Livreur — Console d'exploitation logistique · Design

## Objectif métier

Outil interne pour répartir des arrêts de livraison entre 3 chauffeurs, avec **une
seule tournée continue, ordonnée et optimisée par chauffeur, sans limite d'arrêts**
(pour contourner la limite de 9 arrêts de Google Maps). Google Maps n'est ouvert que
pour le trajet vers **l'arrêt en cours**, jamais pour une liste de stops.

Deux écrans basculables par un segmented control :
1. **Console Répartiteur** (desktop) — carte de tous les arrêts + saisie d'adresses + répartition.
2. **Vue chauffeur** (terrain, façon téléphone) — la tournée d'un chauffeur, arrêt par arrêt.

UI 100 % en français, mode clair **et** sombre, responsive jusqu'au mobile. Style « console
d'exploitation » **flat** : surfaces blanches, fines bordures, **aucune ombre ni dégradé**.

## Contexte / point de départ

- Dossier de référence (maquette hifi HTML/React via Babel) : `/Users/thxms/Downloads/design_handoff_livreur/`.
- Cible : `/Users/thxms/Desktop/LIVREUR`, **vide** → pas de codebase ni de librairie de
  composants existante. On scaffolde un nouveau projet.

## Décisions (validées)

| Sujet | Décision |
|---|---|
| Stack | **React 18 + Vite + TypeScript (strict)** |
| Styling | **CSS global + tokens** : `styles.css` porté quasi verbatim, classes conservées |
| Stubs à industrialiser | **Isolés derrière des interfaces typées** (Geocoder, RouteOptimizer, fond de carte) — implémentations stub conservées |
| État | **Context + hook + persistance localStorage** sous préfixe `livreur:` |

## Fidélité

Haute fidélité (pixel-perfect). Couleurs, typo, espacements, états et interactions sont
définitifs et reproduits à l'identique. Toutes les classes CSS et la structure SVG
(viewBox `0 0 960 720`) sont conservées pour garantir un rendu identique.

## Stack & fondations

- React 18 + Vite + TypeScript strict.
- **CSS global** porté de `styles.css`, scindé en :
  - `src/styles/tokens.css` — `:root` (clair) + `[data-theme="dark"]`. **Corrige** le doublon
    `--text-3` du proto (la dernière déclaration `#6a6a66` gagne — comportement conservé).
  - `src/styles/app.css` — toutes les classes (layout, cartes, carte SVG, téléphone, responsive).
- Polices **IBM Plex Sans** (400/500/600) + **IBM Plex Mono** (400/500/600) via Google Fonts
  dans `index.html` (preconnect conservé).
- `data-theme` posé sur `<html>` ; breakpoints responsive 880px / 560px conservés ;
  `prefers-reduced-motion` neutralise les animations.

## Arborescence

```
src/
  main.tsx                      # ReactDOM root, monte <App/> dans #root
  App.tsx                       # topbar, segmented control, thème, routing écran
  styles/{tokens.css, app.css}
  types.ts                      # Stop, Driver, RouteResult, Routes, GeocodeResult, ScreenId, Theme, DriverId
  data/
    drivers.ts                  # DRIVERS (id, nom, couleur var, couleurHex, center), DEPOT
    communes.ts                 # COMMUNES : table commune -> {x,y} (donnée du stub géocodeur)
    seed.ts                     # SEED_STOPS (12 arrêts d'exemple, ordre curaté)
  services/
    geometry.ts                 # dist, pathLen, pathD, bbox (espace viewBox)
    geocoder.ts                 # interface Geocoder + StubGeocoder (match COMMUNES + jitter)
    routeOptimizer.ts           # interface RouteOptimizer + StubOptimizer (nearestDriver + cheapestInsert + stats)
  state/
    usePersistentState.ts       # hook localStorage générique, préfixe 'livreur:'
    LivreurContext.tsx          # Provider + hook useLivreur() : tout l'état + actions dérivées
  components/
    icons/index.tsx             # tous les SVG inline en composants typés
    Dispatcher/
      Dispatcher.tsx            # layout 2 colonnes (carte + sidebar)
      DriverCard.tsx            # carte chauffeur (stats, bouton voir la tournée)
      StopsPanel.tsx            # saisie d'adresses + liste des arrêts
    DriverView/
      DriverView.tsx            # écran téléphone
      DriverPills.tsx           # sélecteur de chauffeur
      CurrentStop.tsx           # carte « arrêt en cours » + actions Maps/suivant
      StopList.tsx              # liste ordonnée des arrêts
    map/
      DispatcherMap.tsx         # carte répartiteur plein cadre
      PhoneMap.tsx              # mini-carte tournée (auto-zoom bbox)
      MapDecor.tsx              # grille + Seine + axes
      DepotMarker.tsx           # marqueur dépôt (losange)
```

## Mapping composant → écran

| Écran | Composants | Fichier proto d'origine |
|---|---|---|
| Console Répartiteur | `Dispatcher` → `DispatcherMap` + `StopsPanel` + `DriverCard[]` | `Dispatcher.jsx`, `MapCanvas.jsx` |
| Vue chauffeur | `DriverView` → `DriverPills` + `PhoneMap` + `CurrentStop` + `StopList` | `DriverView.jsx`, `MapCanvas.jsx` |
| Shell (topbar/segmented/thème) | `App` | `App.jsx` |
| Données & moteur | `data/*`, `services/*` | `data.jsx` |

## Couche services (seam d'industrialisation)

```ts
// geocoder.ts
export interface GeocodeResult { ville: string; adresse: string; x: number; y: number }
export interface Geocoder { geocode(query: string): Promise<GeocodeResult | null> }
// StubGeocoder : reproduit makeStop() — coupe sur la dernière virgule (adresse, commune),
// match COMMUNES (normalisé sans accents), place x/y + jitter ±13 ; sinon zone centrale + "À situer".
// Asynchrone (Promise) dès maintenant pour qu'un vrai géocodage (api-adresse.data.gouv.fr)
// se branche sans changer les appelants.

// routeOptimizer.ts
export interface RouteResult { stops: Stop[]; km: string; min: string }
export type Routes = Record<DriverId, RouteResult>
export interface RouteOptimizer { dispatch(stops: Stop[], drivers: Driver[]): Routes }
// StubOptimizer : reproduit dispatchStops() —
//   1. arrêts seed (driver défini) gardent leur ordre curaté (tri par `order`) ;
//   2. arrêts ajoutés (driver null) -> nearestDriver (centroïde le plus proche) puis
//      cheapestInsert (insertion au moindre coût) ;
//   3. stats : km = pathLen([DEPOT, ...arrêts]) * 0.0294 ; min = round(km*2.3 + n*4).
```

Le **fond de carte** reste le SVG schématique (`map/`), isolé pour qu'une vraie carte
(Leaflet/MapLibre) puisse le remplacer plus tard sans toucher au reste.

> En production : remplacer StubGeocoder par un vrai géocodage, StubOptimizer par le service
> réel d'optimisation de tournées, et le SVG schématique par la vraie carte.

## État applicatif

`LivreurContext` expose, via `useLivreur()` :

| État | Type | Rôle |
|---|---|---|
| `theme` | `'light' \| 'dark'` | thème, appliqué via `data-theme` sur `<html>` |
| `screen` | `'dispatch' \| 'driver'` | écran actif |
| `dispatched` | `boolean` | répartition effectuée |
| `selected` | `DriverId` | chauffeur affiché en Vue chauffeur |
| `highlighted` | `DriverId \| null` | survol carte (non persisté) |
| `progress` | `Record<DriverId, number>` | index de l'arrêt courant par chauffeur |
| `stops` | `Stop[]` | **source de vérité** des arrêts |

Dérivés (non stockés) :
- `routes = useMemo(() => optimizer.dispatch(stops, DRIVERS), [stops])`
- `assign: Record<stopId, couleur>` dérivé de `routes`

Actions : `addStop(line)`, `addBulk(text)`, `removeStop(id)`, `setDispatched`, `openDriver(id)`,
`advance(id)` (borné à n), `resetTour(id)`, `goDriver()` (répartition implicite si besoin),
`toggleTheme`, `setScreen`, `setSelected`, `setHighlighted`.

Tout sauf `highlighted` est persisté sous `livreur:<clé>` (le travail survit au rechargement).
`addStop`/`addBulk` sont asynchrones (await geocoder) ; les arrêts sont ajoutés à `stops`
à la résolution.

## Modèle de données

```ts
type DriverId = 'karim' | 'lea' | 'sofiane'
interface Stop { id: string; driver: DriverId | null; order?: number; ville: string; adresse: string; x: number; y: number }
interface Driver { id: DriverId; nom: string; couleur: string; couleurHex: string; center: { x: number; y: number } }
```

- `DEPOT` `{ x:480, y:116 }`. `DRIVERS` : Karim (bleu `--c-karim`), Léa (ambre `--c-lea`),
  Sofiane (vert `--c-sofiane`) — 1 couleur = 1 chauffeur, partout (point, ligne, pastille, bordure).
- `COMMUNES` : 12 communes de tournée + voisines.
- `SEED_STOPS` : 12 arrêts d'exemple avec affectation curatée + `order`.

## Comportements à conserver (exactement)

- **Tracé progressif** des tournées : `stroke-dasharray=len`, `stroke-dashoffset` animé,
  `transitionDelay = di * 0.4s` par chauffeur (0 si reduce-motion).
- **Recalcul en direct** des tournées/stats à l'ajout/suppression d'arrêt.
- **Survol** d'une carte/zone chauffeur → sa tournée s'isole (les autres s'estompent, opacité réduite).
- **« Répartir par zone »** → `dispatched=true` ; bouton devient « Modifier les arrêts ».
- **Vue chauffeur** : pills de sélection, mini-carte auto-zoomée (bbox + pad 56), arrêt en cours
  qui **pulse** (`<animate>` 1.8s), livrés en gris ; « Arrêt livré, suivant » incrémente
  `progress` (borné) ; « Ouvrir dans Maps » ouvre
  `https://www.google.com/maps/search/?api=1&query=<adresse, commune>` en nouvel onglet ;
  états **tournée terminée** (félicitation + recommencer) et **aucun arrêt**.
- **Persistance** de la progression et de tout l'état sous `livreur:`.

## Tests

- **Services purs** (vitest) : `StubOptimizer` (ordre curaté conservé, nearestDriver, cheapestInsert,
  formules km/min), `StubGeocoder` (coupe virgule, match commune normalisé, fallback « À situer »),
  `geometry` (dist/pathLen/bbox).
- **Composants** (React Testing Library) : flux répartition (statut/cartes apparaissent),
  ajout/suppression recalcule, advance borne la progression, terminé → recommencer.
- Vérification manuelle du rendu pixel-perfect clair/sombre + responsive.

## Hors périmètre (YAGNI)

- Vrai géocodage / vrai service d'optimisation / vraie carte (seams prêts, pas branchés).
- Backend, authentification, multi-tournées par jour, > 3 chauffeurs configurables.
