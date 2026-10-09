import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHotels, CITIES } from '../data/hotels.ts'
import { todayIso, nextDay, buildStayParams } from '../data/stay.ts'

// §4 booking bar. Whatever the guest picks here travels with them to the hotel
// page and into checkout via the query string — see data/stay.ts.
function Stepper({ label, hint, value, setValue, min, max }: {
  label: string; hint?: string; value: number; setValue: (n: number) => void; min: number; max: number
}) {
  return (
    <div className="bbar__field">
      <span className="bbar__label">
        {label}
        {hint && <span className="bbar__hint"> {hint}</span>}
      </span>
      <div className="stepper">
        <button type="button" onClick={() => setValue(Math.max(min, value - 1))} aria-label={`Decrease ${label}`} disabled={value <= min}>−</button>
        <span className="stepper__val" aria-live="polite">{value}</span>
        <button type="button" onClick={() => setValue(Math.min(max, value + 1))} aria-label={`Increase ${label}`} disabled={value >= max}>+</button>
      </div>
    </div>
  )
}

export default function BookingBar({ overlap = true }: { overlap?: boolean }) {
  const nav = useNavigate()
  const hotels = useHotels()
  const [dest, setDest] = useState('All')
  const [checkin, setCheckin] = useState('')
  const [checkout, setCheckout] = useState('')
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)

  const today = todayIso()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const p = buildStayParams({ checkin, checkout, adults, children })

    if (dest !== 'All') {
      const hotel = hotels.find((h) => h.slug === dest)
      // Picking a named hotel goes straight to its page with the stay attached,
      // so the guest is never asked for dates they have already given us.
      if (hotel) {
        nav(`/hotels/${hotel.slug}?${p.toString()}`)
        return
      }
      p.set('city', dest)
    }

    nav(`/hotels?${p.toString()}`)
  }

  return (
    <form className={`bbar ${overlap ? 'bbar--overlap' : ''}`} onSubmit={submit} aria-label="Search stays">
      {/* Source order is desktop order. On mobile the dates are pulled above the
          destination select in CSS — they are what the guest came to fill in. */}
      <div className="bbar__field bbar__dest">
        <label className="bbar__label" htmlFor="bbar-dest">Destination</label>
        <select id="bbar-dest" className="bbar__input" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="All">All properties</option>
          {CITIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          <optgroup label="By hotel">
            {hotels.map((h) => (<option key={h.slug} value={h.slug}>{h.name}</option>))}
          </optgroup>
        </select>
      </div>

      <div className="bbar__field bbar__date bbar__date--in">
        <label className="bbar__label" htmlFor="bbar-in">Check In</label>
        <input
          id="bbar-in"
          type="date"
          className="bbar__input"
          value={checkin}
          min={today}
          onChange={(e) => {
            setCheckin(e.target.value)
            // A check-out at or before the new check-in is now impossible.
            if (checkout && e.target.value && e.target.value >= checkout) setCheckout('')
          }}
        />
      </div>

      <div className="bbar__field bbar__date bbar__date--out">
        <label className="bbar__label" htmlFor="bbar-out">Check Out</label>
        {/* min is the day AFTER check-in. A same-day range is zero nights, which
            the server rejects — so it must not be selectable in the first place. */}
        <input
          id="bbar-out"
          type="date"
          className="bbar__input"
          value={checkout}
          min={checkin ? nextDay(checkin) : today}
          onChange={(e) => setCheckout(e.target.value)}
        />
      </div>

      <Stepper label="Adults" value={adults} setValue={setAdults} min={1} max={12} />
      <Stepper label="Children" hint="0–17 yrs" value={children} setValue={setChildren} min={0} max={8} />

      <button type="submit" className="bbar__search">SEARCH STAYS</button>
    </form>
  )
}
