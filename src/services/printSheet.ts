import type { Tournee } from '../types'
import type { LivreurWithColor } from '../state/LivreurContext'
import { DEPOT } from '../data/depot'

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
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { font-size: 14px; margin-bottom: 16px; line-height: 1.5; }
  .meta b { font-size: 16px; }
  ol { list-style: none; padding: 0; margin: 0; font-size: 15px; }
  li { padding: 8px 4px; border-bottom: 1px solid #ccc; }
  li.depot { font-weight: bold; }
  .n { display: inline-block; width: 1.8em; font-weight: bold; }
  .v { color: #444; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Feuille de tournée</h1>
  <div class="meta"><b>${esc(nom)}</b>${tel}<br>Date : ${esc(formatDateFr(tournee.date))}${
    total ? `<br>Total : ${esc(total)}` : ''
  }</div>
  <ol>
    <li class="depot">🏭 Départ — ${esc(depotLine)}</li>
    ${rows}
    <li class="depot">🏭 Retour — ${esc(depotLine)}</li>
  </ol>
</body></html>`
}

/** Ouvre une fenêtre isolée et lance l'impression. Déclenché par un clic utilisateur. */
export function printTourneeSheet(tournee: Tournee, livreur: LivreurWithColor | undefined): void {
  const html = buildSheetHtml(tournee, livreur)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}
