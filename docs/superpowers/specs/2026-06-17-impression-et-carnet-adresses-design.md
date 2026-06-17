# Impression d'une tournée + Carnet d'adresses — Design

## Objectif

Ajouter deux fonctionnalités à l'application existante (Livreurs · Tournées · Chauffeurs,
gestionnaire only, localStorage, OSRM/BAN) :

1. **Impression d'une tournée** — un bouton génère une « feuille de tournée » imprimable destinée
   au livreur (en‑tête + liste ordonnée des arrêts, départ/arrivée à l'entrepôt).
2. **Carnet d'adresses** — chaque adresse utilisée est mémorisée automatiquement et réutilisable
   facilement lors de la création d'autres tournées.

## Contexte / existant réutilisé

- Modèle : `Stop {id,label,ville,lat,lng}`, `Tournee {id,livreurId,date,stops,route?}`,
  `Suggestion {id,label,ville,lat,lng}` (`src/types.ts`).
- `DEPOT` (`src/data/depot.ts`) : Letourville, Boisville‑la‑Saint‑Père (28150).
- Autocomplétion BAN : `AddressAutocomplete` + `useAddressAutocomplete` + `BanProvider`
  (`src/components/AddressAutocomplete.tsx`, `…/useAddressAutocomplete.ts`,
  `src/services/addressProvider.ts`).
- État global : `LivreurContext` (`src/state/LivreurContext.tsx`), persistance `usePersistentState`
  (préfixe `livreur:v3:`).
- Éditeur de tournée : `src/components/Tournees/TourneeEditor.tsx` (champ « Ajouter un arrêt »,
  `StopList`, bouton « Ré‑optimiser », total km/temps).
- Section chauffeurs : `src/components/Chauffeurs/ChauffeursSection.tsx` + `ChauffeurCard.tsx`.

## Décisions (validées)

- **Carnet** : chaque adresse ajoutée à une tournée est **mémorisée automatiquement** (dédup), pas
  de geste explicite. Pas de libellé personnalisé, pas de section dédiée.
- **Réutilisation** : dans le **même champ** « Ajouter un arrêt » — les adresses enregistrées
  correspondantes s'affichent **en tête** (marquées ★), puis les suggestions BAN.
- **Suppression** d'une entrée du carnet : petit **✕** sur l'entrée enregistrée dans la liste
  d'autocomplétion (pas de section de gestion).
- **Impression** : feuille claire (en‑tête + liste ordonnée) **avec une carte** reconstruite dans
  la fenêtre d'impression (Leaflet via CDN, tuiles CARTO + tracé OSRM + points numérotés ;
  ajout demandé après coup — internet requis au moment d'imprimer). Bouton dans **l'éditeur de
  tournée** ET sur chaque tournée de la **section Chauffeurs**.
- **Technique impression** : fenêtre d'impression **isolée** (`window.open` + HTML autonome +
  `window.print()`), pas de CSS d'impression global → aucun conflit avec l'UI.

## 1. Modèle de données

Nouvelle entité, réutilisant la forme `Suggestion` :

```ts
// alias sémantique ; même forme que Suggestion
export type SavedAddress = Suggestion // { id, label, ville, lat, lng }
```

- Persistance : nouvelle clé `livreur:v3:adresses` → `SavedAddress[]`.
- L'`id` provient de la BAN (`properties.id`), stable → sert de clé de déduplication.

### Contexte (`LivreurContext`)
Ajouts à `LivreurState` :

```ts
adresses: SavedAddress[]
removeAdresse: (id: string) => void
```

- Nouvel état : `const [adresses, setAdresses] = usePersistentState<SavedAddress[]>('adresses', [])`.
- **Auto‑mémorisation** : dans `addStopToTournee`, après avoir construit l'arrêt à partir de la
  suggestion `s`, upsert dans `adresses` :
  ```ts
  setAdresses((prev) => (prev.some((a) => a.id === s.id) ? prev : [...prev, { id: s.id, label: s.label, ville: s.ville, lat: s.lat, lng: s.lng }]))
  ```
  (dédup par `id` ; insertion en fin).
- `removeAdresse(id)` : `setAdresses((prev) => prev.filter((a) => a.id !== id))`.

## 2. Réutilisation dans l'autocomplétion

`AddressAutocomplete` reçoit deux nouvelles props (optionnelles, défaut vide) :

```ts
interface Props {
  provider: AddressProvider
  onPick: (s: Suggestion) => void
  saved?: SavedAddress[]              // carnet
  onRemoveSaved?: (id: string) => void
}
```

Comportement de la liste affichée (calculée dans le composant, le hook BAN reste inchangé) :

- `savedMatches` = `saved` filtré par la requête : libellé OU ville contient la requête
  (insensible à la casse). Seuil **1 caractère** (plus permissif que la BAN qui exige 3). Si le
  champ est ouvert avec une requête **vide**, on montre **toutes** les adresses enregistrées
  (plafonné à 8) → réutilisation en un clic.
- Liste finale = `savedMatches` (en tête, badge ★, bouton ✕) **puis** suggestions BAN du hook
  **en excluant** celles dont l'`id` est déjà dans `savedMatches` (dédup).
- Clic sur une entrée (enregistrée ou BAN) → `onPick(suggestion)` (l'enregistrée n'appelle pas le
  réseau). Clic sur ✕ d'une entrée enregistrée → `onRemoveSaved(id)` (ne ferme pas la liste, ne
  sélectionne pas).
- Navigation clavier (flèches/Enter) : opère sur la liste finale combinée. L'`activeIndex` du hook
  ne couvre que la partie BAN ; pour rester simple et robuste, la combinaison gère son propre index
  d'éléments rendus. (Détail d'implémentation à fixer dans le plan : conserver le comportement
  clavier actuel pour la portion BAN ; les entrées enregistrées sont cliquables à la souris et,
  optionnellement, atteignables au clavier — la souris suffit pour le périmètre.)

`TourneeEditor` passe `saved={adresses}` et `onRemoveSaved={removeAdresse}` au champ d'ajout.

## 3. Impression de la feuille de tournée

Nouveau fichier `src/services/printSheet.ts` :

```ts
import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'

// Pure et testable : construit le HTML autonome de la feuille.
export function buildSheetHtml(tournee: Tournee, livreur: LivreurWithColor | undefined): string

// Effet de bord : ouvre une fenêtre, écrit le HTML, imprime.
export function printTourneeSheet(tournee: Tournee, livreur: LivreurWithColor | undefined): void
```

Contenu de `buildSheetHtml` (document HTML complet avec `<style>` inline N&B) :

- Titre : **« Feuille de tournée »**.
- En‑tête : **livreur** (`prénom nom`) + **téléphone** s'il existe ; **date** (format FR
  `JJ/MM/AAAA`) ; **total** `X km · Y min` si `tournee.route` (sinon omis), avec mention
  « (estimation hors‑ligne) » si `route.approximate`.
- Liste ordonnée :
  - **🏭 Départ — Letourville, Boisville‑la‑Saint‑Père (28150)**
  - pour chaque arrêt `i` (1..N) : **`i.` `label` — `ville`**
  - **🏭 Retour — Letourville, Boisville‑la‑Saint‑Père (28150)**
- Échappement HTML des champs (`label`, `ville`, nom) pour éviter toute casse de mise en page.

`printTourneeSheet` : `const w = window.open('', '_blank'); if (!w) return; w.document.write(html);
w.document.close(); w.focus(); w.print()`. (Déclenché par un clic utilisateur → pas de blocage popup.)

### Bouton d'impression
- **Éditeur** (`TourneeEditor`) : bouton « Imprimer » dans le pied (`editor-footer`), à côté de
  « Ré‑optimiser ».
- **Section Chauffeurs** (`ChauffeurCard`) : un bouton « Imprimer » par tournée du chauffeur. Le
  composant reçoit déjà `livreur` et la liste des tournées ; il appelle
  `printTourneeSheet(tournee, livreur)`.

## 4. Tests

- `src/services/printSheet.test.ts` : `buildSheetHtml` contient le nom complet du livreur, le
  téléphone, la date FR, le total km/min, « Letourville » en départ **et** retour, et chaque
  `label` d'arrêt dans l'ordre ; total omis si `route` absent ; échappement HTML d'un label
  contenant `<`.
- `LivreurContext.test.tsx` (ajouts) : `addStopToTournee` mémorise l'adresse dans `adresses`
  (dédup : ajouter deux fois la même `id` ne crée qu'une entrée) ; `removeAdresse` retire l'entrée.
- `AddressAutocomplete.test.tsx` : avec `saved` non vide, taper une requête qui correspond affiche
  l'entrée enregistrée en tête avec ★ ; cliquer dessus appelle `onPick` ; cliquer ✕ appelle
  `onRemoveSaved` et n'appelle pas `onPick`. (BAN mockée.)

## Découpage des fichiers

- **Créé** : `src/services/printSheet.ts` (+ `.test.ts`).
- **Modifié** :
  - `src/state/LivreurContext.tsx` — `adresses`, `removeAdresse`, upsert dans `addStopToTournee`.
  - `src/components/AddressAutocomplete.tsx` — props `saved`/`onRemoveSaved`, fusion d'affichage.
  - `src/components/Tournees/TourneeEditor.tsx` — passe `saved`/`onRemoveSaved`, bouton Imprimer.
  - `src/components/Chauffeurs/ChauffeurCard.tsx` — bouton Imprimer par tournée.
  - `src/styles/app.css` — styles ★/✕ des entrées enregistrées, bouton Imprimer.

## Hors périmètre (YAGNI)

- Libellés personnalisés d'adresses (« Client Dupont »).
- Section « Adresses » dédiée dans la barre latérale.
- Impression de la carte / itinéraire graphique.
- Export PDF dédié (l'impression navigateur permet déjà « Enregistrer en PDF »).
- Synchronisation multi‑appareils du carnet (localStorage uniquement).
