/**
 * A stay occupies the nights between check-in and check-out, not the checkout
 * date itself: 1st → 3rd is two nights, the 1st and the 2nd. Getting this wrong
 * either blocks a room the morning it frees up, or oversells the last night.
 */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = []
  const end = new Date(`${checkIn.slice(0, 10)}T00:00:00Z`)
  const cursor = new Date(`${checkIn.slice(0, 10)}T00:00:00Z`)
  end.setTime(new Date(`${checkOut.slice(0, 10)}T00:00:00Z`).getTime())

  while (cursor < end) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/** Today in UTC as YYYY-MM-DD, used for "available right now" displays. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
