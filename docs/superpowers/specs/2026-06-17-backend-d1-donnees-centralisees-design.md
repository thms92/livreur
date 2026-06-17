# Données centralisées — Backend Cloudflare D1 + Pages Functions — Design

## Objectif

Remplacer le stockage `localStorage` (par navigateur, fragile, non partagé) par une **base de
données centralisée** afin que les données (livreurs, tournées, carnet d'adresses) soient
**fiables, sauvegardées et partagées** entre les quelques utilisateurs (3–4 max).

## Contexte / existant

- App React 19 + Vite + TS, déployée sur **Cloudflare Pages** (`livreur-7bf.pages.dev`), code sur
  GitHub `thms92/livreur`. Déploiement via Wrangler (authentifié en local).
- État global dans `src/state/LivreurContext.tsx`, persisté via `usePersistentState`
  (`localStorage`, préfixe `livreur:v3:`), clés `livreurs`, `tournees`, `adresses`, `theme`,
  `section`.
- Modèle : `Livreur {id,nom,prenom,telephone,colorIndex}`, `Tournee {id,livreurId,date,stops,route?}`,
  `Stop {id,label,ville,lat,lng}`, `RouteResult {km,min,geometry,optimized,approximate}`,
  `Suggestion {id,label,ville,lat,lng}` (carnet = `Suggestion[]`).
- Inchangés par ce projet (restent 100 % côté navigateur) : routage **OSRM**, autocomplétion
  **BAN**, carte Leaflet, impression de feuille de tournée.

## Décisions (validées)

- **Accès** : **aucune authentification** — l'URL publique donne accès total en lecture/écriture.
  Choix assumé par l'utilisateur pour cet usage interne limité (compromis simplicité > protection).
- **Plateforme** : **Cloudflare D1** (SQLite) + **Pages Functions**, dans le même projet Pages.
- **Migration** : **repartir à vide** (les données localStorage de test sont abandonnées).
- **En ligne requis** : pas de mode hors-ligne ; message clair si le réseau manque.
- **Concurrence** : **dernier qui écrit gagne**, pas de temps réel (3–4 utilisateurs max → suffisant).
  Les modifications d'autrui apparaissent au rechargement.
- **Historique** : une tournée bascule **automatiquement** dans l'historique quand sa **date est
  passée** (antérieure à aujourd'hui). Une **section « Historique » dédiée** (lecture seule +
  réimpression) la liste ; la section **Tournées** n'affiche plus que le **jour même et l'à‑venir**.

## 1. Architecture

```
Navigateur (React)  ──HTTPS──>  /api/*  (Pages Functions)  ──>  D1 (SQLite)
       │                                   ▲
       └── OSRM / BAN / Leaflet (inchangés, directs depuis le navigateur)
```

- Les **Pages Functions** vivent dans `functions/` à la racine du projet ; Cloudflare les sert sur
  le même domaine que le site. L'API est sous `/api/*`.
- **D1** est lié au projet via le binding `DB` (déclaré dans `wrangler.toml` et dans les réglages
  Pages). Accès depuis les Functions via `context.env.DB`.
- **Pas d'authentification** : aucune route protégée, aucun jeton, aucun secret de mot de passe.

## 2. Schéma D1 (`migrations/0001_init.sql`)

```sql
CREATE TABLE livreurs (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  telephone   TEXT NOT NULL DEFAULT '',
  color_index INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE tournees (
  id          TEXT PRIMARY KEY,
  livreur_id  TEXT NOT NULL,
  date        TEXT NOT NULL,            -- "YYYY-MM-DD"
  stops_json  TEXT NOT NULL DEFAULT '[]',
  route_json  TEXT,                     -- RouteResult sérialisé, ou NULL
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_tournees_date ON tournees(date);
CREATE INDEX idx_tournees_livreur ON tournees(livreur_id);

CREATE TABLE adresses (
  id     TEXT PRIMARY KEY,             -- id BAN (stable, sert de dédup)
  label  TEXT NOT NULL,
  ville  TEXT NOT NULL DEFAULT '',
  lat    REAL NOT NULL,
  lng    REAL NOT NULL
);
```

- `stops` et `route` d'une tournée sont stockés **en JSON** (colonnes `stops_json`/`route_json`),
  comme aujourd'hui — pas de table `stops` séparée (YAGNI à cette échelle).
- Base **mono-locataire** : pas de table utilisateur, pas de colonne tenant.

## 3. API (Pages Functions, sous `functions/api/`)

Toutes les réponses en JSON. Aucune authentification.

| Méthode & route            | Effet |
|----------------------------|-------|
| `GET  /api/state`          | Renvoie `{ livreurs, tournees, adresses }` (tout le jeu de données). |
| `POST /api/livreurs`       | Crée un livreur (corps : `{nom,prenom,telephone}`) ; renvoie le livreur créé (id + color_index calculés serveur). |
| `PUT  /api/livreurs/:id`   | Met à jour (`{nom?,prenom?,telephone?}`). |
| `DELETE /api/livreurs/:id` | Supprime le livreur **et ses tournées** (cascade applicative). |
| `POST /api/tournees`       | Crée une tournée (`{livreurId,date}`) ; renvoie la tournée créée. |
| `PUT  /api/tournees/:id`   | Met à jour (`{livreurId?,date?,stops?,route?}`). |
| `DELETE /api/tournees/:id` | Supprime la tournée. |
| `POST /api/adresses`       | Upsert d'une adresse du carnet (dédup par `id`). |
| `DELETE /api/adresses/:id` | Retire une adresse du carnet. |

- Le **mapping JSON ↔ DB** (camelCase ↔ colonnes, sérialisation `stops`/`route`) est centralisé
  dans un module `functions/api/_db.ts` (helpers `rowToLivreur`, `rowToTournee`, etc.) pour rester
  DRY et testable.
- La **couleur** (`color_index`) d'un nouveau livreur est calculée **côté serveur** (plus petit
  index libre) pour éviter les collisions entre utilisateurs.
- Erreurs : `404` si id inconnu, `400` si corps invalide, `500` en cas d'erreur DB ; corps
  `{ error: string }`.

## 4. Front : ce qui change

- **Nouveau module** `src/services/api.ts` : client typé (`getState`, CRUD livreurs/tournées/
  adresses). Construit les requêtes, parse les réponses et les erreurs.
- **`LivreurContext` rewiré** :
  - au montage, `getState()` remplit `livreurs`/`tournees`/`adresses` (état de chargement affiché) ;
  - chaque action devient **asynchrone** : mise à jour **optimiste** locale immédiate, puis appel
    API ; en cas d'échec → **rollback** de l'état + message d'erreur ;
  - `usePersistentState` n'est plus utilisé pour les données métier (on le garde seulement pour
    `theme` et `section`, qui restent des préférences locales au navigateur).
- **`App`** : affiche un état « Chargement… » tant que `getState` n'a pas répondu, puis les sections.
  Pas d'écran de connexion.
- **Erreurs réseau** : une petite notification réutilisable signale un échec d'enregistrement ou une
  perte de réseau (et invite à réessayer / recharger).

### Historique (front uniquement — le modèle de données ne change pas)

- Le type `Section` gagne une valeur `historique` ; la **barre latérale** a une 4e entrée
  « Historique ».
- Découpage par date (comparaison à la date du jour `YYYY-MM-DD`) :
  - **Tournées** : n'affiche que les tournées dont `date >= aujourd'hui` (jour même + à venir).
  - **Historique** : `src/components/Historique/HistoriqueSection.tsx` — liste les tournées dont
    `date < aujourd'hui`, **groupées par date décroissante**, en **lecture seule** (livreur, nb
    d'arrêts, km/min) avec un bouton **Imprimer** (réutilise `printTourneeSheet`). Pas de
    modification ni de suppression ici (consultation/archive).
- Le calcul « passé vs à venir » est une petite fonction pure réutilisable (`isPast(date)` /
  partition), testable indépendamment.

## 5. Infra & déploiement (exécuté via Wrangler par l'assistant)

- `wrangler d1 create livreur-db` → récupère l'`database_id`.
- `wrangler.toml` : déclare `pages_build_output_dir = "dist"` et le binding D1
  (`[[d1_databases]]` avec `binding = "DB"`).
- Migration : `wrangler d1 execute livreur-db --file migrations/0001_init.sql`
  (en local pour les tests, et `--remote` pour la prod).
- Dev local : `wrangler pages dev` (sert le build + Functions + D1 locale).
- Déploiement : `npm run build` puis `wrangler pages deploy dist`. Le déploiement Git auto reste
  optionnel.
- **Aucun secret** à configurer (pas d'auth).

## 6. Tests

- **API (Functions)** — testées avec un faux `DB` implémentant `prepare/bind/all/run` (ou une D1
  locale Miniflare) :
  - livreurs : create (color_index auto = plus petit libre), update, delete + **cascade** tournées.
  - tournees : create, update (stops/route sérialisés), delete.
  - adresses : upsert (dédup par id), delete.
  - `state` : renvoie bien les trois collections, avec `stops`/`route` désérialisés.
  - erreurs : 404 sur id inconnu, 400 sur corps invalide.
- **Front** :
  - `services/api.ts` : construit les requêtes, parse réponses/erreurs (fetch mocké).
  - `LivreurContext` : chargement initial via `getState`, mise à jour optimiste, **rollback** sur
    échec API (api mocké).
  - partition passé/à‑venir : `isPast`/partition des tournées par rapport à la date du jour.
  - `HistoriqueSection` : n'affiche que les tournées passées, groupées par date, avec Imprimer ;
    `TourneesSection` : n'affiche que jour + à venir.

## Hors périmètre (YAGNI)

- Authentification / comptes / rôles (choix : aucune protection).
- Synchronisation temps réel / websockets (rechargement manuel suffit à cette échelle).
- Mode hors-ligne complet / file d'attente de synchronisation.
- Historique fin des **modifications** d'une tournée (versions), corbeille (l'historique ici =
  consultation des tournées passées, pas un suivi de versions).
- Édition/suppression depuis l'historique (lecture seule assumée).
- Pagination (volumes faibles).
