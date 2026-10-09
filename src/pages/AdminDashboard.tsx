import React, { useState, useEffect } from 'react'
import { Button } from '../components/ui'
import { getApiUrl } from '../config/api'
import { PROPERTY_COUNT } from '../data/site.ts'
import AdminEditor from '../components/AdminEditor.tsx'
import type { EditablePropertyItem } from '../components/AdminEditor.tsx'


interface GlanceMetrics {
  todayCheckIns: number
  pendingHolds: number
  pendingEnquiries: number
  todayRevenue: number
}

// The dashboard payload carries the full records, so the editor's shapes are
// the source of truth for both rather than a second, narrower copy here.
type PropertyItem = EditablePropertyItem

/**
 * Digits only, capped at six — applied to every PIN box on this page.
 *
 * The client was locked out of /admin on 4 Aug 2026 ("Ye invalid show kr raha
 * h", 4:36 pm, with a photo of this login card showing `Invalid Admin PIN`).
 * The masked field in that photo holds **seven** dots, not six — counted off
 * the original at four thresholds, seven evenly-spaced blobs at a regular
 * ~7px pitch. So whatever was submitted was seven characters long, and a
 * six-digit PIN can never match it: POST /api/admin/auth compares the string
 * it is given against ADMIN_PIN, or scrypt-verifies it against the stored
 * hash, with no normalisation on either side (backend/src/routes/admin.ts).
 *
 * The likely seventh character is a trailing space, because the PIN was sent
 * to her over WhatsApp and pasting out of WhatsApp brings whitespace with it.
 * The old field took it silently: `maxLength={10}`, no `inputMode`, no filter,
 * and — because there was no `autoComplete` — Chrome was also free to autofill
 * a saved password over the top of what she typed. She then got the same flat
 * "Invalid Admin PIN" that a genuinely wrong PIN gets, with nothing to tell
 * the two apart.
 *
 * Stripping here rather than trimming server-side is deliberate: the server
 * still accepts exactly one string and nothing looser, so this makes the panel
 * honest about what it is sending without widening what is accepted.
 */
const normalisePin = (raw: string): string => raw.replace(/\D/g, '').slice(0, 6)

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('quadis_admin_token'))
  const [pinInput, setPinInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(false)

  const [metrics, setMetrics] = useState<GlanceMetrics>({ todayCheckIns: 0, pendingHolds: 0, pendingEnquiries: 0, todayRevenue: 0 })
  const [properties, setProperties] = useState<PropertyItem[]>([])
  const [recentBookings, setRecentBookings] = useState<any[]>([])
  const [recentEnquiries, setRecentEnquiries] = useState<any[]>([])

  // Instant payment link generator state
  const [linkPhone, setLinkPhone] = useState('')
  const [linkAmount, setLinkAmount] = useState('')
  const [linkName, setLinkName] = useState('')

  const [generatedLink, setGeneratedLink] = useState<{ shortUrl: string; paymentLinkId: string } | null>(null)
  const [linkPending, setLinkPending] = useState(false)

  // Change-PIN state. `mustChangePin` comes from the server and means the
  // account is still on the bootstrap PIN that was sent over WhatsApp.
  const [mustChangePin, setMustChangePin] = useState(false)
  const [showPinForm, setShowPinForm] = useState(false)
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [confirmPinInput, setConfirmPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinNotice, setPinNotice] = useState('')
  const [pinSaving, setPinSaving] = useState(false)

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/dashboard'), {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401 || res.status === 503) {
        // Stale or unaccepted token — drop it rather than showing an empty dashboard.
        sessionStorage.removeItem('quadis_admin_token')
        setToken(null)
        setAuthError(res.status === 503 ? 'Admin access is not configured on the server.' : 'Session expired. Please sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch dashboard')
      const json = await res.json()
      if (json.success) {
        setMetrics(json.data.metrics || { todayCheckIns: 0, pendingHolds: 0, pendingEnquiries: 0, todayRevenue: 0 })
        setProperties(json.data.properties || [])
        setRecentBookings(json.data.recentBookings || [])
        setRecentEnquiries(json.data.recentEnquiries || [])
      }
    } catch (err) {
      console.error('Failed to load admin dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchDashboard()
    }
  }, [token])

  const authedFetch = async (endpoint: string, init: RequestInit = {}) => {
    // A photo upload sends FormData, and the browser must set Content-Type
    // itself so it can include the multipart boundary. Forcing
    // application/json here made every upload fail to parse server-side.
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    const res = await fetch(getApiUrl(endpoint), {
      ...init,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || `Request failed (${res.status})`)
    }
    return json
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    // Caught here rather than sent, because the server cannot tell her why.
    // A malformed PIN and a wrong PIN both come back as 401 "Invalid Admin
    // PIN", which is exactly the dead end she hit on 4 Aug 2026 — and every
    // attempt spends one of the ten the rate limiter allows in 15 minutes
    // (backend/src/app.ts), so a stray character can also lock her out for a
    // quarter of an hour on top of failing.
    if (pinInput.length !== 6) {
      setAuthError(
        pinInput.length === 0
          ? 'Apna 6-digit PIN daaliye.'
          : `PIN 6 digit ka hai — abhi ${pinInput.length} digit hai.`
      )
      return
    }

    try {
      const res = await fetch(getApiUrl('admin/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success || !json?.token) {
        // 401 from here means the six digits were well-formed and still not
        // accepted. There are only two ways that happens, and she cannot see
        // either of them from this screen, so name both: the PIN was changed
        // from this dashboard (the stored PIN wins over the one we sent on
        // WhatsApp the moment she sets one), or it is simply the wrong PIN.
        if (res.status === 401) {
          setAuthError(
            'Invalid Admin PIN — agar aapne dashboard se apna PIN change kiya tha, ' +
            'to WhatsApp wala purana PIN ab kaam nahi karega. Naya PIN daaliye, ' +
            'ya hume batayein.'
          )
          return
        }
        setAuthError(json?.error || 'Invalid PIN code.')
        return
      }
      sessionStorage.setItem('quadis_admin_token', json.token)
      setToken(json.token)
      // Still on the PIN we generated and sent over WhatsApp — open the change
      // form straight away rather than leaving it to be found in a menu.
      setMustChangePin(Boolean(json.mustChangePin))
      setShowPinForm(Boolean(json.mustChangePin))
      setCurrentPinInput(json.mustChangePin ? pinInput : '')
    } catch (err) {
      setAuthError('Could not reach the authentication server.')
    }
  }

  const changePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')
    setPinNotice('')
    if (newPinInput !== confirmPinInput) {
      setPinError('The two new PINs do not match.')
      return
    }
    setPinSaving(true)
    try {
      const res = await fetch(getApiUrl('admin/change-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPin: currentPinInput, newPin: newPinInput }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setPinError(json?.error || 'Could not change the PIN.')
        return
      }
      setPinNotice('PIN changed. Use the new one next time you sign in.')
      setMustChangePin(false)
      setShowPinForm(false)
      setCurrentPinInput('')
      setNewPinInput('')
      setConfirmPinInput('')
    } catch {
      setPinError('Could not reach the server.')
    } finally {
      setPinSaving(false)
    }
  }

  const signOut = () => {
    sessionStorage.removeItem('quadis_admin_token')
    setToken(null)
    setPinInput('')
    setMustChangePin(false)
    setShowPinForm(false)
  }

  const toggleRoom = async (roomTypeId: string, currentStatus: boolean) => {
    if (!token) return
    try {
      await authedFetch('admin/room-availability', {
        method: 'PATCH',
        body: JSON.stringify({ roomTypeId, isAvailable: !currentStatus }),
      })
      setProperties((prev) =>
        prev.map((item) => ({
          ...item,
          rooms: item.rooms.map((r) => (r.id === roomTypeId ? { ...r, is_available: !currentStatus } : r)),
        }))
      )
    } catch (err) {
      console.error('Error toggling room:', err)
      setActionError(err instanceof Error ? err.message : 'Could not update room availability.')
    }
  }

  const toggleSurcharge = async (currentSurcharge = 0) => {
    if (!token) return
    const newPercent = currentSurcharge > 0 ? 0 : 15
    try {
      await authedFetch('admin/surcharge', {
        method: 'PATCH',
        body: JSON.stringify({ surchargePercent: newPercent, propertyId: 'all' }),
      })
      // Re-read from the server so the dashboard shows what was actually stored.
      await fetchDashboard()
    } catch (err) {
      console.error('Error toggling surcharge:', err)
      setActionError(err instanceof Error ? err.message : 'Could not update the surcharge.')
    }
  }

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !linkPhone || !linkAmount) return
    setLinkPending(true)
    setGeneratedLink(null)
    setActionError('')
    try {
      const json = await authedFetch('admin/payment-link', {
        method: 'POST',
        body: JSON.stringify({
          phone: linkPhone.trim(),
          amount: Number(linkAmount),
          guestName: linkName.trim() || undefined,
        }),
      })
      setGeneratedLink({
        shortUrl: json.data.shortUrl,
        paymentLinkId: json.data.paymentLinkId,
      })
      setLinkPhone('')
      setLinkAmount('')
      setLinkName('')
    } catch (err) {
      console.error('Error generating link:', err)
      setActionError(err instanceof Error ? err.message : 'Could not generate the payment link.')
    } finally {
      setLinkPending(false)
    }
  }

  if (!token) {
    return (
      <section className="section container" style={{ maxWidth: '440px', margin: '4rem auto' }}>
        <div className="card p-6" style={{ background: '#1c1917', color: '#fff', borderRadius: '12px', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem', textAlign: 'center' }}>🔒 Quadis Manager Login</h1>
          <p style={{ color: '#a8a29e', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            Enter your 6-digit Hotel Management PIN to access the 30-second mobile switchboard.
          </p>
          <form onSubmit={handleLogin} className="flex flex-col gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="password"
              // inputMode: a numeric keypad on her phone instead of a full
              // alphanumeric keyboard, where a letter or a space is one slip away.
              inputMode="numeric"
              // autoComplete off, and a name the password manager will not
              // recognise: an unnamed lone password field invites Chrome to
              // autofill a saved credential over the top of what she typed,
              // which looks identical to typing the wrong PIN.
              autoComplete="off"
              name="quadis-admin-pin"
              placeholder="Enter 6-digit Admin PIN"
              value={pinInput}
              onChange={(e) => setPinInput(normalisePin(e.target.value))}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #444',
                background: '#292524',
                color: '#fff',
                fontSize: '1rem',
                textAlign: 'center',
                letterSpacing: '0.2em',
              }}
              maxLength={6}
            />
            {/* She could not see how many characters the field held — the whole
                lockout turned on that. Six dots is now countable at a glance. */}
            <div style={{ color: pinInput.length === 6 ? '#6ee7b7' : '#78716c', fontSize: '0.75rem', textAlign: 'center' }}>
              {pinInput.length} / 6 digits
            </div>
            {authError && <div style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center' }}>{authError}</div>}
            <Button as="button" type="submit" variant="primary" style={{ width: '100%', padding: '0.75rem' }}>
              ACCESS SWITCHBOARD
            </Button>
          </form>
        </div>
      </section>
    )
  }

  const globalSurcharge = properties[0]?.property.weekend_surcharge_percent || 0

  return (
    <div className="admin-portal" style={{ background: '#0c0a09', color: '#f5f5f4', minHeight: '100vh', padding: '1.5rem 1rem' }}>
      <div className="container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #292524', paddingBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: '#d97706', fontWeight: '700' }}>MOBILE MANAGEMENT SWITCHBOARD</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: '0' }}>Quadis Owner Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => { setShowPinForm((v) => !v); setPinError(''); setPinNotice('') }}
              style={{ background: '#292524', color: '#a8a29e', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Change PIN
            </button>
            <button
              onClick={signOut}
              style={{ background: '#292524', color: '#a8a29e', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {mustChangePin && (
          <div
            role="alert"
            style={{ background: 'rgba(217,119,6,.12)', border: '1px solid #b45309', color: '#fcd34d', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}
          >
            Aap abhi bhi wahi PIN use kar rahe hain jo hamne bheja tha. Apna khud
            ka PIN set kar lijiye — neeche form me.
          </div>
        )}

        {pinNotice && (
          <div
            role="status"
            style={{ background: 'rgba(16,185,129,.12)', border: '1px solid #047857', color: '#6ee7b7', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}
          >
            {pinNotice}
          </div>
        )}

        {showPinForm && (
          <form
            onSubmit={changePin}
            style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem' }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.25rem' }}>🔑 Change Admin PIN</h3>
            <p style={{ color: '#a8a29e', fontSize: '0.8rem', margin: '0 0 1rem' }}>
              6 digits. Ek hi digit baar baar ya 123456 jaisa seedha number nahi chalega.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <input
                type="password" inputMode="numeric" autoComplete="current-password"
                placeholder="Current PIN" value={currentPinInput}
                onChange={(e) => setCurrentPinInput(normalisePin(e.target.value))}
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #292524', background: '#0c0a09', color: '#fff' }}
              />
              <input
                type="password" inputMode="numeric" autoComplete="new-password"
                placeholder="New PIN" value={newPinInput}
                onChange={(e) => setNewPinInput(normalisePin(e.target.value))}
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #292524', background: '#0c0a09', color: '#fff' }}
              />
              <input
                type="password" inputMode="numeric" autoComplete="new-password"
                placeholder="Confirm new PIN" value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(normalisePin(e.target.value))}
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #292524', background: '#0c0a09', color: '#fff' }}
              />
            </div>
            {pinError && (
              <div role="alert" style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '0.75rem' }}>{pinError}</div>
            )}
            <button
              type="submit" disabled={pinSaving}
              style={{ marginTop: '1rem', background: '#d97706', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '6px', cursor: pinSaving ? 'default' : 'pointer', fontWeight: '700', opacity: pinSaving ? 0.6 : 1 }}
            >
              {pinSaving ? 'Saving…' : 'Save new PIN'}
            </button>
          </form>
        )}

        {actionError && (
          <div
            role="alert"
            style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', background: 'rgba(239,68,68,.12)', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}
          >
            <span>{actionError}</span>
            <button
              onClick={() => setActionError('')}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* 1. Daily Glance Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ color: '#a8a29e', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Today's Check-ins</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981', marginTop: '0.25rem' }}>{metrics.todayCheckIns}</div>
          </div>
          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ color: '#a8a29e', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Holds (15m)</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#f59e0b', marginTop: '0.25rem' }}>{metrics.pendingHolds}</div>
          </div>
          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ color: '#a8a29e', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pending Leads / Enquiries</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#3b82f6', marginTop: '0.25rem' }}>{metrics.pendingEnquiries}</div>
          </div>
          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <div style={{ color: '#a8a29e', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Today's Revenue</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#eab308', marginTop: '0.25rem' }}>₹{metrics.todayRevenue.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {/* 2. Editing — hotels, rooms and rates, website text */}
        <AdminEditor properties={properties} authedFetch={authedFetch} onSaved={fetchDashboard} />

        {/* 3. Global Controls (Weekend Surcharge Toggle) */}
        <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0' }}>⚡ Global Weekend & Seasonal Surcharge</h3>
            <p style={{ color: '#a8a29e', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
              Instantly apply +15% pricing boost across all {PROPERTY_COUNT} properties during high demand periods or Friday/Saturday stays.
            </p>
          </div>
          <button
            onClick={() => toggleSurcharge(globalSurcharge)}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              border: 'none',
              background: globalSurcharge > 0 ? '#10b981' : '#44403c',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: globalSurcharge > 0 ? '#fff' : '#a8a29e', display: 'inline-block' }}></span>
            {globalSurcharge > 0 ? 'ACTIVE (+15% APPLIED)' : 'OFF (NORMAL PRICING)'}
          </button>
        </div>

        {/* 3. Instant Payment Link Generator */}
        <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.5rem', borderRadius: '10px', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 1rem' }}>💬 Instant WhatsApp Payment Link Generator</h3>
          <form onSubmit={handleGenerateLink} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#a8a29e', marginBottom: '0.4rem' }}>Guest Phone</label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem', background: '#292524', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#a8a29e', marginBottom: '0.4rem' }}>Amount (₹)</label>
              <input
                type="number"
                placeholder="e.g. 15000"
                value={linkAmount}
                onChange={(e) => setLinkAmount(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem', background: '#292524', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#a8a29e', marginBottom: '0.4rem' }}>Guest Name / Walk-in Purpose</label>
              <input
                type="text"
                placeholder="e.g. Rajat Verma (Banquet Deposit)"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', background: '#292524', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              />
            </div>
            <Button as="button" type="submit" variant="primary" disabled={linkPending} style={{ padding: '0.65rem' }}>
              {linkPending ? 'Generating…' : 'SEND LINK'}
            </Button>
          </form>

          {generatedLink && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#047857', borderRadius: '8px', color: '#fff' }}>
              <strong style={{ display: 'block', marginBottom: '0.3rem' }}>✅ Payment Link Dispatched!</strong>
              <div style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
                Shareable URL: <a href={generatedLink.shortUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>{generatedLink.shortUrl}</a>
              </div>
            </div>
          )}
        </div>

        {/* 4. Inventory Switchboard (One-Tap Switches) */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '1rem' }}>🏨 Live Inventory Switchboard (One-Tap Control)</h2>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#a8a29e' }}>Loading switchboard…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {properties.map((item) => (
                <div key={item.property.id} style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #292524', paddingBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0' }}>{item.property.name}</h4>
                      <span style={{ fontSize: '0.8rem', color: '#a8a29e' }}>{item.property.city} • Base Rate: ₹{Number(item.property.base_price).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                    {item.rooms.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem 1rem',
                          background: '#292524',
                          borderRadius: '8px',
                          border: r.is_available ? '1px solid #10b981' : '1px solid #ef4444',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{r.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>
                            {r.available_units} / {r.total_units} units left • +₹{r.price_offset}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleRoom(r.id, r.is_available)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            border: 'none',
                            cursor: 'pointer',
                            background: r.is_available ? '#10b981' : '#ef4444',
                            color: '#fff',
                            minWidth: '105px',
                            textAlign: 'center',
                          }}
                        >
                          {r.is_available ? 'AVAILABLE' : 'SOLD OUT'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Recent Bookings & Enquiries */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 1rem' }}>📋 Recent Bookings ({recentBookings.length})</h3>
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recentBookings.map((b) => (
                <div key={b.id} style={{ background: '#292524', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>{b.booking_code}</strong> — {b.guest_name} ({b.guest_phone})
                    <div style={{ color: '#a8a29e', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      Check-in: {b.check_in} • {b.rooms_count} room(s) • ₹{Number(b.total_amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      background: b.booking_status === 'CONFIRMED' ? '#047857' : b.booking_status === 'PENDING_PAYMENT' ? '#d97706' : '#991b1b',
                      color: '#fff',
                    }}
                  >
                    {b.booking_status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#1c1917', border: '1px solid #292524', padding: '1.25rem', borderRadius: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 1rem' }}>🔔 Recent Leads & RFPs ({recentEnquiries.length})</h3>
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recentEnquiries.map((e) => (
                <div key={e.id} style={{ background: '#292524', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  {/* Header row wraps rather than sitting side by side: on her
                      phone a long corporate name used to squeeze the status
                      badge into a two-character column. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 12rem' }}>
                      <strong style={{ color: '#fff', wordBreak: 'break-word' }}>{e.guest_name}</strong>
                      <div style={{ color: '#a8a29e', fontSize: '0.7rem', letterSpacing: '0.08em', marginTop: '0.1rem' }}>
                        {e.enquiry_type}
                        {e.created_at ? ` • ${new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        flexShrink: 0,
                        background: e.status === 'CONVERTED' ? '#047857' : e.status === 'LINK_SENT' ? '#2563eb' : '#d97706',
                        color: '#fff',
                      }}
                    >
                      {e.status}
                    </span>
                  </div>

                  {/*
                    Contact details, 5 Aug 2026: "Booking me srf name he pta
                    chlega… email number baki kuch pta nahi chlega kya".
                    She could see the name and phone and nothing else, so a
                    lead she could not phone was a lead she could not answer.

                    The email was never missing from the data — all three forms
                    collect it (Contact.tsx validates it as required),
                    POST /api/enquiries persists it to enquiries.guest_email,
                    and the dashboard payload has carried it the whole time.
                    It was only ever dropped on the way to the screen.

                    mailto: and tel: so one tap on her phone opens the mail app
                    or dials, which is what "reply to a lead" actually means
                    when she works from a handset. Buttons rather than bare
                    text: a 44px-ish target, and they wrap instead of
                    overflowing on a narrow screen.
                  */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {e.guest_phone && (
                      <a
                        href={`tel:${String(e.guest_phone).replace(/[^\d+]/g, '')}`}
                        style={{ background: '#1c1917', border: '1px solid #44403c', color: '#fcd34d', padding: '0.35rem 0.6rem', borderRadius: '5px', fontSize: '0.8rem', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        📞 {e.guest_phone}
                      </a>
                    )}
                    {e.guest_email ? (
                      <a
                        href={`mailto:${e.guest_email}`}
                        style={{ background: '#1c1917', border: '1px solid #44403c', color: '#7dd3fc', padding: '0.35rem 0.6rem', borderRadius: '5px', fontSize: '0.8rem', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        ✉️ {e.guest_email}
                      </a>
                    ) : (
                      // Said out loud rather than left blank, so an absent
                      // email reads as "this lead did not give one" and not as
                      // the panel hiding it from her again.
                      <span style={{ color: '#78716c', fontSize: '0.8rem', padding: '0.35rem 0' }}>
                        ✉️ Email nahi diya gaya
                      </span>
                    )}
                  </div>

                  {/* The rest of what the form captured and this card used to
                      throw away: how many guests, and the date they asked for. */}
                  {(e.guest_count || e.event_date) && (
                    <div style={{ color: '#d6d3d1', fontSize: '0.75rem', marginTop: '0.45rem' }}>
                      {e.event_date ? `📅 ${e.event_date}` : ''}
                      {e.event_date && e.guest_count ? ' • ' : ''}
                      {e.guest_count ? `👥 ${e.guest_count} guests` : ''}
                    </div>
                  )}

                  <div style={{ color: '#a8a29e', fontSize: '0.75rem', marginTop: '0.35rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {e.message || 'No message provided'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
