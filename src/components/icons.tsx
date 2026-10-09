import type { SVGProps } from 'react'

// Minimal 20px line icons (no emoji per §1). Inherit currentColor.
type P = SVGProps<SVGSVGElement>
const base = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>)
export const IconPin = (p: P) => (<svg {...base} width={14} height={14} {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>)
export const IconChevron = (p: P) => (<svg {...base} width={14} height={14} {...p}><path d="m6 9 6 6 6-6" /></svg>)
export const IconWifi = (p: P) => (<svg {...base} {...p}><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M2 9a15 15 0 0 1 20 0" /><circle cx="12" cy="19" r="1" /></svg>)
export const IconAc = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="8" rx="2" /><path d="M7 17c0 1.5-.8 2-2 2M12 17c0 1.5-.8 2-2 2M17 17c0 1.5-.8 2-2 2" /></svg>)
export const IconBreakfast = (p: P) => (<svg {...base} {...p}><path d="M4 8h13a3 3 0 0 1 0 6h-1" /><path d="M4 8v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8Z" /><path d="M8 2v2M11 2v2" /></svg>)
export const IconParking = (p: P) => (<svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 16V8h3.5a2.5 2.5 0 0 1 0 5H9" /></svg>)
export const IconDesk = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>)
export const IconRoom = (p: P) => (<svg {...base} {...p}><path d="M3 20v-9l9-6 9 6v9" /><path d="M9 20v-5h6v5" /></svg>)
export const IconPhone = (p: P) => (<svg {...base} width={18} height={18} {...p}><path d="M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2Z" /></svg>)
export const IconMail = (p: P) => (<svg {...base} width={18} height={18} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>)
export const IconWhatsapp = (p: P) => (<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.17c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.24-3.27-.68-2.77-1.09-4.53-3.92-4.67-4.1-.14-.19-1.12-1.49-1.12-2.84 0-1.35.71-2.02.96-2.29.24-.27.53-.34.7-.34.17 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.79 2.01.86 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.29.75 1.24 1.61 2.01 1.11.99 2.05 1.3 2.34 1.44.29.14.46.12.63-.07.17-.19.72-.85.91-1.14.19-.29.38-.24.64-.14.26.1 1.66.78 1.94.93.29.14.48.21.55.33.07.12.07.69-.17 1.36Z" /></svg>)
/* IconX is the close/dismiss glyph — two crossed strokes. It is used by the
   gallery lightbox and the assist chat. It is NOT the X logo; the social mark
   is IconXSocial below. */
export const IconX = (p: P) => (<svg {...base} {...p}><path d="M4 4l16 16M20 4 4 20" /></svg>)

/* ---- Social brand marks ----
   Filled, not outlined, and rendered as supplied: brand marks should not be
   restyled into a house line-icon set. Keep the whole row filled so it reads
   as one family. */
const brand = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' }

export const IconFacebook = (p: P) => (
  <svg {...brand} {...p}><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" /></svg>
)
export const IconXSocial = (p: P) => (
  <svg {...brand} {...p}><path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.94 21H2.92l7.06-8.07L2.25 3h6.05l4.18 5.52L17.53 3Zm-1.06 16.2h1.67L7.6 4.71H5.81l10.66 14.49Z" /></svg>
)
export const IconInstagram = (p: P) => (
  <svg {...brand} {...p}><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.98c-3.14 0-3.51.01-4.75.07-1.15.05-1.77.24-2.18.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.18-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05 1.15.24 1.77.4 2.18.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.18.4 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1.15-.05 1.77-.24 2.18-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.18.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-1.15-.24-1.77-.4-2.18-.21-.55-.47-.94-.88-1.35-.41-.41-.8-.67-1.35-.88-.41-.16-1.03-.35-2.18-.4-1.24-.06-1.61-.07-4.75-.07Zm0 3.37a4.49 4.49 0 1 1 0 8.98 4.49 4.49 0 0 1 0-8.98Zm0 7.4a2.91 2.91 0 1 0 0-5.82 2.91 2.91 0 0 0 0 5.82Zm5.72-7.6a1.05 1.05 0 1 1-2.1 0 1.05 1.05 0 0 1 2.1 0Z" /></svg>
)
export const IconLinkedin = (p: P) => (
  <svg {...brand} {...p}><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" /></svg>
)
export const IconYoutube = (p: P) => (
  <svg {...brand} {...p}><path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42A2.51 2.51 0 0 0 2.42 7.2 26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z" /></svg>
)
export const IconStar = (p: P) => (<svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 3 2.7 5.5 6 .9-4.35 4.24 1.03 6-5.38-2.83L6.6 19.6l1.03-6L3.3 9.4l6-.9L12 3Z" /></svg>)
export const IconArrowLeft = (p: P) => (<svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>)
export const IconArrowRight = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>)
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>)
export const IconTv = (p: P) => (<svg {...base} {...p}><rect x="2" y="7" width="20" height="13" rx="2" /><path d="m17 2-5 5-5-5" /></svg>)
export const IconShield = (p: P) => (<svg {...base} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>)
export const IconShower = (p: P) => (<svg {...base} {...p}><path d="M4 4h7a2 2 0 0 1 2 2v2" /><path d="M12 8a3 3 0 0 1 3 3v1H9v-1a3 3 0 0 1 3-3Z" /><path d="M10 16v1M14 16v1M12 19v1" /></svg>)
export const IconTowel = (p: P) => (<svg {...base} {...p}><path d="M4 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" /><path d="M4 9h16M8 14h8" /></svg>)
export const IconToiletries = (p: P) => (<svg {...base} {...p}><path d="M9 3h6v3H9zM10 6v3h4V6M8 9h8v12H8z" /></svg>)
export const IconBell = (p: P) => (<svg {...base} {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>)
export const IconSparkles = (p: P) => (<svg {...base} {...p}><path d="m12 3-1.9 5.8a2 2 0 0 1-1.2 1.2L3 12l5.8 1.9a2 2 0 0 1 1.2 1.2L12 21l1.9-5.8a2 2 0 0 1 1.2-1.2L21 12l-5.8-1.9a2 2 0 0 1-1.2-1.2L12 3Z" /><path d="M19 3v4M21 5h-4" /></svg>)
export const IconUser = (p: P) => (<svg {...base} {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)
export const IconBot = (p: P) => (<svg {...base} {...p}><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" /></svg>)
export const IconSend = (p: P) => (<svg {...base} {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>)
