import { useEffect, useRef, useState, useMemo } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useHotels, BANQUETS } from '../data/hotels.ts'
import { IconChevron } from './icons.tsx'
import { Button, Logo } from './ui.tsx'
import { useSession } from '../data/useSession.ts'

interface MenuItem { label: string; to: string }
const BANQUET_MENU: MenuItem[] = BANQUETS.map((b) => ({ label: b.name, to: `/banquets/${b.slug}` }))
const RESTAURANT_MENU: MenuItem[] = [
  { label: 'In-house Restaurant', to: '/restaurant' },
  { label: 'Outdoor Catering Service', to: '/restaurant/outdoor-catering-service' },
]

function Dropdown({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLLIElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const enter = () => { clearTimeout(closeTimer.current); setOpen(true) }
  const leave = () => { closeTimer.current = setTimeout(() => setOpen(false), 120) }

  return (
    <li className="nav__item" ref={ref} onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        className="nav__link nav__toggle"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
      >
        {label} <IconChevron className={`nav__chev ${open ? 'is-open' : ''}`} />
      </button>
      <ul className={`dropdown ${open ? 'is-open' : ''}`} role="menu">
        {items.map((it) => (
          <li key={it.to} role="none">
            <Link role="menuitem" to={it.to} className="dropdown__item" onClick={() => setOpen(false)}>{it.label}</Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

function MobileGroup({ id, label, items, open, setOpen }: {
  id: string; label: string; items: MenuItem[]; open: string | null; setOpen: (v: string | null) => void
}) {
  const isOpen = open === id
  return (
    <li className="drawer__group">
      <button className="drawer__link drawer__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        {label} <IconChevron className={`nav__chev ${isOpen ? 'is-open' : ''}`} />
      </button>
      {isOpen && (
        <ul className="drawer__sub">
          {items.map((it) => (<li key={it.to}><Link to={it.to} className="drawer__sublink">{it.label}</Link></li>))}
        </ul>
      )}
    </li>
  )
}

export default function Header() {
  const [drawer, setDrawer] = useState(false)
  const [openMobile, setOpenMobile] = useState<string | null>(null)
  const loc = useLocation()
  const { user } = useSession()
  
  const hotels = useHotels()
  const HOTEL_MENU = useMemo<MenuItem[]>(() => [
    ...hotels.map((h) => ({ label: h.name, to: `/hotels/${h.slug}` })),
    { label: 'Upcoming Destinations (Rishikesh, Agra...)', to: '/hotels#upcoming' },
  ], [hotels])

  useEffect(() => { setDrawer(false); setOpenMobile(null) }, [loc.pathname])
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])

  return (
    <header className="nav">
      <div className="container nav__inner">
        <Logo variant="header" />

        <nav className="nav__center" aria-label="Primary">
          <ul className="nav__list">
            <li className="nav__item"><NavLink to="/" end className="nav__link">Home</NavLink></li>
            <li className="nav__item"><NavLink to="/about-us" className="nav__link">About</NavLink></li>
            <li className="nav__item"><NavLink to="/virtual-tour" className="nav__link">Virtual Tour</NavLink></li>
            <li className="nav__item"><NavLink to="/gallery" className="nav__link">Gallery</NavLink></li>
            <Dropdown label="Hotels" items={HOTEL_MENU} />
            <Dropdown label="Banquet" items={BANQUET_MENU} />
            <li className="nav__item"><NavLink to="/corporate-hotel-booking" className="nav__link">Corporate Booking</NavLink></li>
            <Dropdown label="Restaurant" items={RESTAURANT_MENU} />
            <li className="nav__item"><NavLink to="/contact" className="nav__link">Contact</NavLink></li>
          </ul>
        </nav>

        <div className="nav__right">
          {user ? (
            <Button to="/account" variant="gold" className="nav__login">{user.full_name.split(' ')[0]}</Button>
          ) : (
            <>
              <Button to="/register" variant="ghost" className="nav__register">Register</Button>
              <Button to="/login" variant="gold" className="nav__login">Login</Button>
            </>
          )}
        </div>

        <button
          className="nav__burger"
          aria-label={drawer ? 'Close menu' : 'Open menu'}
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
        >
          <span className={drawer ? 'is-x' : ''} />
        </button>
      </div>

      <div className={`drawer ${drawer ? 'is-open' : ''}`} role="dialog" aria-label="Menu" aria-hidden={!drawer}>
        <ul className="drawer__list">
          <li><Link to="/" className="drawer__link">Home</Link></li>
          <li><Link to="/about-us" className="drawer__link">About</Link></li>
          <li><Link to="/virtual-tour" className="drawer__link">Virtual Tour</Link></li>
          <li><Link to="/gallery" className="drawer__link">Gallery</Link></li>
          <MobileGroup id="hotels" label="Hotels" items={HOTEL_MENU} open={openMobile} setOpen={setOpenMobile} />
          <MobileGroup id="banquet" label="Banquet" items={BANQUET_MENU} open={openMobile} setOpen={setOpenMobile} />
          <li><Link to="/corporate-hotel-booking" className="drawer__link">Corporate Booking</Link></li>
          <MobileGroup id="restaurant" label="Restaurant" items={RESTAURANT_MENU} open={openMobile} setOpen={setOpenMobile} />
          <li><Link to="/contact" className="drawer__link">Contact</Link></li>
        </ul>
        <div className="drawer__actions">
          {user ? (
            <Button to="/account" variant="gold">My account</Button>
          ) : (
            <>
              <Button to="/register" variant="ghost">Register</Button>
              <Button to="/login" variant="gold">Login</Button>
            </>
          )}
        </div>
      </div>
      {drawer && <button className="drawer__scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}
    </header>
  )
}
