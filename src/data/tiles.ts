/**
 * Fond de carte, partagé par la carte à l'écran et la feuille imprimée.
 * Source unique : la duplication de cette URL est ce qui a fait casser les deux
 * en même temps quand CARTO s'est mis à exiger une clé d'API.
 *
 * OSM France : pas de clé, rendu français (communes, départementales).
 * Attention : pas de tuiles @2x — le placeholder {r} de Leaflet y renvoie 404.
 */
export const TILE_URL = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'
export const TILE_ATTR = '&copy; OpenStreetMap France, &copy; contributeurs OpenStreetMap'
export const TILE_MAX_ZOOM = 19
