-- Option d'itinéraire : éviter les péages ou non.
-- Le défaut est « sans péage » (1) pour toute tournée créée à partir de maintenant.
ALTER TABLE tournees ADD COLUMN sans_peage INTEGER NOT NULL DEFAULT 1;

-- Les tournées déjà en base ont été calculées par OSRM, péages autorisés :
-- on les marque telles qu'elles sont plutôt que de leur appliquer le nouveau défaut,
-- qui prétendrait à tort que 20 d'entre elles évitent les péages. route_json n'est pas touché.
--
-- La borne sur updated_at rend l'instruction rejouable sans dégât : si cette migration est
-- relancée par erreur, elle ne peut plus toucher les tournées créées après son écriture.
UPDATE tournees SET sans_peage = 0 WHERE updated_at < 1787140517628;
