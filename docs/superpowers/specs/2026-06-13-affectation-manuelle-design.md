# Chauffeurs dynamiques + affectation manuelle des arrêts · Design

## Objectif

1. **Chauffeurs dynamiques** : pouvoir **ajouter / renommer / supprimer** des chauffeurs (noms
   libres, ex. « Michel »), au lieu des 3 chauffeurs codés en dur.
2. **Affectation manuelle** : choisir explicitement quel chauffeur fait quelle tournée en
   **affectant les arrêts à la main** (« je sélectionne un chauffeur, puis je clique ses arrêts »),
   tout en gardant la **répartition automatique par zone** comme point de départ corrigeable.
3. **Fix** : retirer le « drapeau ukrainien » 🇺🇦 du préfixe d'attribution Leaflet (coin bas-droite),
   en conservant le crédit OpenStreetMap/CARTO.

## Contexte / point de départ

- App React+Vite+TS existante. Chauffeurs codés en dur : `DriverId = 'karim'|'lea'|'sofiane'`
  (union utilisée partout : `Routes = Record<DriverId,…>`, `progress`, etc.), `DRIVERS` const,
  `Driver.center: LatLng` (centroïde de zone pour l'heuristique).
- `Stop.driver: DriverId | null` existe déjà ; les arrêts sans chauffeur sont aujourd'hui
  auto-affectés (zone la plus proche) dans le calcul dérivé `routes`.
- Carte Leaflet (react-leaflet), tuiles CARTO, `BaseMap` avec `attributionControl`.

## 1. Chauffeurs dynamiques

### Modèle
- `DriverId` devient **`string`** (id généré, ex. `makeStopId`-like).
- `Driver = { id: string; nom: string; colorIndex: number }`. La **couleur** est dérivée :
  `couleur = var(--c-${(colorIndex % 8) + 1})`. Le contexte expose les chauffeurs avec `couleur`
  déjà calculée (`{ id, nom, colorIndex, couleur }`) pour que les composants lisent `d.couleur`
  comme avant.
- **Suppression** de `Driver.center` et `Driver.couleurHex` (la couleur vient de la palette ; le
  centre de zone est désormais calculé dynamiquement, voir §2).
- État `drivers: Driver[]` dans `LivreurContext`, **persisté** `livreur:v2:drivers`. Défaut :
  Karim (colorIndex 0), Léa (1), Sofiane (2) — mêmes ids `karim/lea/sofiane` pour rester
  compatibles avec les `SEED_STOPS` (dont `driver` vaut ces ids).

### Palette (tokens.css)
8 couleurs en CSS vars, variantes clair/sombre, pour garder la signature « 1 couleur = 1
chauffeur » **et** l'adaptation au thème :

```
--c-1 = bleu (= valeur actuelle Karim)      --c-5 = sarcelle (hue ~200)
--c-2 = ambre (= Léa)                        --c-6 = rouge (hue ~25)
--c-3 = vert (= Sofiane)                     --c-7 = magenta (hue ~350)
--c-4 = violet (hue ~300)                    --c-8 = chartreuse (hue ~110)
```

clair (oklch) / sombre (oklch, +0.08 L env.) :
- `--c-1`: `0.58 0.17 256` / `0.66 0.16 256`
- `--c-2`: `0.70 0.14 66` / `0.76 0.14 66`
- `--c-3`: `0.62 0.13 152` / `0.70 0.13 152`
- `--c-4`: `0.60 0.16 300` / `0.68 0.15 300`
- `--c-5`: `0.62 0.12 200` / `0.70 0.12 200`
- `--c-6`: `0.60 0.18 25` / `0.68 0.17 25`
- `--c-7`: `0.64 0.16 350` / `0.72 0.15 350`
- `--c-8`: `0.66 0.14 110` / `0.74 0.14 110`

Les anciens `--c-karim/lea/sofiane` deviennent des **alias** (`var(--c-1/2/3)`) pour ne pas casser
`.brand-dot`. Nouveau chauffeur → prochain `colorIndex` libre (le plus petit non utilisé, modulo 8).

### Actions (contexte)
- `addDriver(nom)` : ajoute `{ id, nom, colorIndex: prochainLibre }`.
- `renameDriver(id, nom)`.
- `removeDriver(id)` : supprime le chauffeur **et** repasse ses arrêts en non affectés
  (`driver = null`) ; ajuste `progress`/`selected`/`activeDriver` si besoin (≥ 1 chauffeur conservé :
  on n'autorise pas la suppression du dernier).

## 2. Affectation manuelle des arrêts

### Modèle d'état
- `Stop.driver: string | null` (inchangé sémantiquement ; `null` = **non affecté**, pool).
- `routes` **dérivé** = regroupement des arrêts **par `driver` explicite** (tri par `order`),
  + stats km/min. **Plus d'auto-affectation implicite** dans le dérivé : un arrêt `null` n'apparaît
  dans aucune tournée (il est dans le pool).
- `activeDriver: string | null` (contexte, non persisté) = chauffeur ciblé en mode édition.

### Actions
- `assignStop(stopId, driverId | null)` :
  - `driverId` non nul → met `stop.driver = driverId` et calcule sa position par **insertion au
    moindre coût** dans la tournée du chauffeur (haversine), puis **réindexe `order`** (0..n) des
    arrêts de ce chauffeur. Si l'arrêt venait d'un autre chauffeur, il en est retiré.
  - `null` → `stop.driver = null` (retour au pool).
- `autoAssign()` (= bouton « Répartir par zone ») : pour **chaque arrêt non affecté**, choisit le
  chauffeur dont le **centroïde** (moyenne lat/lng de ses arrêts déjà affectés ; **dépôt** si aucun)
  est le plus proche (haversine), puis insertion au moindre coût. **N'écrase pas** les arrêts déjà
  affectés (manuels ou seed).

### Optimiseur (`routeOptimizer.ts`)
Refactor sans changer l'esprit :
- `buildRoutes(stops, drivers): Routes` — pur : groupe par `driver`, trie par `order`, calcule km/min.
- `autoAssign(stops, drivers): Stop[]` — affecte les arrêts non affectés (centroïde dynamique +
  insertion moindre coût) ; renvoie un nouveau tableau `stops`.
- `assignToDriver(stops, stopId, driverId): Stop[]` — insertion moindre coût + réindexation `order`
  pour ce chauffeur ; renvoie un nouveau tableau.
- helpers internes : `centroid(stops)`, `cheapestInsertIndex(routeStops, stop)`.
- L'ancien `dispatch(...)` est remplacé par ces fonctions (la classe `StubOptimizer` les porte).

## 3. UI (console répartiteur)

### Section « Chauffeurs » (sidebar)
- Toujours visible. En-tête : titre + bouton **« Répartir par zone »** (= `autoAssign`).
- Liste des cartes chauffeur (`.dcard`) — désormais **sélectionnables** : clic = devient l'**actif**
  (style actif : bordure/teinte renforcée). Chaque carte : pastille couleur, **nom éditable**
  (clic → input), stats (arrêts/km/min), bouton **« Voir la tournée → »**, bouton **supprimer** (✕).
- **« + Ajouter un chauffeur »** : champ nom → `addDriver`.

### Liste « Arrêts à livrer »
- Indicateur du chauffeur actif (« Affectation à : ● Michel »).
- Chaque arrêt (`.stopitem`) devient **cliquable** : clic = `assignStop(stop.id, activeDriver)`
  (pastille prend la couleur du chauffeur). Bouton/zone pour **désaffecter** (→ pool).
  Les non-affectés sont groupés en tête, pastille grise.
- La carte se met à jour en direct (déjà le cas via `routes` dérivé).
- L'astuce de saisie et l'autocomplétion BAN restent inchangées.

### Carte
- Affiche les arrêts affectés colorés + lignes de tournée, les non-affectés en **gris**.
- Le tracé progressif des lignes reste (animation sur changement). `reduceMotion` respecté.

> Note UX : on conserve le bouton « Répartir par zone » mais l'ancien interrupteur binaire
> `dispatched` n'est plus nécessaire (les tournées s'affichent dès qu'il y a des arrêts affectés).
> `dispatched` est **supprimé** ; `goDriver()` n'a plus besoin de répartition implicite.

## 4. Fix drapeau Leaflet

Dans `BaseMap` : sur `MapContainer`, garder l'attribution mais **désactiver le préfixe Leaflet** :
rendre l'attribution sans le « Leaflet 🇺🇦 ». Concrètement : `MapContainer attributionControl={false}`
+ `<AttributionControl prefix={false} />` enfant, en conservant `attribution` (OSM/CARTO) sur le
`TileLayer`. Résultat : crédit « © OpenStreetMap, © CARTO » sans drapeau.

## 5. Impact technique

- `DriverId: string` propagé : `Routes = Record<string, RouteResult>`, `progress: Record<string,
  number>`, `assign: Record<stopId, couleur>` (inchangé). Composants : **itèrent `drivers` du
  contexte** au lieu d'importer le const `DRIVERS`. `DriverPills`, `DriverCard`, `DispatcherMap`,
  `RouteLayer`, `PhoneMap`, légende, `App`/`Dispatcher`/`DriverView` adaptés.
- `data/drivers.ts` : `DEPOT` conservé ; `DRIVERS` const → `DEFAULT_DRIVERS` (graine de l'état),
  sans `center`/`couleurHex`.
- `selected` (vue chauffeur) et `activeDriver` deviennent des `string` ; valeurs par défaut = 1er
  chauffeur ; garde-fous si l'id n'existe plus (chauffeur supprimé) → retombe sur le 1er.

## 6. Tests

- **Palette** : `driverColor(colorIndex)` → `var(--c-n)` correct, cycle modulo 8.
- **Optimiseur** : `buildRoutes` (groupement + tri `order` + km/min, ignore les non-affectés) ;
  `autoAssign` (n'écrase pas l'existant, place les non-affectés près du bon centroïde) ;
  `assignToDriver` (insertion moindre coût + réindexation, retrait de l'ancien chauffeur).
- **Contexte** : `addDriver` (couleur libre), `renameDriver`, `removeDriver` (arrêts → pool, ≥1
  conservé, `selected`/`activeDriver` ajustés), `assignStop`/désaffectation, `autoAssign` via action.
- **Composants** : carte chauffeur sélectionnable (clic → actif), arrêt cliquable appelle
  `assignStop`, ajout/suppression chauffeur dans la sidebar, désaffectation.
- **Fix drapeau** : test léger que `BaseMap` configure une attribution sans préfixe Leaflet
  (ou vérification de non-régression dans le smoke test App avec react-leaflet mocké).
- Smoke `App` : ajout d'un chauffeur « Michel », sélection active, affectation d'un arrêt → il
  apparaît dans la tournée de Michel.

## 7. Migration

- `localStorage` reste `livreur:v2:` ; nouvelle clé `livreur:v2:drivers` (défaut = 3 chauffeurs).
  La clé `dispatched` devient inutilisée (ignorée). Les `stops` persistés restent compatibles
  (le champ `driver` existe déjà). Pas de bump de version nécessaire.

## 8. Hors périmètre (YAGNI)

- Plusieurs tournées **par** chauffeur (un chauffeur = une tournée continue, comme aujourd'hui).
- Réorganisation manuelle de l'ordre des arrêts à l'intérieur d'une tournée (l'ordre reste
  l'insertion au moindre coût). Possible évolution ultérieure (drag pour réordonner).
- Couleur choisie à la main par l'utilisateur (auto depuis la palette ; > 8 chauffeurs → cycle).
