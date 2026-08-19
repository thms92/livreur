/**
 * Pastille du mode d'itinéraire. Toujours affichée, dans les deux états :
 * une absence de pastille se confondrait avec une information manquante.
 */
export function PeageBadge({ sansPeage }: { sansPeage?: boolean }) {
  const sans = sansPeage ?? true
  return (
    <span className={`peage-badge ${sans ? 'peage-sans' : 'peage-avec'}`}>
      {sans ? 'Sans péage' : 'Avec péage'}
    </span>
  )
}
