export function mapsUrl(arret: { adresse: string; ville: string }): string {
  const q = encodeURIComponent(arret.adresse + ', ' + arret.ville)
  return 'https://www.google.com/maps/search/?api=1&query=' + q
}

export function openInMaps(arret: { adresse: string; ville: string }): void {
  window.open(mapsUrl(arret), '_blank', 'noopener')
}
