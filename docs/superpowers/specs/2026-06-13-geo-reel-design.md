# Livreur — Passage au géo réel (autocomplétion BAN + carte Leaflet) · Design

## Objectif

Deux évolutions, qui remplacent les stubs « à industrialiser » du prototype :

1. **Autocomplétion d'adresses** : à la frappe dans le champ « Adresse… », afficher une liste de
   propositions d'adresses réelles (façon capture Google Maps), et n'ajouter qu'une adresse
   **vérifiée** (avec ses vraies coordonnées).
2. **Vrai fond de carte de France** (Paris SO) à la place du SVG schématique, sur les deux écrans.

Décisions validées :
- **Géocodage** : API Adresse (BAN) — `api-adresse.data.gouv.fr`, gratuite, sans clé, CORS OK.
- **Carte** : `leaflet` + `react-leaflet` v5, tuiles **CARTO Positron** (clair) / **dark_matter** (sombre), sans clé, suivant `data-theme`.
- **Périmètre** : remplacement complet — répartiteur ET mini-carte chauffeur sur vraie carte ; tournées, zones, marqueurs numérotés, pulse, survol, tracé progressif redessinés en overlay géo.

## Modèle de données (changement de coordonnées)

`x/y` (viewBox 960×720) → **`lat/lng`** réels.

```ts
type DriverId = 'karim' | 'lea' | 'sofiane'
interface LatLng { lat: number; lng: number }
interface Stop {
  id: string
  driver: DriverId | null
  order?: number
  label: string     // adresse complète (libellé BAN)
  ville: string     // commune
  lat: number
  lng: number
}
interface Suggestion { id: string; label: string; ville: string; lat: number; lng: number }
```

- `Point { x, y }` est **supprimé**. `GeocodeResult` remplacé par `Suggestion`.
- `Driver.center` : `{ x, y }` → `LatLng`.
- `DEPOT` → `LatLng` réel.
- `communes.ts` + `matchCommune` : **supprimés** (remplacés par le géocodage réel).
- `geometry.ts` (pathD/bbox/pathLen en x/y) : **supprimé**, remplacé par `geo.ts` (haversine + longueur de tournée géo). Leaflet gère le path SVG et le fitBounds.

### Coordonnées figées (géocodées via BAN une fois)

Dépôt : `{ lat: 48.816035, lng: 2.289012 }` (Malakoff).

Seed (commune, label, lat, lng) :

| id | driver | ville | lat | lng |
|----|--------|-------|-----|-----|
| s1 | karim | Malakoff | 48.814703 | 2.294854 |
| s2 | karim | Vanves | 48.820557 | 2.291491 |
| s3 | karim | Issy-les-Moulineaux | 48.821940 | 2.265116 |
| s4 | karim | Boulogne-Billancourt | 48.839632 | 2.247459 |
| s5 | lea | Montrouge | 48.815441 | 2.317755 |
| s6 | lea | Bagneux | 48.796757 | 2.321793 |
| s7 | lea | Châtillon | 48.803007 | 2.287960 |
| s8 | lea | Clamart | 48.803737 | 2.265857 |
| s9 | sofiane | Fontenay-aux-Roses | 48.792718 | 2.286172 |
| s10 | sofiane | Le Plessis-Robinson | 48.778385 | 2.259606 |
| s11 | sofiane | Châtenay-Malabry | 48.761921 | 2.287846 |
| s12 | sofiane | Sceaux | 48.778528 | 2.288238 |

Les `label` reprennent l'adresse d'origine (ex. « 12 rue Paul Vaillant-Couturier »).

Centroïdes de zone (moyenne des arrêts seed du chauffeur) :
- Karim : `{ lat: 48.8242, lng: 2.2747 }`
- Léa : `{ lat: 48.8047, lng: 2.2984 }`
- Sofiane : `{ lat: 48.7779, lng: 2.2804 }`

### Migration localStorage

Préfixe versionné **`livreur:v2:`** (au lieu de `livreur:`). Les anciennes données en `x/y` ne sont
pas lues → retour au seed. `usePersistentState` prend le préfixe versionné.

## Couche service — géocodage

```ts
// services/addressProvider.ts
export interface AddressProvider {
  suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]>
  geocodeFirst(query: string): Promise<Suggestion | null>
}
export class BanProvider implements AddressProvider { /* fetch BAN */ }
```

- `suggest` : `GET https://api-adresse.data.gouv.fr/search/?q=<q>&limit=5&autocomplete=1`
  → map des `features` GeoJSON vers `Suggestion` (`properties.label`, `properties.city`,
  `geometry.coordinates = [lng, lat]`). Ignore si `q.trim().length < 3`. `signal` pour annuler.
- `geocodeFirst` : même endpoint `limit=1`, renvoie la 1re `Suggestion` ou `null` (utilisé par
  « Coller une liste »).
- Erreurs réseau : `suggest` renvoie `[]` (pas de crash), `geocodeFirst` renvoie `null`.
- Testé avec `fetch` mocké (parsing features, seuil 3 caractères, gestion réseau KO).

## Autocomplétion (UI)

Hook `useAddressAutocomplete(provider)` :
- état `{ query, setQuery, suggestions, loading, activeIndex, ... }`.
- debounce **250 ms** ; annule la requête précédente (`AbortController`) ; n'interroge qu'à ≥ 3 caractères.
- Testé avec faux timers + fetch mocké.

`AddressAutocomplete` (combobox) intégré dans `StopsPanel` :
- champ `.add-input` + dropdown `.ac-list` (position absolue sous le champ).
- chaque item `.ac-item` : icône 📍 (SVG `IcoPin`), **adresse en gras** + commune en gris.
- clavier : ↑/↓ déplace `activeIndex`, **Entrée** valide la suggestion active (ou la 1re), **Échap** ferme, clic = valide.
- ARIA combobox (`role=combobox/listbox/option`, `aria-activedescendant`).
- sélection → `onPick(suggestion)` → `addStop(suggestion)` (déjà lat/lng, **aucun re-géocodage**).
- styles ajoutés dans `app.css` (mêmes tokens : `--surface`, `--border`, etc., flat, sans ombre).

`StopsPanel` :
- remplace l'`<input>` simple par `<AddressAutocomplete onPick=… />`.
- « Coller une liste » : chaque ligne → `provider.geocodeFirst` (en parallèle) ; ignore les lignes non résolues.

## État applicatif

`LivreurContext` :
- `addStop(s: Suggestion)` : ajoute `{ id, driver: null, label, ville, lat, lng }` (plus de Promise/géocodage — la suggestion est déjà résolue).
- `addBulk(text)` : `await Promise.all(lines.map(geocodeFirst))`, filtre les `null`.
- `provider` (BanProvider) instancié une fois ; injectable pour les tests.
- reste inchangé (routes dérivées via `useMemo`, persistance v2, progress, thème, survol).

## Optimiseur (distances réelles)

`services/geo.ts` :
```ts
export function haversine(a: LatLng, b: LatLng): number  // km
export function routeLengthKm(pts: LatLng[]): number      // somme des segments
```
`StubOptimizer` (renommé conceptuellement « heuristique ») :
- `nearestDriver` et `cheapestInsert` utilisent `haversine`.
- `km = routeLengthKm([DEPOT, ...arrêts]).toFixed(1)` (vraie distance, plus de facteur 0.0294).
- `min = round(km × 2.3 + n × 4)` (heuristique de durée conservée).
- interface `RouteOptimizer` inchangée. Tests adaptés aux lat/lng.

## Carte (Leaflet + CARTO), partout

Dépendances : `leaflet`, `react-leaflet@^5`, `@types/leaflet`. CSS Leaflet importé dans `main.tsx`.

Tuiles selon thème :
- clair : `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- sombre : `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- attribution CARTO + OSM.

Composants `components/map/` (réécrits) :
- `BaseMap.tsx` : `MapContainer` react-leaflet, `TileLayer` thème-aware (clé sur l'URL pour re-mount au changement de thème), `ZoomControl` discret, `scrollWheelZoom` activé. Hook `useFitBounds(points)` (fit + padding) et `invalidateSize` au montage/redimensionnement.
- `pins.ts` : `numberedIcon(color, n)`, `depotIcon()`, `currentPinIcon(color, n)` (pulse CSS) → `L.divIcon` avec classes `.map-pin`, `.map-pin-depot`, `.map-pin.pulse`. Styles dans `app.css`.
- `RouteLayer.tsx` : pour un chauffeur — `Polyline` bande de zone (poids ~22, opacité .12) + `Polyline` tournée (poids 4, couleur) ; **tracé progressif** via `useDrawAnimation(ref, reduceMotion)` qui pose `stroke-dasharray=len` puis transitionne `dashoffset` → 0 sur le `<path>` (`layer.getElement()`), délai `index×0.4s` ; opacité réduite si `highlighted && ≠ d.id`.
- `DispatcherMap.tsx` : `BaseMap` + dépôt + (avant répartition) marqueurs gris des arrêts + (après) `RouteLayer` par chauffeur avec marqueurs numérotés colorés ; `onHover` (mouseover/out des layers) → `setHighlighted`. Légende et badge restent en overlay HTML (inchangés).
- `PhoneMap.tsx` : `BaseMap` (sans zoom molette, non interactif/`dragging` léger) fit sur la tournée ; polyligne + marqueurs ; **arrêt en cours** = `currentPinIcon` qui pulse ; livrés en gris.

Le décor schématique (grille, Seine, axes, `MapDecor`, `DepotMarker` SVG) est **supprimé**.
Le style flat « console » est préservé par les tuiles grises CARTO + l'UI/bordures inchangées.

## Sizing / thème

- `.map-shell` et `.phone-map` gardent leurs dimensions ; Leaflet a besoin d'une hauteur explicite (déjà le cas). `invalidateSize()` appelé sur changement d'écran/thème et au resize.
- Changement de thème : la `TileLayer` change d'URL (re-mount via `key={theme}`).

## Tests

- `geo.ts` : `haversine` (distances connues approx), `routeLengthKm`.
- `BanProvider` : `fetch` mocké — parsing features → Suggestion ; seuil < 3 car. → `[]` ; réseau KO → `[]` / `null`.
- `useAddressAutocomplete` : faux timers — debounce, annulation, sélection clavier.
- `StubOptimizer` : ordre seed conservé, nearestDriver/cheapestInsert en lat/lng, km/min cohérents.
- `LivreurContext` : `addStop(suggestion)` ajoute l'arrêt ; `removeStop` ; advance borné.
- `StopsPanel` / `AddressAutocomplete` : rendu de la liste depuis un provider mocké, sélection via clic/clavier appelle `onPick`.
- Composants Leaflet : **non rendus en jsdom** (Leaflet exige un vrai layout) ; on teste les fonctions pures (`pins`, transforms) et la logique, pas le rendu tuiles. `react-leaflet` mocké dans les tests de composants conteneurs si nécessaire.

## Hors périmètre (YAGNI)

- Itinéraire routier réel (turn-by-turn) — la tournée reste une polyligne reliant les arrêts dans l'ordre optimisé. (Possible évolution : OSRM/ORS.)
- Vrai service d'optimisation de tournées (l'heuristique zone + insertion est conservée, désormais en distances réelles).
- Recherche hors France (la BAN est FR ; suffisant ici).
