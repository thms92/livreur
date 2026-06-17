import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'
import { DEPOT } from '../data/depot'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/**
 * Script (exécuté dans la fenêtre d'impression) qui reconstruit une carte Leaflet
 * depuis le CDN, trace la boucle dépôt → arrêts → dépôt, puis lance l'impression
 * une fois les tuiles chargées (avec repli temporisé si hors-ligne).
 */
function mapScript(tournee: Tournee): string {
  const depot = [DEPOT.lat, DEPOT.lng]
  const stops = tournee.stops.map((s, i) => ({ lat: s.lat, lng: s.lng, n: i + 1 }))
  const geometry = tournee.route?.geometry ?? []
  return `<script>
window.addEventListener('load', function () {
  var depot = ${JSON.stringify(depot)};
  var stops = ${JSON.stringify(stops)};
  var line = ${JSON.stringify(geometry)};
  var printed = false;
  var bounds = null;
  function fit() {
    if (!window.__map) return;
    try {
      window.__map.invalidateSize();
      if (bounds && bounds.isValid()) window.__map.fitBounds(bounds, { padding: [24, 24] });
      else window.__map.setView(depot, 11);
    } catch (e) { /* ignore */ }
  }
  function go() {
    if (printed) return;
    printed = true;
    fit();
    setTimeout(function () { window.print(); }, 450);
  }
  try {
    var map = L.map('map', { zoomControl: false, attributionControl: true });
    window.__map = map;
    var tiles = L.tileLayer('${TILES}', { maxZoom: 19 });
    tiles.on('load', go);
    tiles.addTo(map);
    var pts = [depot];
    L.marker(depot, { icon: L.divIcon({ className: '', html: '<div class="pin depot">🏭</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
    stops.forEach(function (s) {
      pts.push([s.lat, s.lng]);
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<div class="pin">' + s.n + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);
    });
    if (line && line.length > 1) {
      L.polyline(line, { color: '#1f6feb', weight: 3 }).addTo(map);
      line.forEach(function (p) { pts.push(p); });
    } else {
      L.polyline([depot].concat(stops.map(function (s) { return [s.lat, s.lng]; })).concat([depot]), { color: '#1f6feb', weight: 3 }).addTo(map);
    }
    bounds = L.latLngBounds(pts);
    setTimeout(fit, 250);
    window.addEventListener('beforeprint', fit);
  } catch (e) { /* hors-ligne : on imprime sans carte */ }
  setTimeout(go, 2200);
});
</script>`
}

/** Construit le document HTML autonome de la feuille de tournée (pur, testable). */
export function buildSheetHtml(tournee: Tournee, livreur: LivreurWithColor | undefined): string {
  const nom = livreur ? `${livreur.prenom} ${livreur.nom}` : '—'
  const tel = livreur?.telephone ? ` · ${esc(livreur.telephone)}` : ''
  const depotLine = `${DEPOT.label}, ${DEPOT.ville} (${DEPOT.codePostal})`
  const total = tournee.route
    ? `${tournee.route.km.toFixed(0)} km · ${Math.round(tournee.route.min)} min` +
      (tournee.route.approximate ? ' (estimation hors-ligne)' : '')
    : ''
  const rows = tournee.stops
    .map(
      (s, i) =>
        `<li><span class="n">${i + 1}.</span> <span class="a">${esc(s.label)}</span>` +
        (s.ville ? ` — <span class="v">${esc(s.ville)}</span>` : '') +
        `</li>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Feuille de tournée</title>
<link rel="stylesheet" href="${LEAFLET_CSS}"/>
<style>
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { font-size: 14px; margin-bottom: 12px; line-height: 1.5; }
  .meta b { font-size: 16px; }
  #map { height: 320px; width: 100%; margin: 0 0 16px; border: 1px solid #ccc; border-radius: 6px; }
  ol { list-style: none; padding: 0; margin: 0; font-size: 15px; }
  li { padding: 8px 4px; border-bottom: 1px solid #ccc; }
  li.depot { font-weight: bold; }
  .n { display: inline-block; width: 1.8em; font-weight: bold; }
  .v { color: #444; }
  .pin { background: #1f6feb; color: #fff; border-radius: 50%; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center; font: bold 12px sans-serif; }
  .pin.depot { background: #111; width: 26px; height: 26px; border-radius: 6px; font-size: 14px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Feuille de tournée</h1>
  <div class="meta"><b>${esc(nom)}</b>${tel}<br>Date : ${esc(formatDateFr(tournee.date))}${
    total ? `<br>Total : ${esc(total)}` : ''
  }</div>
  <div id="map"></div>
  <ol>
    <li class="depot">🏭 Départ — ${esc(depotLine)}</li>
    ${rows}
    <li class="depot">🏭 Retour — ${esc(depotLine)}</li>
  </ol>
  <script src="${LEAFLET_JS}"></script>
  ${mapScript(tournee)}
</body></html>`
}

/** Ouvre une fenêtre isolée ; le script embarqué imprime une fois la carte rendue. */
export function printTourneeSheet(tournee: Tournee, livreur: LivreurWithColor | undefined): void {
  const html = buildSheetHtml(tournee, livreur)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
}
