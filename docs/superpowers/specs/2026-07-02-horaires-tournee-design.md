# Horaires de tournée — design

## Objectif

Permettre de saisir des **horaires** (format 24h, heure locale FR) sur une tournée :

- une heure de **départ** et une heure de **retour** au dépôt (saisies manuellement, optionnelles) ;
- une **heure de livraison** par arrêt (optionnelle, éditable à tout moment).

L'ordre des arrêts est **piloté par les heures** (chronologique) par défaut, mais un
réordonnancement **manuel prend le pas** dès que l'utilisateur intervient.

## Format et fuseau

Les heures sont stockées en chaînes `"HH:MM"` (24h). On ne construit **jamais** d'objet
`Date` à partir de ces valeurs : ce sont des heures « murales », intrinsèquement 24h et sans
fuseau, donc aucun décalage UTC / heure d'été possible. L'`<input type="time">` natif affiche
du 24h en locale FR et renvoie toujours `"HH:MM"`.

## Modèle de données

Champs ajoutés (tous optionnels, rétro-compatibles) :

- `Stop.heure?: string` — dans `stops_json`, transite sans changement de schéma.
- `Tournee.departHeure?: string`
- `Tournee.retourHeure?: string`
- `Tournee.ordreManuel?: boolean` — `false`/absent = tri chronologique auto ; `true` = ordre figé.

Les trois champs niveau tournée nécessitent une migration D1 (`0002_horaires.sql`) :
`depart_heure TEXT`, `retour_heure TEXT`, `ordre_manuel INTEGER NOT NULL DEFAULT 0`.

## Tri des arrêts (`src/lib/stopOrder.ts`)

`sortStopsByTime(stops)` : tri **stable** par `heure` croissante (`"HH:MM"` comparé
lexicographiquement = chronologiquement). Les arrêts **sans heure** sont placés après les
arrêts datés, en conservant leur ordre d'insertion.

## Comportement (LivreurContext)

- **Ajouter un arrêt** : ajout sans heure → si `!ordreManuel`, tri chronologique → recalcul du
  trajet (`computeRoute`, pas d'optimisation géographique).
- **Éditer l'heure d'un arrêt** : met à jour l'heure ; si `!ordreManuel` et que l'ordre change,
  re-tri + recalcul trajet ; sinon simple persistance (le trajet ne dépend pas des heures).
- **Glisser-déposer** : fige l'ordre (`ordreManuel = true`) + recalcul trajet.
- **« Trier par heure »** : re-tri chronologique + `ordreManuel = false` + recalcul.
- **« Ré-optimiser »** (OSRM /trip, géographique) : conservé, marque `ordreManuel = true`.
- **Départ / retour dépôt** : champs niveau tournée, persistés seuls (aucun impact trajet).

## UI

- `StopList` : `<input type="time">` sur la ligne dépôt-départ, chaque arrêt, la ligne
  dépôt-retour. Le glisser-déposer est conservé pour tous les arrêts.
- `TourneeEditor` : câble les handlers ; boutons « Trier par heure » + « Ré-optimiser ».
- L'ancien mécanisme `pendingRef`/`useEffect` de recalcul est retiré : le contexte gère le
  recalcul de trajet lui-même.

## Impression

`printSheet` affiche l'heure en regard de chaque arrêt et les heures départ/retour du dépôt.

## Hors périmètre

Pas de contrôle de faisabilité (aucune vérification que les heures sont tenables vu les temps
de trajet). Les heures sont affichées telles que saisies.
