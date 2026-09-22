-- Travail à deux sans perte de données.
-- Purement additive : aucun UPDATE de rattrapage, les valeurs par défaut disent
-- déjà la vérité sur les lignes existantes (vivantes, version 1, auteur inconnu).

-- Corbeille : NULL = vivant, sinon epoch ms de la suppression.
ALTER TABLE tournees ADD COLUMN deleted_at INTEGER;
ALTER TABLE livreurs ADD COLUMN deleted_at INTEGER;

-- Verrou optimiste : incrémenté à chaque écriture, sert à refuser une écriture
-- fondée sur une lecture périmée.
ALTER TABLE tournees ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Attribution déclarative (non vérifiée, faute d'authentification).
ALTER TABLE tournees ADD COLUMN created_by TEXT;
ALTER TABLE tournees ADD COLUMN updated_by TEXT;
ALTER TABLE tournees ADD COLUMN deleted_by TEXT;
ALTER TABLE livreurs ADD COLUMN deleted_by TEXT;
