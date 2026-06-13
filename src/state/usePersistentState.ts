import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'livreur:'

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, initial))
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* quota / mode privé : on ignore */
    }
  }, [key, value])
  return [value, setValue]
}
