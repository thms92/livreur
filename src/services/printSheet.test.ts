import { describe, expect, it } from 'vitest'
import { buildSheetHtml } from './printSheet'
import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'

const livreur: LivreurWithColor = {
  id: 'l1', nom: 'Benali', prenom: 'Karim', telephone: '0612345678', colorIndex: 0, couleur: 'var(--c-1)',
}

const tournee: Tournee = {
  id: 't1', livreurId: 'l1', date: '2026-06-18',
  stops: [
    { id: 's1', label: '12 Rue des Lilas', ville: 'Chartres', lat: 48, lng: 1 },
    { id: 's2', label: '4 Avenue de la Gare', ville: 'Auneau', lat: 48.1, lng: 1.1 },
  ],
  route: { km: 47, min: 72, geometry: [], optimized: true, approximate: false },
}

describe('buildSheetHtml', () => {
  it('contient le livreur, le téléphone, la date FR et le total', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect(html).toContain('Karim Benali')
    expect(html).toContain('0612345678')
    expect(html).toContain('18/06/2026')
    expect(html).toContain('47 km')
    expect(html).toContain('72 min')
  })

  it('place Letourville en départ ET en retour', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect((html.match(/Letourville/g) ?? []).length).toBe(2)
    expect(html).toContain('Départ')
    expect(html).toContain('Retour')
  })

  it('liste les arrêts dans l’ordre', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect(html.indexOf('12 Rue des Lilas')).toBeLessThan(html.indexOf('4 Avenue de la Gare'))
  })

  it('omet le total quand la route est absente', () => {
    const html = buildSheetHtml({ ...tournee, route: undefined }, livreur)
    expect(html).not.toContain('Total :')
  })

  it('signale l’estimation hors-ligne', () => {
    const html = buildSheetHtml(
      { ...tournee, route: { km: 47, min: 72, geometry: [], optimized: false, approximate: true } },
      livreur,
    )
    expect(html).toContain('estimation hors-ligne')
  })

  it('échappe le HTML des libellés', () => {
    const html = buildSheetHtml(
      { ...tournee, stops: [{ id: 'x', label: '<script>x', ville: 'V', lat: 0, lng: 0 }] },
      livreur,
    )
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x')
  })

  it('intègre une carte Leaflet avec le dépôt, les arrêts et le tracé', () => {
    const html = buildSheetHtml(tournee, livreur)
    expect(html).toContain('id="map"')
    expect(html).toContain('leaflet')
    expect(html).toContain('48.312002') // latitude du dépôt
    expect(html).toContain('window.print') // impression déclenchée après rendu carte
    // les coordonnées des arrêts sont injectées pour les marqueurs
    expect(html).toContain('"lat":48')
  })
})
