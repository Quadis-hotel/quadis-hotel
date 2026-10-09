import { Link } from 'react-router-dom'
import { useState, useId } from 'react'
import type { ReactNode, MouseEventHandler, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { IconPin, IconStar } from './icons.tsx'
import { imagesForHotel } from '../data/images.ts'
import { Photo } from './media.tsx'
import { priceNight } from '../data/hotels.ts'
import type { Hotel } from '../types.ts'

/* ---------- Button (§4) ---------- */
type ButtonVariant = 'primary' | 'ghost' | 'gold'
interface ButtonProps {
  as?: 'button' | 'a'
  to?: string
  href?: string
  variant?: ButtonVariant
  className?: string
  style?: React.CSSProperties
  children: ReactNode
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLElement>
  target?: string
  rel?: string
}
export function Button({ as = 'button', to, href, variant = 'primary', className = '', style, children, type, disabled, onClick, target, rel }: ButtonProps) {
  const cls = `btn btn--${variant} ${className}`.trim()
  if (to) return <Link to={to} className={cls} style={style} onClick={onClick} target={target} rel={rel}>{children}</Link>
  if (href) return <a href={href} className={cls} style={style} onClick={onClick} target={target} rel={rel}>{children}</a>
  if (as === 'a') return <a className={cls} style={style} onClick={onClick} target={target} rel={rel}>{children}</a>
  return <button className={cls} style={style} type={type ?? 'button'} disabled={disabled} onClick={onClick}>{children}</button>
}

/* ---------- Brand mark ----------
   The official wordmark. All three call sites — header, footer and the auth
   screens — sit on dark grounds, so the cream single-colour file is correct for
   every one of them. Swapping artwork is a one-line change here.

   The set also ships an -ink variant for cream/white grounds and a
   -currentcolor variant for inlining; both live in public/logo/.

   Per the asset README: minimum width for the horizontal mark is 96px, and
   clear space on all four sides equals the cap height of the HOTELS row —
   both enforced in the .wordmark rules in chrome.css. */
type LogoVariant = 'header' | 'footer' | 'auth'

const LOGO_SRC = '/logo/quadis-wordmark-cream.svg'

export function Logo({ variant = 'header', className = '' }: { variant?: LogoVariant; className?: string }) {
  const mark = (
    <img
      className="wordmark__img"
      src={LOGO_SRC}
      alt="Quadis Hotels"
      width={223}
      height={64}
      /* Eager + high priority: this is the LCP element in the header. */
      fetchPriority="high"
    />
  )
  const cls = `wordmark ${variant === 'header' ? '' : `wordmark--${variant}`} ${className}`.trim()

  // The auth screens already sit inside a heading block, so the mark is
  // decorative there rather than a second link home.
  if (variant === 'auth') return <span className={cls}>{mark}</span>
  return (
    <Link to="/" className={cls} aria-label="Quadis Hotels — home">
      {mark}
    </Link>
  )
}

/* ---------- Section header (§4) ---------- */
interface SectionHeaderProps {
  overline?: string
  title: string
  flank?: boolean
  align?: 'center' | 'left'
  onDark?: boolean
}
export function SectionHeader({ overline, title, flank = true, align = 'center', onDark = false }: SectionHeaderProps) {
  return (
    <div className={`section-header ${align === 'center' ? 'center-col' : ''}`}>
      {overline && <span className={`overline ${onDark ? 'on-dark' : ''}`}>{overline}</span>}
      {flank && align === 'center' ? (
        <div className="section-header__flanked">
          <span className="rule" aria-hidden="true" />
          <h2 className={`h2 ${onDark ? 'on-dark' : ''}`}>{title}</h2>
          <span className="rule" aria-hidden="true" />
        </div>
      ) : (
        <h2 className={`h2 ${onDark ? 'on-dark' : ''}`}>{title}</h2>
      )}
    </div>
  )
}

/* ---------- Field (§4 input) ---------- */
type FieldBase = {
  label?: string
  error?: string | undefined
  hint?: string
  id?: string
  className?: string
  children?: ReactNode
}
type FieldProps =
  | (FieldBase & { as?: 'input' } & InputHTMLAttributes<HTMLInputElement>)
  | (FieldBase & { as: 'select' } & SelectHTMLAttributes<HTMLSelectElement>)
  | (FieldBase & { as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>)

export function Field(props: FieldProps) {
  const { label, error, hint, as = 'input', children, id, className = '', ...rest } = props as FieldBase & { as?: string } & Record<string, unknown>
  const auto = useId()
  const fid = id || auto
  const common = { id: fid, className: `field__input ${error ? 'is-error' : ''}`, 'aria-invalid': !!error }
  return (
    <div className={`field ${className}`}>
      {label && <label className="field__label" htmlFor={fid}>{label}</label>}
      {as === 'select' ? (
        <select {...common} {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}>{children}</select>
      ) : as === 'textarea' ? (
        <textarea {...common} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...common} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {error && <span className="field__error" role="alert">{error}</span>}
      {hint && !error && <span className="field__hint">{hint}</span>}
    </div>
  )
}

/* ---------- Password field with eye toggle ---------- */
type PasswordFieldProps = { label?: string; error?: string | undefined } & InputHTMLAttributes<HTMLInputElement>
export function PasswordField({ label, error, ...rest }: PasswordFieldProps) {
  const [show, setShow] = useState(false)
  const fid = useId()
  return (
    <div className="field">
      {label && <label className="field__label" htmlFor={fid}>{label}</label>}
      <div className="field__pw">
        <input id={fid} type={show ? 'text' : 'password'} className={`field__input ${error ? 'is-error' : ''}`} aria-invalid={!!error} {...rest} />
        <button type="button" className="field__eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
          <EyeGlyph show={show} />
        </button>
      </div>
      {error && <span className="field__error" role="alert">{error}</span>}
    </div>
  )
}
function EyeGlyph({ show }: { show: boolean }) {
  return show
    ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.4 5.2A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4M6.6 6.6A17.6 17.6 0 0 0 2 12s4 7 10 7a10.4 10.4 0 0 0 3.4-.6" /></svg>)
    : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>)
}

/* ---------- Filter pills (§4) ---------- */
interface FilterPillsProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}
export function FilterPills<T extends string>({ options, value, onChange, ariaLabel = 'Filter' }: FilterPillsProps<T>) {
  return (
    <div className="pills" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`pill ${value === opt ? 'is-active' : ''}`}
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/* ---------- Hotel card (§4) ---------- */
/**
 * `stayQuery` is the guest's dates and party, already encoded (see data/stay.ts).
 * It rides along on both links so clicking through to a property carries the
 * search forward instead of dropping it.
 */
export function HotelCard({ hotel, stayQuery = '' }: { hotel: Hotel; stayQuery?: string }) {
  const img = imagesForHotel(hotel)[0]
  const href = stayQuery ? `/hotels/${hotel.slug}?${stayQuery}` : `/hotels/${hotel.slug}`
  return (
    <article className="hcard">
      <Link to={href} className="hcard__media" aria-label={`${hotel.name}, ${hotel.city}`}>
        <span className="hcard__chip">{hotel.city}</span>
        {/* Was hotel.tierLabel, which is 'Quadis Central' on all nine properties
            — every card read the same. Client asked for the property name. */}
        <span className="hcard__tier">{hotel.name}</span>
        <Photo src={img} ratio="4 / 3" label={hotel.name} alt={`${hotel.name} — ${hotel.area}, ${hotel.city}`} />
      </Link>
      <div className="hcard__body">
        <h3 className="h3 hcard__name">{hotel.name}</h3>
        <p className="hcard__addr"><IconPin /> <span>{hotel.address}</span></p>
        <div className="hcard__foot">
          <span className="hcard__price">{priceNight(hotel.price)}</span>
          <span className="hcard__rating"><IconStar />{' '}{hotel.rating.toFixed(1)}</span>
        </div>
        <Button to={href} variant="ghost" className="hcard__cta">VIEW &amp; BOOK</Button>
      </div>
    </article>
  )
}
