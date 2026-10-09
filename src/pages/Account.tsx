import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { myBookings, type AccountBooking } from '../data/auth.ts'
import { useSession } from '../data/useSession.ts'
import { inr } from '../data/hotels.ts'
import { SectionHeader } from '../components/blocks.tsx'
import { Button } from '../components/ui.tsx'
import Seo from '../components/Seo.tsx'

const STATUS_LABEL: Record<AccountBooking['booking_status'], string> = {
  CONFIRMED: 'Confirmed',
  PENDING_PAYMENT: 'Awaiting payment',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Account() {
  const { user, ready, signOut } = useSession()
  const nav = useNavigate()

  const [bookings, setBookings] = useState<AccountBooking[] | null>(null)
  const [error, setError] = useState('')

  // Signed out — nothing on this page belongs to anyone.
  useEffect(() => {
    if (ready && !user) nav('/login', { replace: true })
  }, [ready, user, nav])

  useEffect(() => {
    if (!user) return
    myBookings()
      .then(setBookings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your bookings'))
  }, [user])

  if (!ready || !user) return null

  return (
    <>
      <Seo
        title="My Account"
        description="View and manage your Quadis Hotels bookings."
        noIndex
      />
      <section className="section bg-cream">
        <div className="container">
          <SectionHeader overline="YOUR ACCOUNT" title={`Welcome, ${user.full_name.split(' ')[0]}`} />

          <div className="account__head">
            <p className="meta">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
            <button className="btn btn--ghost btn--sm" onClick={() => { signOut(); nav('/') }}>Sign out</button>
          </div>

          <h2 className="h3 account__title">Your bookings</h2>

          {error && <p className="form-error" role="alert">{error}</p>}

          {bookings === null && !error && <p className="meta">Loading your bookings…</p>}

          {bookings?.length === 0 && (
            <div className="account__empty">
              <p className="lead">You haven&rsquo;t booked with us yet.</p>
              <Button to="/hotels" variant="primary">BROWSE HOTELS</Button>
            </div>
          )}

          {!!bookings?.length && (
            <ul className="account__list">
              {bookings.map((b) => (
                <li className="account__booking" key={b.booking_code}>
                  <div className="account__booking-main">
                    <span className={`account__status account__status--${b.booking_status.toLowerCase()}`}>
                      {STATUS_LABEL[b.booking_status]}
                    </span>
                    <h3 className="h4">
                      <Link to={`/hotels/${b.property_slug}`}>{b.property_name}</Link>
                    </h3>
                    <p className="meta">{b.room_type_name} · {b.rooms_count} room{b.rooms_count > 1 ? 's' : ''} · {b.guests_count} guests</p>
                    <p className="meta">{fmt(b.check_in)} → {fmt(b.check_out)}</p>
                  </div>
                  <div className="account__booking-side">
                    <strong className="account__amount">{inr(b.total_amount)}</strong>
                    <span className="meta">Ref {b.booking_code}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
