import { useState, useRef, useEffect } from 'react'
import { getApiUrl } from '../config/api'
import { IconWhatsapp, IconSparkles, IconBot, IconSend, IconX } from './icons'
import { PROPERTY_COUNT } from '../data/site.ts'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolsInvoked?: string[]
  handoffTriggered?: boolean
}

const QUICK_SUGGESTIONS = [
  'Rooms in Sector 51 Noida',
  'Hold a Deluxe Room for 15 mins',
  'Banquet RFP for 200 guests',
  'Status of QD-1234',
  'Connect with Human Manager',
]

export default function QuadisAssistChat() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 *Welcome to Quadis Assist!* I am your personal AI Concierge for our ${PROPERTY_COUNT} luxury properties across Noida and New Delhi.\n\nHow may I elevate your stay today?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isChatOpen, loading])

  const handleSend = async (textToSend?: string) => {
    const text = textToSend ?? input
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInput('')
    setLoading(true)

    try {
      const res = await fetch(getApiUrl('ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      })

      // The API answers with an envelope — { success, data: { reply, ... } } —
      // so the reply is one level down. Reading `body.reply` yields undefined and
      // silently falls through to the offline copy below, which made the widget
      // look dead no matter how healthy the backend was.
      const body = await res.json()
      const payload = body?.data ?? body

      const assistMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: payload?.reply || 'I am currently offline. Please connect via WhatsApp or Call.',
        toolsInvoked: payload?.toolsInvoked,
        handoffTriggered: payload?.handoffTriggered,
      }

      setMessages((prev) => [...prev, assistMsg])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `err_${Date.now()}`, role: 'assistant', content: 'Connection error. Please try again or use WhatsApp.' }
      ])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Renders one line: *bold* spans, with bare URLs turned into real links.
   *
   * Previously URLs were emitted as plain text, so a map link was a wall of
   * characters the guest had to select and paste by hand. Map links get a short
   * label because the raw Google URL is longer than the widget is wide.
   */
  const renderInline = (line: string, key: string) =>
    line.split(/\*(.*?)\*/).map((part, j) =>
      j % 2 === 1 ? (
        <strong key={`${key}-b${j}`}>{part}</strong>
      ) : (
        part.split(/(https?:\/\/\S+)/).map((seg, k) => {
          if (!/^https?:\/\//.test(seg)) return <span key={`${key}-t${j}-${k}`}>{seg}</span>
          const isMap = /google\.[a-z.]+\/maps|share\.google|goo\.gl\/maps/.test(seg)
          return (
            <a
              key={`${key}-a${j}-${k}`}
              href={seg}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-word' }}
            >
              {isMap ? 'View on map' : seg}
            </a>
          )
        })
      )
    )

  const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|')
  const cellsOf = (l: string) => l.trim().slice(1, -1).split('|').map((c) => c.trim())

  /**
   * Text plus pipe tables. A table conveys a rate list in a fraction of the
   * characters a sentence needs, which matters twice over here: the bubble is
   * narrow, and every token the model spends is charged against a shared daily
   * budget. Rendered as a real <table> — as raw pipes in a proportional font
   * the columns do not line up and it reads worse than prose.
   */
  const formatText = (text: string) => {
    const lines = text.split('\n')
    const out: React.ReactNode[] = []

    for (let i = 0; i < lines.length; ) {
      const line = lines[i] ?? ''
      if (isTableRow(line) && isTableRow(lines[i + 1] ?? '')) {
        const rows: string[][] = []
        for (let cur = lines[i] ?? ''; i < lines.length && isTableRow(cur); cur = lines[++i] ?? '') {
          // |---|---| is markdown's header rule, not data.
          if (!/^[\s|:-]+$/.test(cur)) rows.push(cellsOf(cur))
        }
        const [head = [], ...body] = rows
        out.push(
          <div key={`tbl-${i}`} style={{ overflowX: 'auto', margin: '6px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.85em', width: '100%' }}>
              <thead>
                <tr>
                  {head.map((h, x) => (
                    <th
                      key={x}
                      style={{
                        textAlign: x === 0 ? 'left' : 'right',
                        padding: '3px 8px 3px 0',
                        borderBottom: '1px solid currentColor',
                        opacity: 0.7,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, y) => (
                  <tr key={y}>
                    {r.map((c, x) => (
                      <td
                        key={x}
                        style={{
                          textAlign: x === 0 ? 'left' : 'right',
                          padding: '3px 8px 3px 0',
                          verticalAlign: 'top',
                          whiteSpace: x === 0 ? 'normal' : 'nowrap',
                        }}
                      >
                        {renderInline(c, `c${y}-${x}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }

      out.push(
        <span key={`ln-${i}`}>
          {renderInline(line, `l${i}`)}
          <br />
        </span>
      )
      i++
    }

    return out
  }

  return (
    <>
      {/* Floating Speed Dial */}
      {!isChatOpen && (
        <div className="fab-container" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
          {isMenuOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', animation: 'fadeUp 0.2s ease-out forwards' }}>
              <a
                href="https://wa.me/919217373532"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  backgroundColor: 'var(--bg-dark)', color: 'var(--text-on-dark)',
                  padding: '12px 20px', borderRadius: '99px',
                  textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
                  boxShadow: 'var(--shadow-card)', border: '1px solid var(--border-card-2)'
                }}
              >
                WhatsApp Us <span style={{ color: 'var(--whatsapp)', display: 'flex' }}><IconWhatsapp /></span>
              </a>
              <button
                onClick={() => { setIsMenuOpen(false); setIsChatOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  backgroundColor: 'var(--gold)', color: 'var(--bg-darkest)',
                  padding: '12px 20px', borderRadius: '99px',
                  border: 'none', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: 'var(--shadow-card)'
                }}
              >
                Quadis Assist AI <span style={{ display: 'flex' }}><IconSparkles /></span>
              </button>
            </div>
          )}
          
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Contact Options"
            style={{
              width: '56px', height: '56px', borderRadius: '50%',
              backgroundColor: 'var(--bg-darkest)', color: 'var(--gold)',
              border: '2px solid var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: 'var(--shadow-card)',
              transition: 'transform 0.3s ease',
              transform: isMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)'
            }}
          >
            {isMenuOpen ? <IconX /> : <IconBot />}
          </button>
        </div>
      )}

      {/* Glassmorphic AI Drawer / Modal */}
      {isChatOpen && (
        <div
          style={{
            position: 'fixed', bottom: '90px', right: '24px',
            width: '380px', maxWidth: 'calc(100vw - 48px)',
            height: '560px', maxHeight: 'calc(100vh - 120px)',
            zIndex: 9999, display: 'flex', flexDirection: 'column',
            backgroundColor: 'var(--bg-darkest)',
            backgroundImage: 'radial-gradient(circle at 10% 10%, rgba(200,162,74,0.08) 0%, transparent 60%)',
            border: '1px solid rgba(200,162,74, 0.3)',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(200,162,74, 0.15)',
            overflow: 'hidden', fontFamily: 'inherit',
          }}
        >
          {/* Header Panel */}
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-darkest) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(200,162,74, 0.15)',
                  border: '1px solid rgba(200,162,74, 0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--gold)', fontSize: '1rem',
                }}
              >
                <IconSparkles />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-on-dark)', fontWeight: 700, letterSpacing: '0.3px' }}>
                  Quadis Assist
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--whatsapp)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' }}>
                    Agentic AI Online
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              style={{
                background: 'transparent', border: 'none',
                color: 'rgba(255, 255, 255, 0.6)', fontSize: '1.2rem',
                cursor: 'pointer', padding: '4px', lineHeight: 1, display: 'flex'
              }}
            >
              <IconX />
            </button>
          </div>

          {/* Messages Container */}
          <div
            style={{
              flex: 1, padding: '1rem', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: '0.85rem',
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '4px',
                }}
              >
                {m.toolsInvoked && m.toolsInvoked.length > 0 && (
                  <div
                    style={{
                      display: 'flex', flexWrap: 'wrap', gap: '4px',
                      fontSize: '0.68rem', color: 'var(--gold)',
                      backgroundColor: 'rgba(200,162,74, 0.1)',
                      padding: '2px 8px', borderRadius: '9999px',
                      alignSelf: 'flex-start', border: '1px solid rgba(200,162,74, 0.2)',
                    }}
                  >
                    ⚡ Tool: {m.toolsInvoked.join(', ')}
                  </div>
                )}

                {m.handoffTriggered && (
                  <div
                    style={{
                      fontSize: '0.72rem', color: 'var(--error)',
                      backgroundColor: 'rgba(176, 86, 60, 0.1)',
                      padding: '3px 8px', borderRadius: '4px',
                      border: '1px solid rgba(176, 86, 60, 0.3)',
                    }}
                  >
                    ⚠️ Human handoff initiated.
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: m.role === 'user' ? 'var(--gold)' : '#262420',
                    color: m.role === 'user' ? 'var(--bg-darkest)' : 'var(--text-on-dark)',
                    padding: '10px 14px',
                    borderRadius: m.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    fontSize: '0.9rem', lineHeight: 1.4,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                  }}
                >
                  {formatText(m.content)}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: 'flex-start', backgroundColor: '#262420', padding: '10px 14px', borderRadius: '16px 16px 16px 2px', display: 'flex', gap: '4px' }}>
                <span className="dot-pulse" style={{ backgroundColor: 'var(--gold)', width: '6px', height: '6px', borderRadius: '50%' }}></span>
                <span className="dot-pulse" style={{ backgroundColor: 'var(--gold)', width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.2s' }}></span>
                <span className="dot-pulse" style={{ backgroundColor: 'var(--gold)', width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.4s' }}></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Suggestions */}
          <div
            style={{
              padding: '0.5rem 0.8rem', backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none',
            }}
          >
            {QUICK_SUGGESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                disabled={loading}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: '9999px',
                  backgroundColor: 'rgba(200,162,74, 0.1)', border: '1px solid rgba(200,162,74, 0.25)',
                  color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer', transition: 'background 0.2s',
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div
            style={{
              padding: '0.75rem', backgroundColor: 'var(--bg-dark)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex', gap: '0.5rem',
            }}
          >
            <input
              type="text"
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
              style={{
                flex: 1, padding: '0.6rem 0.9rem', borderRadius: '9999px',
                backgroundColor: 'var(--bg-darkest)', border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'var(--text-on-dark)', fontSize: '0.85rem', outline: 'none',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                backgroundColor: 'var(--gold)', color: 'var(--bg-darkest)',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              <IconSend />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
