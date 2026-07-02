-- Horaires de tournée : bornes dépôt (départ/retour) + verrou d'ordre manuel.
-- Les heures de livraison par arrêt vivent dans stops_json (pas de colonne dédiée).
ALTER TABLE tournees ADD COLUMN depart_heure TEXT;
ALTER TABLE tournees ADD COLUMN retour_heure TEXT;
ALTER TABLE tournees ADD COLUMN ordre_manuel INTEGER NOT NULL DEFAULT 0;
