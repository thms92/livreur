# Livreur — Console d'exploitation logistique

Outil interne de répartition de tournées de livraison entre 3 chauffeurs : **une seule
tournée continue, ordonnée et optimisée par chauffeur, sans limite d'arrêts** (contourne la
limite de 9 arrêts de Google Maps). Maps n'est ouvert que pour le trajet vers l'arrêt en
cours, jamais pour une liste de stops.

Deux écrans (segmented control en haut) :
- **Console Répartiteur** — carte Leaflet des arrêts, saisie d'adresses (autocomplétion BAN), « Répartir par zone », cartes chauffeur.
- **Vue chauffeur** — écran terrain façon téléphone : arrêt en cours, liste ordonnée, ouverture Maps.

Mode clair/sombre, responsive jusqu'au mobile, IBM Plex Sans (UI) + IBM Plex Mono (chiffres).

## Démarrer

```bash
npm install
npm run dev        # serveur de dev Vite
npm run build      # build de production (tsc -b + vite build)
npm test           # suite Vitest
```

## Architecture

- `src/styles/` — `tokens.css` (variables clair/sombre via `data-theme`) + `app.css` (classes).
- `src/types.ts` — types partagés (`Stop`, `Driver`, `Routes`, …).
- `src/data/` — `drivers`, `seed` (données du prototype, coordonnées `lat`/`lng` réelles).
- `src/services/` — logique pure testée, **isolée derrière des interfaces** prêtes à industrialiser :
  - `addressProvider.ts` — `AddressProvider` + `BanProvider` : géocodage via l'**API Adresse (BAN)** `api-adresse.data.gouv.fr` (`suggest`/`geocodeFirst`).
  - `geo.ts` — distances **haversine** entre coordonnées `lat`/`lng`.
  - `routeOptimizer.ts` — `RouteOptimizer` + `StubOptimizer` (heuristique zone + insertion moindre coût) → remplacer par le vrai service d'optimisation.
  - `stopId.ts` — génération d'identifiants d'arrêts.
- `src/state/` — `LivreurContext` (état + actions dérivées, `provider` injectable) persisté en `localStorage` (`usePersistentState`, préfixe `livreur:v2:`).
- `src/components/` — `Dispatcher/`, `DriverView/`, `map/`, `icons/`.

La carte est une **carte Leaflet** (tuiles **CARTO** Positron/dark_matter selon le thème), isolée
dans `components/map/` (`BaseMap`, `RouteLayer`, `DispatcherMap`, `PhoneMap`, `pins`).

## Documents

- Spec de design : `docs/superpowers/specs/2026-06-13-livreur-design.md`
- Plan d'implémentation : `docs/superpowers/plans/2026-06-13-livreur.md`
