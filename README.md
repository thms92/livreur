# Livreur — Console d'exploitation logistique

Outil interne **gestionnaire** pour organiser les tournées de livraison. Sans
limite d'arrêts par tournée. Départ **et** arrivée de chaque tournée = l'entrepôt **Letourville,
28150 Boisville-la-Saint-Père** (fixe). Les distances/temps sont **routiers réels** et l'ordre des
arrêts est **optimisé en boucle** (aller-retour entrepôt).

En production : **https://livreur-7bf.pages.dev/**

Sections (barre latérale gauche) :
- **Livreurs** — liste des livreurs ; ajout par Nom, Prénom, Téléphone ; suppression **sans
  cascade** : le livreur part à la corbeille, ses tournées restent (c'est de l'historique de
  livraison, il doit survivre à son départ) et continuent d'afficher son nom.
- **Tournées** — créer / modifier / supprimer une tournée : choix du livreur, date, ajout d'arrêts
  par **autocomplétion d'adresse (BAN)**. Ordre **optimisé automatiquement** (Valhalla), **réordonnable
  à la main** (glisser-déposer), bouton « Ré-optimiser », total km/temps, carte de la boucle.
  Option **« Sans péage »** (cochée par défaut) : bascule l'itinéraire et le recalcule.
- **Chauffeurs** — vue d'ensemble filtrée par date (sélecteur ne listant que les jours ayant des
  tournées) : une carte colorée par chauffeur (1 couleur = 1 chauffeur) avec ses tournées du jour,
  plus une carte commune.
- **Historique** — tournées **passées** (date antérieure à aujourd'hui), en lecture seule, avec
  réimpression de la feuille.
- **Corbeille** — tournées et livreurs supprimés, avec la date et l'auteur de la suppression, et un
  bouton **Restaurer**. Rien n'est jamais effacé définitivement : l'application ne propose aucune
  suppression irréversible.

L'impression d'une tournée produit une **feuille pour le livreur** (en‑tête + carte + liste ordonnée
des arrêts). Mode clair/sombre.

## Travail à deux postes

L'outil est utilisé par deux personnes en même temps, sur la même base. Quatre mécanismes, dont
l'objectif commun est **zéro perte de données** :

- **Corbeille** — aucune suppression n'efface de ligne : l'interface marque `deleted_at` (et
  `deleted_by`). Une tournée supprimée quitte les listes et vit dans la Corbeille, d'où elle
  revient intacte. Supprimer un livreur ne touche plus à ses tournées.
- **Verrou optimiste** — chaque tournée porte une `version`. Toute écriture réémet la version lue
  et le serveur refuse celles qui partent d'une lecture périmée : **409** « modifiée ailleurs »,
  **410** si la tournée est passée à la corbeille entre-temps. La version est **obligatoire** sur
  `PUT /api/tournees/:id` (400 sinon) : sans elle, l'écriture repasserait en « dernier arrivé
  gagne » et écraserait l'autre poste en silence. Côté écran, la modification refusée est annulée
  et l'état du serveur est relu.
- **Rafraîchissement automatique** — toutes les 60 s (et au retour sur l'onglet), le front sonde
  `/api/sync`, un résumé de quelques octets (`stamp` = plus récent `updated_at` des tournées,
  `livreurs` = nombre de livreurs vivants), et ne rapatrie `/api/state` (3,4 Mo) que s'il a bougé.
  Le sondage se tait pendant qu'une écriture est en vol, pour ne pas effacer de l'écran une
  modification déjà enregistrée mais pas encore relue.
- **Attribution** — chaque poste se nomme une fois (mémorisé en `localStorage`) et ses écritures
  partent avec l'en-tête `X-Operateur` ; les tournées retiennent qui les a créées, modifiées,
  supprimées. C'est **déclaratif, pas une authentification** : un nom non vérifié, pour savoir qui
  a fait quoi entre collègues. Une écriture sans en-tête passe et laisse l'attribution précédente
  en place.

**L'URL est publique et l'application n'a aucune authentification** : quiconque connaît l'adresse
peut lire et écrire. C'est un **choix assumé** pour un usage interne restreint, à reconsidérer si
l'adresse circule hors de l'équipe.

## Données — backend Cloudflare D1

Les données (livreurs, tournées, carnet d'adresses) sont **centralisées** dans une base **Cloudflare
D1** via des **Pages Functions** (`functions/api/*`, API `/api/*`), partagées entre tous les
utilisateurs. **Aucune authentification** (accès libre par l'URL — choix assumé, cf. « Travail à deux
postes » ci-dessus). Le front charge l'état au démarrage, applique des mises à jour **optimistes avec
rollback**, et relit l'état quand le sondage voit le serveur bouger.

Schéma : `migrations/` (`0001_init.sql`, `0002_horaires.sql`, `0003_peage.sql`,
`0004_travail_a_deux.sql`). Configuration : `wrangler.toml` (binding `DB`).

> **La migration passe AVANT le déploiement.** Le code déployé lit `version`, `deleted_at`,
> `deleted_by`, `created_by`, `updated_by` : déployer sans avoir joué `0004_travail_a_deux.sql`
> fait répondre **500 à tous les endpoints** — panne totale. Dans l'autre sens il n'y a pas de
> risque : la migration est purement additive (des `ADD COLUMN` avec des défauts qui disent déjà
> la vérité sur les lignes existantes), l'ancien code continue de tourner sur la base migrée.

```bash
# sauvegarde AVANT toute migration (fortement conseillé)
npx wrangler d1 export livreur-db --remote --output backup.sql
# 1. créer/migrer la base (rejouer chaque migration dans l'ordre)
npx wrangler d1 execute livreur-db --remote --file migrations/0001_init.sql
npx wrangler d1 execute livreur-db --remote --file migrations/0002_horaires.sql
npx wrangler d1 execute livreur-db --remote --file migrations/0003_peage.sql
npx wrangler d1 execute livreur-db --remote --file migrations/0004_travail_a_deux.sql
# 2. déployer seulement ensuite (build + Functions + binding D1)
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
  - `routing.ts` — **Valhalla** (`valhalla1.openstreetmap.de`, FOSSGIS, sans clé) :
    `optimizeTrip` (`/optimized_route`, ordre optimisé, dépôt fixe aux deux bouts) et `computeRoute`
    (`/route`, ordre donné). L'option péage passe par `costing_options.auto.use_tolls` (0 = éviter).
    **Repli haversine** hors-ligne si Valhalla est injoignable.
    L'instance publique refuse plus de **10 points par requête** (« Exceeded max locations: 10 »),
    soit 8 arrêts avec le dépôt aux deux bouts : au-delà, la boucle est découpée en tronçons
    enchaînés puis recollée — exact, l'ordre étant fixe. L'optimisation d'ordre, elle, est globale
    et ne se découpe pas : au-delà de 8 arrêts, `optimizeTrip` conserve l'ordre donné et se
    contente de calculer le vrai tracé.
    OSRM a été abandonné : son instance publique refuse `exclude=toll`.
  - `polyline.ts` — décodage des tracés Valhalla (polyligne encodée, précision 6).
  - `geo.ts` — distances **haversine** (utilisé par le repli).
  - `stopId.ts` — génération d'identifiants.
  - `api.ts` — client HTTP de `/api/*` : joint l'en-tête `X-Operateur` aux écritures et traduit
    les refus du verrou (409/410) en `ConflitError` exploitable par le contexte.
- `src/state/` — `LivreurContext` (livreurs + tournées + actions CRUD, `provider` injectable,
  versions détenues, sondage de `/api/sync`), persisté en `localStorage` via `usePersistentState`
  (préfixe `livreur:v3:`) ; `operateur.ts` — identité déclarative du poste.
- `src/components/` — `layout/` (Sidebar), `Livreurs/`, `Tournees/`, `Chauffeurs/`, `Historique/`,
  `Corbeille/`, `OperateurGate`, `AddressAutocomplete`, `map/`, `icons/`.

La carte est une **carte Leaflet** (tuiles **OSM France**, `data/tiles.ts` — source unique partagée
avec la feuille imprimée ; en thème sombre les tuiles sont assombries par filtre CSS, OSM France ne
publiant pas de variante sombre). CARTO a été abandonné : ses tuiles exigent désormais une clé d'API
et renvoyaient un filigrane « API KEY REQUIRED ». Attention, pas de tuiles `@2x` : le placeholder
`{r}` de Leaflet y renvoie 404. La carte est isolée
dans `components/map/` (`BaseMap`, `TourneeMap`, `pins`). Le tracé affiché vient de la géométrie
routière Valhalla.

> **Note sur les durées** — Valhalla estime des temps de trajet ~20 % supérieurs à ceux d'OSRM sur
> les mêmes routes (les distances, elles, concordent). Les tournées calculées avant la bascule
> gardent leurs valeurs OSRM tant qu'elles ne sont pas recalculées.

## Documents

- Spec de design : `docs/superpowers/specs/2026-06-16-refonte-livreurs-tournees-chauffeurs-design.md`
- Plan d'implémentation : `docs/superpowers/plans/2026-06-16-refonte-livreurs-tournees-chauffeurs.md`
