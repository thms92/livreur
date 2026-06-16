# Refonte from scratch — Livreurs · Tournées · Chauffeurs · Design

## Objectif

Repenser le design et l'UX de l'application **from scratch** autour de trois sections, pour un
usage **gestionnaire uniquement** (pas de vue terrain livreur) :

1. **Livreurs** — lister et ajouter des livreurs (Nom, Prénom, Téléphone).
2. **Tournées** — créer / modifier / supprimer une tournée : un livreur, une date, et un nombre
   illimité d'arrêts saisis par autocomplétion d'adresse. Départ **et** arrivée = l'entrepôt.
3. **Chauffeurs** — vue d'ensemble pour identifier rapidement les tournées de chaque chauffeur.

On conserve la stack (React 19 + Vite + TS + Leaflet) et on réutilise les briques saines de
l'existant, mais on remplace le modèle « répartiteur » (pool d'arrêts affectés à des chauffeurs)
par un modèle **tournée = entité à part entière**.

## Contexte / point de départ

- App React+Vite+TS existante : modèle Dispatcher (pool d'arrêts → affectation) + une « Vue
  chauffeur » mobile, 3 chauffeurs codés/seedés (Karim/Léa/Sofiane), dépôt à Paris.
- Briques réutilisables : autocomplétion BAN (`AddressAutocomplete`, `useAddressAutocomplete`,
  `services/addressProvider`), palette `--c-1..8` (`data/palette.ts`, `styles/tokens.css`), hook
  `state/usePersistentState`, carte Leaflet (`components/map/BaseMap`, `RouteLayer`, fix attribution
  sans drapeau déjà en place), fallback distance `services/geo.ts` (haversine), `services/stopId`.

## Décisions clés (validées)

- **Modèle** : une tournée est une entité autonome `{ livreur, date, arrêts }`. Un livreur peut
  avoir plusieurs tournées (typiquement une par date).
- **Routage** : distances/temps **routiers réels** via OSRM, ordre des arrêts **optimisé
  automatiquement** (boucle depuis l'entrepôt et retour), **réordonnable à la main**.
- **Public** : **gestionnaire uniquement**. Pas de vue mobile livreur (l'ancienne « Vue chauffeur »
  est supprimée).
- **Stockage** : `localStorage` du navigateur (aucun backend).
- **Coût** : **zéro**. OSRM = serveur public gratuit `router.project-osrm.org` ; fallback haversine
  gratuit hors-ligne. Pas de dépendance payante.
- **Démarrage à vide** : plus de données de démo (Karim/Léa/Sofiane, arrêts seed, dépôt Paris).
- **Réordonnancement manuel** : **glisser-déposer « fait main »** (drag & drop HTML5 natif, zéro
  librairie ajoutée).
- **Navigation** : **barre latérale gauche** fixe, 3 vues `Livreurs | Tournées | Chauffeurs`.

## Constante dépôt

Fixe, jamais modifiable. Départ et arrivée de **toute** tournée. Géocodé une fois via la BAN :

```
DEPOT = {
  label: "Letourville",
  ville: "Boisville-la-Saint-Père",
  codePostal: "28150",
  lat: 48.312002,
  lng: 1.718473,
}
```

## Modèle de données (localStorage, préfixe `livreur:v3:`)

```ts
interface Livreur {
  id: string
  nom: string
  prenom: string
  telephone: string        // format FR, optionnel mais validé si saisi
  colorIndex: number       // → couleur dérivée var(--c-(colorIndex % 8 + 1))
}

interface Stop {
  id: string
  label: string            // ex. "12 Rue des Lilas"
  ville: string            // ex. "Boisville-la-Saint-Père"
  lat: number
  lng: number
}

interface RouteResult {
  km: number
  min: number
  geometry: [number, number][]   // polyligne (lat,lng) pour la carte
  optimized: boolean             // true si l'ordre vient d'OSRM /trip
  approximate: boolean           // true si calcul de repli haversine (OSRM injoignable)
}

interface Tournee {
  id: string
  livreurId: string
  date: string             // "YYYY-MM-DD"
  stops: Stop[]            // ordre = ordre de visite des clients (hors dépôt)
  route?: RouteResult      // résultat mis en cache, recalculé si stops change
}
```

Le dépôt **n'est pas** stocké dans `stops` : il est injecté en départ + arrivée au moment du
calcul d'itinéraire et de l'affichage carte.

Clés persistées : `livreur:v3:livreurs`, `livreur:v3:tournees`, `livreur:v3:theme`.

## État & actions (LivreurContext)

État : `livreurs: Livreur[]`, `tournees: Tournee[]`, `theme`, navigation `section`. Actions :

- **Livreurs** : `addLivreur({nom, prenom, telephone})` (couleur = plus petit `colorIndex` libre,
  modulo 8) · `updateLivreur(id, patch)` · `removeLivreur(id)` (cascade : supprime aussi ses
  tournées, après confirmation côté UI).
- **Tournées** : `addTournee({livreurId, date})` · `updateTournee(id, patch)` · `removeTournee(id)`.
- **Arrêts d'une tournée** : `addStop(tourneeId, stop)` · `removeStop(tourneeId, stopId)` ·
  `reorderStops(tourneeId, fromIndex, toIndex)` (drag manuel) · `optimizeTournee(tourneeId)`
  (réordonne via OSRM `/trip`). Tout changement de `stops` invalide/recalcule `route`.

Les actions de calcul d'itinéraire sont **asynchrones** (appel réseau OSRM) ; l'UI affiche un état
« calcul en cours » et conserve l'ancien résultat en attendant.

## Service de routage — `services/routing.ts`

- `optimizeTrip(stops): Promise<{ order: number[], route: RouteResult }>` — appelle OSRM
  **`/trip`** avec `[DEPOT, ...stops]`, options `source=first&destination=last&roundtrip=true`,
  `geometries=geojson`, `overview=full`. Retourne l'ordre optimisé des arrêts + distance/durée/tracé.
- `computeRoute(stops): Promise<RouteResult>` — appelle OSRM **`/route`** sur l'ordre **donné**
  (sans réoptimiser), pour le cas « ordre fixé manuellement ». Boucle `[DEPOT, ...stops, DEPOT]`.
- **Fallback** : si `fetch` échoue ou OSRM renvoie une erreur, calcule km/min à vol d'oiseau
  (haversine via `geo.ts`) et `geometry` = segments droits ; `approximate = true`. L'UI affiche un
  bandeau « distances approximatives (hors ligne) ».
- Résultat mis en cache dans `tournee.route` ; recalcul uniquement quand `stops` change.

## UI

### Coquille / navigation
Barre latérale gauche fixe : marque « Livreur » + 3 entrées `Livreurs | Tournées | Chauffeurs`
(l'active est mise en évidence). Bouton thème clair/sombre conservé. Contenu de la section à droite.

### Section Livreurs (`components/Livreurs/`)
- Formulaire d'ajout : champs **Nom**, **Prénom**, **Téléphone** + bouton **Enregistrer**.
  Validation : nom et prénom requis ; téléphone optionnel, validé (format FR) s'il est renseigné.
- Liste des livreurs : pastille couleur (palette), nom complet, téléphone, nombre de tournées.
  Actions par ligne : **modifier** (édition inline ou formulaire), **supprimer** (confirmation
  listant ses tournées → suppression en cascade).

### Section Tournées (`components/Tournees/`)
- **Liste** des tournées triées par date décroissante (livreur, date, nb arrêts, km/min) + bouton
  **« Nouvelle tournée »**. Chaque ligne : **modifier**, **supprimer**.
- **Création / édition** :
  - Sélecteur **Livreur** (parmi les livreurs existants) + **Date**.
  - Champ **« Ajouter un arrêt »** avec **autocomplétion BAN** : on tape, on clique la bonne
    suggestion → l'arrêt s'ajoute. **Sans limite** d'arrêts.
  - Liste d'arrêts : **🏭 Départ** et **🏭 Retour** verrouillés (entrepôt) en tête et pied ;
    arrêts clients numérotés au milieu. Ordre **optimisé automatiquement** (OSRM) à chaque
    ajout/suppression ; **réordonnable à la main** par **glisser-déposer natif** (poignée `⋮⋮`) ;
    bouton **« Ré-optimiser »** pour revenir à l'ordre optimal ; `✕` pour retirer un arrêt.
  - **Total km + temps** réels affichés ; bouton **Enregistrer la tournée**.
  - **Carte** (Leaflet) : boucle 🏭 → arrêts → 🏭, tracé routier réel, à la couleur du livreur.

### Section Chauffeurs (`components/Chauffeurs/`)
- Filtre par **date** en haut.
- Une **carte colorée par chauffeur** (couleur unique) : nom, téléphone, total arrêts/km/temps,
  aperçu de l'enchaînement 🏭 → arrêts → 🏭. Clic → détail de la tournée. Chauffeur sans tournée
  ce jour = mention discrète.
- **Carte commune** en bas : toutes les boucles du jour superposées, une couleur par chauffeur.

## Découpage des fichiers

- `data/depot.ts` — constante `DEPOT`.
- `data/palette.ts`, `styles/tokens.css` — **réutilisés** (couleurs `--c-1..8`).
- `state/LivreurContext.tsx` — réécrit (livreurs + tournées + actions ci-dessus).
- `state/usePersistentState.ts`, `services/addressProvider.ts`, `services/geo.ts`,
  `services/stopId.ts` — **réutilisés**.
- `services/routing.ts` — **nouveau** (OSRM `/trip` + `/route` + fallback haversine).
- `components/layout/Sidebar.tsx` — **nouveau**.
- `components/Livreurs/*`, `components/Tournees/*`, `components/Chauffeurs/*` — **nouveaux**.
- `components/AddressAutocomplete` (+ hook) — **déplacé/réutilisé** depuis `Dispatcher/`.
- `components/map/BaseMap.tsx`, `RouteLayer.tsx`, `pins.ts` — **réutilisés/adaptés** (tracé OSRM).

## Suppressions

- `components/Dispatcher/*`, `components/DriverView/*`, `components/map/DispatcherMap.tsx`,
  `components/map/PhoneMap.tsx`.
- `services/routeOptimizer.ts` (remplacé par `routing.ts`), `data/seed.ts`, `data/drivers.ts`
  (dépôt Paris + `DEFAULT_DRIVERS`), écran segmenté Répartiteur/Vue chauffeur dans `App`.
- Anciennes clés `localStorage` `livreur:v2:*` (ignorées ; nouveau préfixe `v3`).

## Tests

- `services/routing.ts` : construction de l'URL OSRM `/trip` et `/route`, parsing
  ordre/km/min/geometry, **fallback haversine** quand `fetch` échoue (fetch mocké).
- `LivreurContext` : CRUD livreurs (couleur auto = plus petit index libre, suppression cascade des
  tournées), CRUD tournées, `addStop`/`removeStop`/`reorderStops`, `optimizeTournee`.
- Composants : ajout livreur (validation form), autocomplétion + ajout d'arrêt, réordonnancement
  par glisser-déposer, section Chauffeurs filtrée par date, dépôt verrouillé en départ/arrivée.
- Smoke `App` : créer un livreur → créer une tournée avec 2 arrêts → la retrouver dans la section
  Chauffeurs à la bonne date, avec sa boucle.

## Hors périmètre (YAGNI)

- Backend / synchronisation multi-appareils (localStorage seulement).
- Vue mobile livreur / navigation GPS terrain.
- Hébergement d'un OSRM privé, comptes utilisateurs, authentification.
- Fenêtres horaires, capacités véhicule, contraintes au-delà de l'optimisation de boucle simple.
- Choix manuel de la couleur d'un livreur (auto depuis la palette ; > 8 livreurs → cycle).
