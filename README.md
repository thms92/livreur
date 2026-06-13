# Livreur — Console d'exploitation logistique

Outil interne de répartition de tournées de livraison entre 3 chauffeurs : **une seule
tournée continue, ordonnée et optimisée par chauffeur, sans limite d'arrêts** (contourne la
limite de 9 arrêts de Google Maps). Maps n'est ouvert que pour le trajet vers l'arrêt en
cours, jamais pour une liste de stops.

Deux écrans (segmented control en haut) :
- **Console Répartiteur** — carte SVG des arrêts, saisie d'adresses, « Répartir par zone », cartes chauffeur.
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
- `src/data/` — `drivers`, `communes`, `seed` (données du prototype).
- `src/services/` — logique pure testée, **isolée derrière des interfaces** prêtes à industrialiser :
  - `geocoder.ts` — `Geocoder` + `StubGeocoder` (table de communes) → remplacer par un vrai géocodage (ex. `api-adresse.data.gouv.fr`).
  - `routeOptimizer.ts` — `RouteOptimizer` + `StubOptimizer` (heuristique zone + insertion moindre coût) → remplacer par le vrai service d'optimisation.
  - `geometry.ts` — utilitaires SVG.
- `src/state/` — `LivreurContext` (état + actions dérivées) persisté en `localStorage` (`usePersistentState`, préfixe `livreur:`).
- `src/components/` — `Dispatcher/`, `DriverView/`, `map/` (SVG schématique → remplaçable par une vraie carte), `icons/`.

Le fond de carte est un **SVG schématique** dessiné par code (viewBox `0 0 960 720`), isolé dans
`components/map/` pour pouvoir être remplacé par une vraie carte (Leaflet/MapLibre).

## Documents

- Spec de design : `docs/superpowers/specs/2026-06-13-livreur-design.md`
- Plan d'implémentation : `docs/superpowers/plans/2026-06-13-livreur.md`
