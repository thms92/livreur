# Données centralisées — Backend Cloudflare D1 + Pages Functions — Design

## Objectif

Remplacer le stockage `localStorage` (par navigateur, fragile, non partagé) par une **base de
données centralisée** afin que les données (livreurs, tournées, carnet d'adresses) soient
**fiables, sauvegardées et partagées** entre les quelques utilisateurs (3–4 max).

## Contexte / existant

- App React 19 + Vite + TS, déployée sur **Cloudflare Pages** (`livreur-7bf.pages.dev`), code sur
  GitHub `thms92/livreur`. Déploiement possible via Wrangler (authentifié en local).
- État global dans `src/state/LivreurContext.tsx`, persisté via `usePersistentState`
  (`localStorage`, préfixe `livreur:v3:`), clés `livreurs`, `tournees`, `adresses`, `theme`,
  `section`.
- Modèle : `Livreur {id,nom,prenom,telephone,colorIndex}`, `Tournee {id,livreurId,date,stops,route?}`,
  `Stop {id,label,ville,lat,lng}`, `RouteResult {km,min,geometry,optimized,approximate}`,
  `Suggestion {id,label,ville,lat,lng}` (carnet = `Suggestion[]`).
- Inchangés par ce projet (restent 100 % côté navigateur) : routage **OSRM**, autocomplétion
  **BAN**, carte Leaflet, impression de feuille de tournée.

## Décisions (validées)

- **Accès** : un **mot de passe unique partagé** (pas de comptes individuels).
- **Plateforme** : **Cloudflare D1** (SQLite) + **Pages Functions**, dans le même projet Pages.
- **Migration** : **repartir à vide** (les données localStorage de test sont abandonnées).
- **En ligne requis** : pas de mode hors-ligne ; message clair si le réseau manque.
- **Concurrence** : **dernier qui écrit gagne**, pas de temps réel (3–4 utilisateurs max → suffisant).
  Les modifications d'autrui apparaissent au rechargement.

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

## 2. Authentification (mot de passe partagé)

- Secret **`APP_PASSWORD`** : le mot de passe (secret Cloudflare, jamais dans le code/git).
- Secret **`AUTH_SECRET`** : clé de signature des jetons (secret Cloudflare).
- `POST /api/login` `{ password }` :
  - comparaison à `APP_PASSWORD` en **temps constant** ;
  - si OK → renvoie `{ token }` où `token = base64url(payload).signature`, `payload = { exp }`
    (expiration, ex. +30 jours), `signature = HMAC-SHA256(payload, AUTH_SECRET)` via Web Crypto ;
  - si KO → `401`.
- Middleware `functions/api/_middleware.ts` : protège tous les `/api/*` **sauf** `/api/login`.
  Lit l'en-tête `Authorization: Bearer <token>`, vérifie la signature HMAC et l'expiration ; sinon
  `401`.
- **Front** : écran de connexion tant qu'aucun jeton valide. Le jeton est stocké en `localStorage`
  (clé `livreur:auth`) et envoyé sur chaque appel. Un `401` efface le jeton → retour connexion.
- HTTPS partout (Cloudflare). Modèle de menace : petit outil interne, mot de passe partagé — ce
  niveau est adapté.

## 3. Schéma D1 (`migrations/0001_init.sql`)

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

## 4. API (Pages Functions, sous `functions/api/`)

Toutes les réponses en JSON ; toutes protégées par le jeton sauf `login`.

| Méthode & route            | Effet |
|----------------------------|-------|
| `POST /api/login`          | Valide le mot de passe, renvoie `{ token }`. |
| `GET  /api/state`          | Renvoie `{ livreurs, tournees, adresses }` (tout le jeu de données). |
| `POST /api/livreurs`       | Crée un livreur (corps : `{nom,prenom,telephone}`) ; renvoie le livreur créé (id + color_index calculés serveur). |
| `PUT  /api/livreurs/:id`   | Met à jour (`{nom?,prenom?,telephone?}`). |
| `DELETE /api/livreurs/:id` | Supprime le livreur **et ses tournées** (cascade applicative). |
| `POST /api/tournees`       | Crée une tournée (`{livreurId,date}`). |
| `PUT  /api/tournees/:id`   | Met à jour (`{livreurId?,date?,stops?,route?}`). |
| `DELETE /api/tournees/:id` | Supprime la tournée. |
| `POST /api/adresses`       | Upsert d'une adresse du carnet (dédup par `id`). |
| `DELETE /api/adresses/:id` | Retire une adresse du carnet. |

- Le **mapping JSON ↔ DB** (camelCase ↔ colonnes, sérialisation `stops`/`route`) est centralisé
  dans un module `functions/api/_db.ts` (helpers `rowToLivreur`, `rowToTournee`, etc.) pour rester
  DRY et testable.
- La **couleur** (`color_index`) d'un nouveau livreur est calculée **côté serveur** (plus petit
  index libre) pour éviter les collisions entre utilisateurs.

## 5. Front : ce qui change

- **Nouveau module** `src/services/api.ts` : client typé (login, getState, CRUD). Ajoute le jeton,
  gère les `401` (efface le jeton + déclenche la reconnexion), parse les erreurs.
- **`LivreurContext` rewiré** :
  - au montage (après authentification), `getState()` remplit `livreurs`/`tournees`/`adresses` ;
  - chaque action devient **asynchrone** : mise à jour **optimiste** locale immédiate, puis appel
    API ; en cas d'échec → **rollback** de l'état + message d'erreur ;
  - `usePersistentState` n'est plus utilisé pour les données métier (on garde localStorage
    seulement pour `theme`, `section`, et le jeton d'auth).
- **Écran de connexion** `src/components/Auth/LoginGate.tsx` : champ mot de passe → `login()` →
  stocke le jeton → charge l'app. Affiché tant que non authentifié ; `App` n'affiche les sections
  qu'une fois connecté et l'état chargé (avec un état de chargement).
- **Erreurs réseau** : un petit bandeau/notification réutilisable signale un échec d'enregistrement
  ou une perte de réseau.

## 6. Infra & déploiement (exécuté via Wrangler par l'assistant)

- `wrangler d1 create livreur-db` → récupère l'`database_id`.
- `wrangler.toml` : déclare le binding `DB` (+ section `[[d1_databases]]`) et le dossier
  `pages_build_output_dir = "dist"`.
- Migration appliquée via `wrangler d1 execute livreur-db --file migrations/0001_init.sql`
  (en local pour les tests, et en remote pour la prod).
- Secrets en prod : `wrangler pages secret put APP_PASSWORD` et `... AUTH_SECRET` (le mot de passe
  est choisi par l'utilisateur ; `AUTH_SECRET` généré aléatoirement).
- Dev local : `wrangler pages dev` (sert le build + Functions + D1 locale).
- Déploiement : `npm run build` puis `wrangler pages deploy dist` (la prod ré-applique la migration
  une fois). Le déploiement Git auto reste optionnel.

## 7. Tests

- **API (Functions)** — testées avec une **D1 locale** (Miniflare/`wrangler`) ou un faux `DB`
  implémentant `prepare/bind/all/run` :
  - `login` : bon mot de passe → jeton ; mauvais → 401.
  - middleware : jeton absent/invalide/expiré → 401 ; valide → passe.
  - livreurs : create (color_index auto), update, delete + **cascade** des tournées.
  - tournees : create, update (stops/route), delete.
  - adresses : upsert (dédup id), delete.
  - `state` : renvoie bien les trois collections.
- **Front** :
  - `services/api.ts` : ajoute le Bearer, sérialise/désérialise, gère 401 (fetch mocké).
  - `LivreurContext` : chargement initial via `getState`, mise à jour optimiste, **rollback** sur
    échec API (api mocké).
  - `LoginGate` : mauvais mot de passe → message ; bon → app chargée.

## Hors périmètre (YAGNI)

- Comptes individuels, rôles/permissions.
- Synchronisation temps réel / websockets (rechargement manuel suffit à cette échelle).
- Mode hors-ligne complet / file d'attente de synchronisation.
- Historique / versions / corbeille.
- Pagination (volumes faibles).
