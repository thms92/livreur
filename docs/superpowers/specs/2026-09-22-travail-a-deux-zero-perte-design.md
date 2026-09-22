# Travail à deux sans perte de données — design

## Objectif

Rendre l'outil sûr et lisible pour deux personnes qui l'utilisent en parallèle depuis
des postes différents, avec une exigence explicite : **aucune donnée ne doit pouvoir
disparaître**, ni par écrasement silencieux, ni par suppression irréversible.

Trois symptômes constatés, plus une demande de confort :

1. Une opératrice ne voit pas les tournées créées par l'autre après le chargement de sa page.
2. Deux écritures concurrentes sur une même tournée s'écrasent sans avertissement.
3. Supprimer un livreur détruit définitivement **toutes** ses tournées.
4. Rien n'indique qui a créé ou modifié quoi.

## Critères de succès

- Une tournée créée sur un poste apparaît sur l'autre **sans rechargement manuel**, en moins d'une minute.
- Aucune écriture fondée sur une lecture périmée n'est appliquée : elle est **refusée**, jamais partiellement écrite.
- Aucune ligne n'est jamais retirée de la base par l'interface ; tout élément supprimé est **restaurable par les utilisatrices elles-mêmes**.
- Supprimer un livreur ne supprime plus ses tournées.
- Chaque tournée indique qui l'a créée et qui l'a modifiée en dernier.

## Non-objectifs

Écartés délibérément, après arbitrage :

- **Authentification.** Le lien reste public : quiconque le possède peut tout modifier.
- **Droits différenciés.** Les deux opératrices ont exactement les mêmes pouvoirs.
- **Édition simultanée de la même tournée.** L'organisation actuelle est « chacune ses tournées » :
  on détecte le conflit, on ne cherche pas à fusionner deux modifications concurrentes.
- **Corbeille pour le carnet d'adresses.** Supprimer une adresse enregistrée ne détruit aucune
  donnée : chaque arrêt de tournée porte déjà sa propre copie du libellé et des coordonnées.

## Conception

### 1. Corbeille — aucune suppression réelle

L'interface ne supprime plus rien : elle **marque**. Une colonne `deleted_at INTEGER`
(millisecondes epoch, `NULL` = vivant) sur `tournees` et `livreurs`.

- `getState` ne renvoie que les lignes dont `deleted_at IS NULL`, **sauf** pour les livreurs :
  ceux-ci sont renvoyés avec leur marqueur, afin qu'une tournée ancienne puisse toujours
  afficher le nom de son livreur même après son retrait. Le contexte expose donc deux vues :
  `livreurs` (actifs seulement) pour les listes et le sélecteur d'affectation, et
  `livreursTous` pour résoudre un nom depuis `tournee.livreurId`. Sans cette séparation, un
  livreur mis à la corbeille resterait proposé à l'affectation d'une nouvelle tournée.
- `deleteTournee` et `deleteLivreur` deviennent des `UPDATE ... SET deleted_at = ?`.
- Un écran **Corbeille** liste les éléments marqués, avec leur date de suppression, l'auteur
  de la suppression, et un bouton **Restaurer** (`deleted_at = NULL`).

**Changement de comportement assumé** : supprimer un livreur ne touche plus à ses tournées.
Elles constituent l'historique de livraison et n'ont pas à disparaître parce qu'une personne
quitte l'entreprise. Le livreur sort des listes ; ses tournées restent consultables.

La corbeille n'a pas de purge automatique. Rien ne s'efface tout seul — c'est le sens même
de l'exigence.

### 2. Détection de conflit — plus d'écrasement silencieux

Une colonne `version INTEGER NOT NULL DEFAULT 1` sur `tournees`, incrémentée à chaque écriture.
Le client renvoie la version qu'il a lue ; le serveur n'écrit que si elle est toujours d'actualité :

```sql
UPDATE tournees SET ..., version = version + 1 WHERE id = ? AND version = ?
```

Le nombre de lignes affectées (`meta.changes` côté D1) décide de la réponse :

| Lignes | Situation | Réponse |
|---|---|---|
| 1 | écriture appliquée | `200` + la nouvelle version |
| 0, ligne présente | version périmée | `409 Conflict` |
| 0, ligne absente | tournée supprimée entre-temps | `410 Gone` |

À la réception d'un `409` ou d'un `410`, le client **annule sa mise à jour optimiste**
(le mécanisme de rollback existe déjà via `fail()`), recharge l'état et affiche un message
explicite : « Cette tournée a été modifiée ailleurs, les données ont été rechargées. »

Le choix d'un entier plutôt que de `updated_at` est délibéré : `updated_at` vaut `Date.now()`,
et deux écritures dans la même milliseconde ne seraient pas distinguables.

`version` n'est posée que sur `tournees`. Les livreurs sont rarement modifiés et les adresses
passent par un upsert idempotent : y ajouter un verrou serait du coût sans bénéfice.

### 3. Rafraîchissement automatique

Aujourd'hui `getState` n'est appelé qu'une fois, dans un `useEffect` à dépendances vides :
chaque navigateur garde la photo prise à l'ouverture. On ajoute deux déclencheurs :

- **Retour sur l'onglet** (`visibilitychange` → visible) : relecture immédiate.
- **Minuterie** de 60 s tant que l'onglet est visible.

**Ce n'est pas l'état complet qui est sondé.** `/api/state` pèse 3,4 Mo — les géométries de
tracé en représentent l'essentiel. Le relire toutes les 60 s sur deux postes coûterait
plusieurs gigaoctets par jour et autant de lectures D1 inutiles. On interroge donc
`GET /api/sync`, qui renvoie quelques octets : `{ stamp, livreurs }`, où `stamp` vaut
`MAX(updated_at)` sur les tournées et `livreurs` leur simple décompte. L'état complet n'est
rechargé que si ce couple a changé. Le décompte des livreurs rattrape le cas d'un livreur
ajouté, qui ne modifie aucune tournée et ne ferait donc pas bouger `stamp`.

Un compteur d'écritures en vol suspend la relecture pendant qu'une requête est en cours,
pour éviter qu'un état serveur antérieur n'écrase brièvement une mise à jour optimiste.

### 4. Attribution — qui a fait quoi

Sans authentification, l'identité est **déclarative** : chaque poste choisit un nom une fois,
conservé en `localStorage` (`usePersistentState`). Tant qu'aucun nom n'est saisi, l'app le
demande au premier usage.

Ce nom voyage dans un en-tête `X-Operateur` sur **toutes** les écritures — un en-tête plutôt
qu'un champ de corps, pour couvrir création, modification et suppression sans toucher à la
forme de chaque charge utile.

Colonnes ajoutées sur `tournees` : `created_by TEXT`, `updated_by TEXT`, `deleted_by TEXT`
(`NULL` sur les lignes existantes = antérieur à l'attribution, ce qui est la vérité).
Sur `livreurs` : `deleted_by TEXT`, suffisant pour l'usage de la corbeille.

L'interface affiche « créée par X » et « modifiée par Y » sur la tournée, et
« supprimée par Z le … » dans la corbeille.

**Limite à assumer et à redire aux utilisatrices** : ce nom n'est pas vérifié. Il répond à
« qui a changé cet arrêt ? » entre deux collègues qui se font confiance. Ce n'est ni une
sécurité, ni une preuve.

## Migration

`migrations/0004_travail_a_deux.sql`, purement additive — aucune table recréée, aucune
colonne supprimée, aucune donnée réécrite :

```sql
ALTER TABLE tournees ADD COLUMN deleted_at INTEGER;
ALTER TABLE tournees ADD COLUMN version     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournees ADD COLUMN created_by  TEXT;
ALTER TABLE tournees ADD COLUMN updated_by  TEXT;
ALTER TABLE tournees ADD COLUMN deleted_by  TEXT;
ALTER TABLE livreurs ADD COLUMN deleted_at  INTEGER;
ALTER TABLE livreurs ADD COLUMN deleted_by  TEXT;
```

Aucun `UPDATE` de rattrapage n'est nécessaire : les valeurs par défaut disent la vérité
sur les lignes existantes (vivantes, version 1, auteur inconnu). C'est volontaire — la
migration précédente (`0003`) a montré qu'un `UPDATE` de rattrapage doit être borné dans le
temps, et le meilleur `UPDATE` reste celui qu'on n'écrit pas.

Application en production, comme toujours sur ce projet, fichier par fichier :

```bash
npx wrangler d1 export livreur-db --remote --output backups/backup-avant-0004.sql
npx wrangler d1 execute livreur-db --remote --file migrations/0004_travail_a_deux.sql
```

## Portée technique

| Zone | Travail |
|---|---|
| `migrations/0004_*.sql` | la migration ci-dessus + son test de non-destruction |
| `functions/api/_db.ts` | filtrage des supprimés, `UPDATE` versionné, marquage, attribution |
| `functions/api/tournees/[id].ts`, `livreurs/[id].ts` | codes `409` / `410`, lecture de `X-Operateur` |
| `src/services/api.ts` | envoi de l'en-tête, remontée typée des conflits |
| `src/state/LivreurContext.tsx` | relecture auto, compteur d'écritures, gestion du conflit, restauration |
| `src/components/Corbeille/` | nouvel écran |
| `src/components/layout/Sidebar.tsx` | entrée « Corbeille » |
| `src/test/d1.ts` | le double en mémoire doit exposer `meta.changes`, sans quoi le 409 n'est pas testable |

## Tests

En TDD, chaque test vu échouer avant d'être rendu vert.

- **Migration** : additive, aucune table touchée, lignes existantes vivantes et en version 1.
- **Corbeille** : supprimer marque au lieu d'effacer ; `getState` masque les tournées supprimées ;
  supprimer un livreur **laisse ses tournées intactes** ; restaurer les fait revenir.
- **Conflit** : une écriture en version périmée renvoie 409 et **ne modifie rien** ;
  une écriture sur une tournée supprimée renvoie 410 ; une écriture à jour incrémente la version.
- **Attribution** : `X-Operateur` est enregistré en création, modification et suppression ;
  son absence laisse `NULL` sans faire échouer l'écriture.
- **Rafraîchissement** : le retour de visibilité déclenche une relecture ; aucune relecture
  n'est déclenchée pendant qu'une écriture est en vol.

## Risques et limites

- **Le lien reste public.** C'est le risque le plus important qui subsiste, et il est hors
  périmètre par décision explicite. La corbeille en limite les conséquences : un tiers
  malveillant ou maladroit ne peut plus détruire définitivement, seulement masquer.
- **L'attribution n'est pas vérifiée** (voir § 4).
- **La corbeille croît indéfiniment.** Volume attendu négligeable à l'échelle de cet outil ;
  à revoir seulement si la base devient lourde.
- **Deux modifications concurrentes de la même tournée** produisent un conflit, pas une fusion.
  Assumé : l'organisation est « chacune ses tournées ».
