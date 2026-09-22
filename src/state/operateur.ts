const CLE = 'livreur:v3:operateur'

/** Identité déclarative du poste. Non vérifiée : sert à tracer, pas à sécuriser. */
export function getOperateur(): string {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '""') as string
  } catch {
    return ''
  }
}

export function setOperateur(nom: string): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(nom))
  } catch {
    /* mode privé : on continue sans mémoriser */
  }
}
