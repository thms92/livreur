/**
 * Résolution de l'ordre de visite (TSP) sur une matrice de coûts.
 *
 * Le nœud 0 est le dépôt : le trajet en part et y revient. Les nœuds 1..n sont
 * les arrêts. La fonction renvoie l'ordre de visite des arrêts, dépôt exclu.
 *
 * Heuristique en deux temps — plus proche voisin pour une première tournée,
 * puis 2-opt pour défaire les croisements qu'elle laisse derrière elle. Sur la
 * quinzaine de points d'une tournée réelle, c'est instantané et le résultat est
 * à quelques pourcents de l'optimum.
 */
export function ordreOptimise(matrice: number[][]): number[] {
  const n = matrice.length - 1 // nombre d'arrêts, dépôt exclu
  if (n <= 0) return []
  if (n === 1) return [1]

  // --- Plus proche voisin, au départ du dépôt ---
  const restants = new Set<number>()
  for (let i = 1; i <= n; i++) restants.add(i)
  let courant = 0
  const ordre: number[] = []
  while (restants.size) {
    let meilleur = -1
    let meilleurCout = Infinity
    for (const i of restants) {
      if (matrice[courant][i] < meilleurCout) {
        meilleurCout = matrice[courant][i]
        meilleur = i
      }
    }
    ordre.push(meilleur)
    restants.delete(meilleur)
    courant = meilleur
  }

  // --- 2-opt : on inverse un segment tant que ça raccourcit le cycle ---
  const cout = (cycle: number[]) => {
    let t = 0
    for (let i = 0; i < cycle.length - 1; i++) t += matrice[cycle[i]][cycle[i + 1]]
    return t
  }
  let cycle = [0, ...ordre, 0]
  let ameliore = true
  while (ameliore) {
    ameliore = false
    // i et k restent dans les arrêts : les deux extrémités (le dépôt) sont figées.
    for (let i = 1; i < cycle.length - 2 && !ameliore; i++) {
      for (let k = i + 1; k < cycle.length - 1; k++) {
        const essai = [
          ...cycle.slice(0, i),
          ...cycle.slice(i, k + 1).reverse(),
          ...cycle.slice(k + 1),
        ]
        if (cout(essai) < cout(cycle) - 1e-9) {
          cycle = essai
          ameliore = true
          break
        }
      }
    }
  }
  return cycle.slice(1, -1)
}
