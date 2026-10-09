import { useEffect, useState } from 'react'
import { currentUser, signOut as clearToken, getToken, type AccountUser } from './auth'

/**
 * Shared sign-in state. A module-level cache plus listeners keeps the header and
 * the account page in step without a context provider.
 */
let cached: AccountUser | null = null
let resolved = false
const listeners = new Set<() => void>()

const broadcast = () => listeners.forEach((l) => l())

export function refreshSession(): Promise<void> {
  return currentUser().then((u) => {
    cached = u
    resolved = true
    broadcast()
  })
}

export function endSession() {
  clearToken()
  cached = null
  resolved = true
  broadcast()
}

export function useSession() {
  const [user, setUser] = useState<AccountUser | null>(cached)
  const [ready, setReady] = useState(resolved)

  useEffect(() => {
    const listener = () => {
      setUser(cached)
      setReady(true)
    }
    listeners.add(listener)

    // Only hit the network when a token actually exists.
    if (!resolved) {
      if (getToken()) refreshSession()
      else {
        resolved = true
        broadcast()
      }
    }
    return () => { listeners.delete(listener) }
  }, [])

  return { user, ready, signOut: endSession }
}
