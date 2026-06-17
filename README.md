# Livreur — Console d'exploitation logistique

Outil interne **gestionnaire** pour organiser les tournées de livraison. Trois sections, sans
limite d'arrêts par tournée. Départ **et** arrivée de chaque tournée = l'entrepôt **Letourville,
28150 Boisville-la-Saint-Père** (fixe). Les distances/temps sont **routiers réels** et l'ordre des
arrêts est **optimisé en boucle** (aller-retour entrepôt).

Trois sections (barre latérale gauche) :
- **Livreurs** — liste des livreurs ; ajout par Nom, Prénom, Téléphone ; suppression (cascade sur
  les tournées du livreur).
- **Tournées** — créer / modifier / supprimer une tournée : choix du livreur, date, ajout d'arrêts
  par **autocomplétion d'adresse (BAN)**. Ordre **optimisé automatiquement** (OSRM), **réordonnable
  à la main** (glisser-déposer), bouton « Ré-optimiser », total km/temps, carte de la boucle.
- **Chauffeurs** — vue d'ensemble filtrée par date (sélecteur ne listant que les jours ayant des
  tournées) : une carte colorée par chauffeur (1 couleur = 1 chauffeur) avec ses tournées du jour,
  plus une carte commune.
- **Historique** — tournées **passées** (date antérieure à aujourd'hui), en lecture seule, avec
  réimpression de la feuille.

L'impression d'une tournée produit une **feuille pour le livreur** (en‑tête + carte + liste ordonnée
des arrêts). Mode clair/sombre.

## Données — backend Cloudflare D1

Les données (livreurs, tournées, carnet d'adresses) sont **centralisées** dans une base **Cloudflare
D1** via des **Pages Functions** (`functions/api/*`, API `/api/*`), partagées entre tous les
utilisateurs. **Aucune authentification** (accès libre par l'URL — choix assumé pour un usage interne
restreint). Le front charge l'état au démarrage et applique des mises à jour **optimistes avec
rollback**.

Schéma : `migrations/0001_init.sql`. Configuration : `wrangler.toml` (binding `DB`).

```bash
# créer/migrer la base
npx wrangler d1 execute livreur-db --remote --file migrations/0001_init.sql
# déployer (build + Functions + binding D1)
npm run build && npx wrangler pages deploy dist --project-name=livreur --branch=main
# dev local (Functions + D1 locale)
npx wrangler pages dev dist --d1 DB=livreur-db
```

## Démarrer

```bash
npm install
npm run dev        # serveur de dev Vite
npm run build      # build de production (tsc -b + vite build)
npm test           # suite Vitest (front + API via shim sqlite)
npm run lint       # ESLint
npx tsc -p functions/tsconfig.json   # type-check des Pages Functions
```

## Architecture

- `src/styles/` — `tokens.css` (variables clair/sombre via `data-theme`) + `app.css` (classes).
- `src/types.ts` — types partagés (`Livreur`, `Tournee`, `Stop`, `RouteResult`, `Suggestion`, …).
- `src/data/` — `depot` (constante `DEPOT`, géocodée via la BAN), `palette` (couleurs `--c-1..8` +
  `driverColor`).
- `src/services/` — logique pure testée :
  - `addressProvider.ts` — `AddressProvider` + `BanProvider` : géocodage via l'**API Adresse (BAN)**
    `api-adresse.data.gouv.fr` (`suggest`/`geocodeFirst`).
  - `routing.ts` — **OSRM** (`router.project-osrm.org`, gratuit) : `optimizeTrip` (`/trip`, ordre
    optimisé + boucle depuis le dépôt) et `computeRoute` (`/route`, ordre donné). **Repli haversine**
    hors-ligne si OSRM est injoignable.
  - `geo.ts` — distances **haversine** (utilisé par le repli).
  - `stopId.ts` — génération d'identifiants.
- `src/state/` — `LivreurContext` (livreurs + tournées + actions CRUD, `provider` injectable),
  persisté en `localStorage` via `usePersistentState` (préfixe `livreur:v3:`).
- `src/components/` — `layout/` (Sidebar), `Livreurs/`, `Tournees/`, `Chauffeurs/`,
  `AddressAutocomplete`, `map/`, `icons/`.

La carte est une **carte Leaflet** (tuiles **CARTO** Positron/dark_matter selon le thème), isolée
dans `components/map/` (`BaseMap`, `TourneeMap`, `pins`). Le tracé affiché vient de la géométrie
routière OSRM.

## Documents

- Spec de design : `docs/superpowers/specs/2026-06-16-refonte-livreurs-tournees-chauffeurs-design.md`
- Plan d'implémentation : `docs/superpowers/plans/2026-06-16-refonte-livreurs-tournees-chauffeurs.md`
