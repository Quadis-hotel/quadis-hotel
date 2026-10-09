import { getApiUrl, describeApiFailure } from '../config/api'

/**
 * Guest accounts. Until this existed, Login and Register validated their
 * fields, showed "success" and created nothing at all.
 */

export interface AccountUser {
  id: string
  full_name: string
  email: string
  phone?: string
}

const TOKEN_KEY = 'quadis_session'

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // private mode / storage disabled
  }
}

const setToken = (t: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, t)
  } catch {
    // Storage unavailable — the session lasts this page view only.
  }
}

export const signOut = () => {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Surfaces the server's own field message rather than a generic failure. */
async function post(path: string, body: unknown): Promise<{ token: string; user: AccountUser }> {
  let res: Response
  try {
    res = await fetch(getApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(describeApiFailure())
  }

  // A static host answering /api serves index.html, so this is HTML, not JSON.
  // Say that plainly instead of surfacing a JSON parse error to the guest.
  const json = await res.json().catch(() => null)
  if (json === null) {
    throw new Error(describeApiFailure(res.status))
  }

  if (!res.ok || !json?.success) {
    const fieldErrors = json?.details ? Object.values(json.details).flat().filter(Boolean) : []
    throw new Error((fieldErrors[0] as string) || json?.error || describeApiFailure(res.status))
  }

  setToken(json.token)
  return { token: json.token, user: json.data }
}

export const register = (input: {
  fullName: string
  email: string
  phone?: string
  password: string
}) => post('auth/register', input)

export const login = (input: { email: string; password: string }) => post('auth/login', input)

/** Resolves the signed-in user, or null if the session is missing or expired. */
export async function currentUser(): Promise<AccountUser | null> {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(getApiUrl('auth/me'), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      signOut() // expired or revoked — don't keep a dead token around
      return null
    }
    const json = await res.json()
    return json?.data ?? null
  } catch {
    return null
  }
}

export interface AccountBooking {
  booking_code: string
  property_name: string
  property_address: string
  property_slug: string
  room_type_name: string
  check_in: string
  check_out: string
  rooms_count: number
  guests_count: number
  total_amount: number
  booking_status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  created_at: string
}

export async function myBookings(): Promise<AccountBooking[]> {
  const token = getToken()
  if (!token) return []
  const res = await fetch(getApiUrl('auth/bookings'), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    if (res.status === 401) signOut()
    throw new Error('Could not load your bookings')
  }
  const json = await res.json()
  return json?.data ?? []
}
