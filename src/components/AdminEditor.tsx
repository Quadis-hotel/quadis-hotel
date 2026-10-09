import { useState, useEffect, useRef } from 'react'
import { DEFAULT_CONTENT, refreshContent } from '../data/content.ts'
import { getApiUrl } from '../config/api'
import { MEAL_PLAN_UPLIFT_PERCENT, baseRoomRateFor, mealUpliftFor } from '../lib/pricing.ts'
import type { MealPlan } from '../types.ts'

/**
 * The editing half of the admin panel.
 *
 * Three things a hotel manager should be able to change without a developer:
 *  1. the property record — name, address, contact, nightly rate, rating, live/paused
 *  2. each room category — its rate, bed count, inventory (meal plans are
 *     group-wide percentages since 5 Aug 2026, so they are shown, not edited)
 *  3. the marketing copy blocks registered in data/content.ts
 *
 * Editing is deliberately explicit: a form per record with its own Save. There
 * is no autosave, because these fields set the price a guest is charged and a
 * stray keystroke should not reprice the hotel.
 */

export interface EditableProperty {
  id: string
  name: string
  slug: string
  city: string
  address?: string
  phone?: string
  whatsapp?: string
  email?: string
  base_price: number
  rating?: number
  is_active?: boolean
  weekend_surcharge_percent?: number
  extra_adult_percent?: number
  child_free_under_age?: number
  child_percent?: number
  adult_from_age?: number
}

export interface EditableRoom {
  id: string
  name: string
  slug: string
  description?: string
  size_sqft?: string
  bed_type?: string
  max_guests?: number
  price_offset: number
  breakfast_offset?: number
  all_meals_offset?: number
  total_units: number
  available_units: number
  is_available: boolean
}

export interface EditablePropertyItem {
  property: EditableProperty
  rooms: EditableRoom[]
}

type AuthedFetch = (endpoint: string, init?: RequestInit) => Promise<any>

const s = {
  panel: { background: '#1c1917', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' } as const,
  h2: { fontSize: '1.1rem', fontWeight: 800, margin: '0 0 .25rem' } as const,
  hint: { color: '#a8a29e', fontSize: '.82rem', margin: '0 0 1rem', lineHeight: 1.5 } as const,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' } as const,
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.75rem', color: '#a8a29e', letterSpacing: '.04em' } as const,
  input: {
    padding: '.6rem .7rem', borderRadius: '6px', border: '1px solid #44403c',
    background: '#292524', color: '#f5f5f4', fontSize: '.9rem', width: '100%',
  } as const,
  textarea: {
    padding: '.6rem .7rem', borderRadius: '6px', border: '1px solid #44403c',
    background: '#292524', color: '#f5f5f4', fontSize: '.9rem', width: '100%',
    minHeight: '84px', resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5,
  } as const,
  save: {
    marginTop: '.85rem', padding: '.55rem 1.1rem', borderRadius: '6px', border: 'none',
    background: '#d97706', color: '#0c0a09', fontWeight: 700, fontSize: '.82rem',
    letterSpacing: '.06em', cursor: 'pointer',
  } as const,
  record: { border: '1px solid #292524', borderRadius: '8px', padding: '1rem', marginBottom: '.85rem' } as const,
  recordHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.75rem', marginBottom: '.75rem' } as const,
  ok: { color: '#4ade80', fontSize: '.8rem', marginLeft: '.75rem' } as const,
  err: { color: '#f87171', fontSize: '.8rem', marginLeft: '.75rem' } as const,
  sectionTitle: { fontSize: '.72rem', letterSpacing: '.14em', color: '#d97706', fontWeight: 700, margin: '1.25rem 0 .5rem' } as const,
}

/** Number input that keeps an empty box empty instead of snapping it to 0. */
function NumField({ label, value, onChange, step = '1', min = '0' }: {
  label: string; value: number | undefined; onChange: (n: number) => void; step?: string; min?: string
}) {
  return (
    <label style={s.label}>
      {label}
      <input
        style={s.input}
        type="number"
        step={step}
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label style={s.label}>
      {label}
      <input style={s.input} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function useSaveState() {
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })

  // Clear the confirmation after a few seconds so a stale "Saved" can't be
  // mistaken for confirmation of a later, unsaved edit.
  useEffect(() => {
    if (status.kind !== 'ok') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 4000)
    return () => clearTimeout(t)
  }, [status.kind])

  return [status, setStatus] as const
}

/* ---------- Property ---------- */

function PropertyForm({ item, authedFetch, onSaved }: {
  item: EditablePropertyItem; authedFetch: AuthedFetch; onSaved: () => void
}) {
  const [draft, setDraft] = useState<EditableProperty>(item.property)
  const [status, setStatus] = useSaveState()

  // Re-seed when the dashboard reloads from the server.
  useEffect(() => { setDraft(item.property) }, [item.property])

  const set = <K extends keyof EditableProperty>(k: K) => (v: EditableProperty[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const save = async () => {
    setStatus({ kind: 'saving' })
    try {
      await authedFetch(`admin/properties/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          address: draft.address,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          email: draft.email,
          base_price: Number(draft.base_price),
          rating: Number(draft.rating),
          is_active: !!draft.is_active,
          weekend_surcharge_percent: Number(draft.weekend_surcharge_percent ?? 0),
          extra_adult_percent: Number(draft.extra_adult_percent ?? 0),
          child_free_under_age: Number(draft.child_free_under_age ?? 8),
          child_percent: Number(draft.child_percent ?? 20),
          adult_from_age: Number(draft.adult_from_age ?? 13),
        }),
      })
      setStatus({ kind: 'ok' })
      onSaved()
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  return (
    <div style={s.record}>
      <div style={s.recordHead}>
        <strong style={{ fontSize: '.95rem' }}>{item.property.name}</strong>
        <label style={{ ...s.label, flexDirection: 'row', alignItems: 'center', gap: '.4rem' }}>
          <input type="checkbox" checked={!!draft.is_active} onChange={(e) => set('is_active')(e.target.checked)} />
          Live on the website
        </label>
      </div>

      <div style={s.grid}>
        <TextField label="Hotel name" value={draft.name} onChange={set('name')} />
        <TextField label="Address" value={draft.address} onChange={set('address')} />
        <TextField label="Phone" value={draft.phone} onChange={set('phone')} />
        <TextField label="WhatsApp" value={draft.whatsapp} onChange={set('whatsapp')} />
        <TextField label="Email" value={draft.email} onChange={set('email')} />
        <NumField label="Base rate / night (₹)" value={draft.base_price} onChange={set('base_price')} />
        <NumField label="Rating (0–5)" value={draft.rating} onChange={set('rating')} step="0.1" />
        <NumField label="Weekend surcharge (%)" value={draft.weekend_surcharge_percent} onChange={set('weekend_surcharge_percent')} />
      </div>

      {/* Occupancy policy. These two set the triple-occupancy rate directly —
          they are what a guest is charged, so they are labelled in plain words
          rather than in the field names the database uses. */}
      <div style={{ ...s.sectionTitle, marginBottom: '.5rem' }}>OCCUPANCY &amp; EXTRA GUESTS</div>
      {/* Rewritten 5 Aug 2026. This paragraph still described the pre-27-Jul
          model — "a child adds nothing, leave the age at 18 so no child is ever
          charged" — which the client replaced with three age bands on 27 Jul,
          and which the three fields directly beneath it already implement. A
          manager reading it would have set the policy backwards while believing
          the form agreed with them. */}
      <p style={{ ...s.hint, margin: '0 0 .6rem' }}>
        Every rate covers <strong>2 adults per room</strong>. A 3rd <strong>adult</strong> adds
        the triple-occupancy percentage to the room rate for each night. Children go in
        three bands: free below the first age, charged the child percentage up to the
        second, and charged as an adult from it.
      </p>
      <div style={s.grid}>
        <NumField label="Triple occupancy uplift (%)" value={draft.extra_adult_percent} onChange={set('extra_adult_percent')} step="1" />
        <NumField label="Stays free under age" value={draft.child_free_under_age} onChange={set('child_free_under_age')} />
        <NumField label="Child uplift (%)" value={draft.child_percent} onChange={set('child_percent')} />
        <NumField label="Charged as adult from age" value={draft.adult_from_age} onChange={set('adult_from_age')} />
      </div>
      {/* Worked example, so a manager sees the rupee effect of the percentage
          they just typed without doing the arithmetic themselves. */}
      <p style={{ ...s.hint, margin: '.5rem 0 0' }}>
        At {Number(draft.extra_adult_percent ?? 0)}%, this hotel&rsquo;s ₹
        {Number(draft.base_price || 0).toLocaleString('en-IN')} room costs{' '}
        <strong>
          ₹{Math.round(Number(draft.base_price || 0) * (1 + Number(draft.extra_adult_percent ?? 0) / 100)).toLocaleString('en-IN')}
        </strong>{' '}
        per night for 3 adults.
      </p>

      <button style={s.save} onClick={save} disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'SAVING…' : 'SAVE HOTEL'}
      </button>
      {status.kind === 'ok' && <span style={s.ok}>Saved</span>}
      {status.kind === 'err' && <span style={s.err}>{status.msg}</span>}
    </div>
  )
}

/* ---------- Room category ---------- */

function RoomForm({ room, propertyName, propertyBasePrice, authedFetch, onSaved }: {
  room: EditableRoom; propertyName: string; propertyBasePrice: number; authedFetch: AuthedFetch; onSaved: () => void
}) {
  const [draft, setDraft] = useState<EditableRoom>(room)
  const [status, setStatus] = useSaveState()

  useEffect(() => { setDraft(room) }, [room])

  const set = <K extends keyof EditableRoom>(k: K) => (v: EditableRoom[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  // Tracks the draft, not the saved row, so editing "Rate above base" updates
  // the meal figures below as you type rather than after a save.
  const mealBase = baseRoomRateFor(propertyBasePrice, draft.price_offset)

  const save = async () => {
    setStatus({ kind: 'saving' })
    try {
      await authedFetch(`admin/room-types/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          description: draft.description ?? '',
          size_sqft: draft.size_sqft ?? '',
          bed_type: draft.bed_type ?? '',
          max_guests: Number(draft.max_guests ?? 2),
          price_offset: Number(draft.price_offset),
          // breakfast_offset / all_meals_offset are deliberately NOT sent.
          //
          // Meal plans went percentage-based on 5 Aug 2026 (EP 0 / CP 25 /
          // MAP 50 of the base room rate), so those columns no longer decide
          // what a guest pays. Posting them back would let a stale draft
          // overwrite the migrated values with whatever this form last held —
          // a write that looks successful and changes nothing a guest sees.
          total_units: Number(draft.total_units),
          is_available: !!draft.is_available,
        }),
      })
      setStatus({ kind: 'ok' })
      onSaved()
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  return (
    <div style={s.record}>
      <div style={s.recordHead}>
        <strong style={{ fontSize: '.9rem' }}>{propertyName} — {room.name}</strong>
        <label style={{ ...s.label, flexDirection: 'row', alignItems: 'center', gap: '.4rem' }}>
          <input type="checkbox" checked={!!draft.is_available} onChange={(e) => set('is_available')(e.target.checked)} />
          Bookable
        </label>
      </div>

      <div style={s.grid}>
        <TextField label="Room name" value={draft.name} onChange={set('name')} />
        <TextField label="Size" value={draft.size_sqft} onChange={set('size_sqft')} />
        <TextField label="Bed type" value={draft.bed_type} onChange={set('bed_type')} />
        <NumField label="Sleeps (max)" value={draft.max_guests} onChange={set('max_guests')} min="1" />
        <NumField label="Rate above base (₹)" value={draft.price_offset} onChange={set('price_offset')} />
        <NumField label="Rooms of this type" value={draft.total_units} onChange={set('total_units')} />
      </div>

      {/* Meal plans are shown, not edited.

          They were two rupee inputs until 5 Aug 2026, when the client moved the
          group onto percentages: "This percentage should be applied
          automatically across all hotels based on the base room rate." Leaving
          the inputs in place would have been worse than removing them — they
          would still accept a number and still save, while the guest was
          quoted the percentage. The figures below are derived live from the
          rate above, so a manager can see what breakfast actually costs at
          this property without doing the arithmetic. */}
      <p style={{ ...s.hint, margin: '.75rem 0 0' }}>
        <strong>Meal plans</strong> — set group-wide, from this room&rsquo;s ₹
        {mealBase.toLocaleString('en-IN')} rate:{' '}
        {(Object.keys(MEAL_PLAN_UPLIFT_PERCENT) as MealPlan[]).map((plan, i) => (
          <span key={plan}>
            {i > 0 && ' · '}
            {plan} {MEAL_PLAN_UPLIFT_PERCENT[plan]}%{' '}
            <strong>
              {mealUpliftFor(plan, mealBase) === 0
                ? 'no charge'
                : `+₹${mealUpliftFor(plan, mealBase).toLocaleString('en-IN')}`}
            </strong>
          </span>
        ))}
      </p>

      <label style={{ ...s.label, marginTop: '.75rem' }}>
        Description shown to guests
        <textarea style={s.textarea} value={draft.description ?? ''} onChange={(e) => set('description')(e.target.value)} />
      </label>

      <button style={s.save} onClick={save} disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'SAVING…' : 'SAVE ROOM'}
      </button>
      {status.kind === 'ok' && <span style={s.ok}>Saved</span>}
      {status.kind === 'err' && <span style={s.err}>{status.msg}</span>}
    </div>
  )
}

/* ---------- Copy blocks ---------- */

function ContentEditor({ authedFetch }: { authedFetch: AuthedFetch }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useSaveState()

  // Load current overrides so the boxes show what is live, not the defaults.
  useEffect(() => {
    fetch(getApiUrl('content'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.success && j.data) setValues(j.data) })
      .catch(() => { /* boxes stay empty; placeholders show the defaults */ })
  }, [])

  const save = async () => {
    setStatus({ kind: 'saving' })
    try {
      await authedFetch('admin/content', {
        method: 'PUT',
        body: JSON.stringify({ entries: values }),
      })
      refreshContent()
      setStatus({ kind: 'ok' })
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  // Group by the section each field declares, so related copy sits together.
  const bySection = Object.entries(DEFAULT_CONTENT).reduce<Record<string, Array<[string, typeof DEFAULT_CONTENT[string]]>>>(
    (acc, [key, field]) => {
      ;(acc[field.section] ??= []).push([key, field])
      return acc
    },
    {}
  )

  return (
    <div style={s.panel}>
      <h2 style={s.h2}>Website text</h2>
      <p style={s.hint}>
        Leave a box empty to use the website&rsquo;s built-in wording — the grey text in each box
        shows what that is. Anything you type here replaces it everywhere that text appears.
      </p>

      {Object.entries(bySection).map(([section, fields]) => (
        <div key={section}>
          <div style={s.sectionTitle}>{section.toUpperCase()}</div>
          {fields.map(([key, field]) => (
            <label key={key} style={{ ...s.label, marginBottom: '.7rem' }}>
              {field.label}
              {field.multiline ? (
                <textarea
                  style={s.textarea}
                  placeholder={field.value}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              ) : (
                <input
                  style={s.input}
                  placeholder={field.value}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      ))}

      <button style={s.save} onClick={save} disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'SAVING…' : 'SAVE WEBSITE TEXT'}
      </button>
      {status.kind === 'ok' && <span style={s.ok}>Saved — refresh the website to see it</span>}
      {status.kind === 'err' && <span style={s.err}>{status.msg}</span>}
    </div>
  )
}

/**
 * Per-property photo management.
 *
 * This is the piece that removes the developer from the loop. Photography used
 * to come from a build-time glob, so changing one picture meant an edit, a
 * rebuild and a redeploy. Uploads here go straight to storage and are live on
 * the next page load.
 *
 * It also answers the client's actual complaint — that some hotels display
 * other hotels' rooms. Uploading even one photo to a property makes it use its
 * own set exclusively.
 */
function PropertyPhotos({ item, authedFetch, onSaved }: {
  item: EditablePropertyItem; authedFetch: AuthedFetch; onSaved: () => void
}) {
  const [images, setImages] = useState<Array<{ id: string; url: string; thumb_url?: string | null }>>(
    (item.property as any).images || []
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true); setError('')
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('photos', f))
      const json = await authedFetch(`admin/properties/${item.property.id}/images`, {
        method: 'POST', body: form,
      })
      setImages((prev) => [...prev, ...(json.data || [])])
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    } finally {
      setBusy(false)
      // Clear the input so re-picking the same file still fires a change event.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (id: string) => {
    setBusy(true); setError('')
    try {
      await authedFetch(`admin/images/${id}`, { method: 'DELETE' })
      setImages((prev) => prev.filter((i) => i.id !== id))
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Could not remove that photo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...s.panel, background: '#0c0a09', border: '1px solid #292524' }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: '0 0 .2rem' }}>{item.property.name}</h3>
      <p style={{ ...s.hint, margin: '0 0 .8rem' }}>
        {images.length === 0
          ? 'No photos uploaded. This hotel is currently showing the photos built into the website.'
          : `${images.length} photo${images.length === 1 ? '' : 's'}. The first one is used as the main picture.`}
      </p>

      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '.6rem', marginBottom: '.9rem' }}>
          {images.map((img, i) => (
            <div key={img.id} style={{ position: 'relative' }}>
              <img
                src={img.thumb_url || img.url}
                alt=""
                style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '6px', display: 'block' }}
              />
              {i === 0 && (
                <span style={{ position: 'absolute', top: 4, left: 4, background: '#d97706', color: '#0c0a09',
                               fontSize: '.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>MAIN</span>
              )}
              <button
                type="button" onClick={() => remove(img.id)} disabled={busy}
                title="Remove this photo"
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                         border: 'none', background: 'rgba(0,0,0,.75)', color: '#fff', cursor: 'pointer',
                         fontSize: '.8rem', lineHeight: 1 }}
              >x</button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef} type="file" accept="image/*" multiple disabled={busy}
        onChange={(e) => upload(e.target.files)}
        style={{ fontSize: '.8rem', color: '#a8a29e' }}
      />
      {busy && <p style={{ ...s.hint, margin: '.5rem 0 0' }}>Uploading and resizing…</p>}
      {error && <p style={{ ...s.hint, margin: '.5rem 0 0', color: '#f87171' }}>{error}</p>}
    </div>
  )
}

/* ---------- Composed editor ---------- */

export default function AdminEditor({ properties, authedFetch, onSaved }: {
  properties: EditablePropertyItem[]
  authedFetch: AuthedFetch
  onSaved: () => void
}) {
  const [tab, setTab] = useState<'hotels' | 'rooms' | 'photos' | 'text'>('hotels')

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{
        padding: '.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.82rem',
        fontWeight: 700, letterSpacing: '.04em',
        border: tab === id ? '1px solid #d97706' : '1px solid #292524',
        background: tab === id ? '#d97706' : '#1c1917',
        color: tab === id ? '#0c0a09' : '#a8a29e',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {tabBtn('hotels', 'EDIT HOTELS')}
        {tabBtn('rooms', 'EDIT ROOMS & RATES')}
        {tabBtn('photos', 'PHOTOS')}
        {tabBtn('text', 'EDIT WEBSITE TEXT')}
      </div>

      {tab === 'hotels' && (
        <div style={s.panel}>
          <h2 style={s.h2}>Hotels</h2>
          <p style={s.hint}>
            The rate you set here is the rate a guest is quoted and charged. Unticking
            &ldquo;Live on the website&rdquo; hides the property from the site without deleting anything.
          </p>
          {properties.map((item) => (
            <PropertyForm key={item.property.id} item={item} authedFetch={authedFetch} onSaved={onSaved} />
          ))}
        </div>
      )}

      {tab === 'photos' && (
        <div style={s.panel}>
          <h2 style={s.h2}>Photos</h2>
          <p style={s.hint}>
            Upload photos for each hotel. They appear on the website within a few seconds — no
            developer needed. Photos are resized automatically so the site stays fast on a phone.
            Once a hotel has its own photos, it stops showing any from other properties.
          </p>
          {properties.map((item) => (
            <PropertyPhotos key={item.property.id} item={item} authedFetch={authedFetch} onSaved={onSaved} />
          ))}
        </div>
      )}

      {tab === 'rooms' && (
        <div style={s.panel}>
          <h2 style={s.h2}>Rooms &amp; rates</h2>
          <p style={s.hint}>
            &ldquo;Rate above base&rdquo; is added to the hotel&rsquo;s base rate for this room type.
            Meal supplements are added on top when a guest picks that plan.
          </p>
          {properties.map((item) =>
            item.rooms.map((room) => (
              <RoomForm
                key={room.id}
                room={room}
                propertyName={item.property.name}
                propertyBasePrice={Number(item.property.base_price ?? 0)}
                authedFetch={authedFetch}
                onSaved={onSaved}
              />
            ))
          )}
        </div>
      )}

      {tab === 'text' && <ContentEditor authedFetch={authedFetch} />}
    </div>
  )
}
