/** Tiny typed localStorage helpers used for connection + conversation state. */

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable (private mode, quota); degrade silently.
  }
}

export const STORAGE_KEYS = {
  connection: 'bapX-admin:connection',
  conversations: 'bapX-admin:conversations',
  preferences: 'bapX-admin:preferences',
} as const
