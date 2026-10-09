import { useEffect, useRef } from 'react'

// Fade-up on entry, once. Honors prefers-reduced-motion via CSS (.reveal rules).
//
// Reliability matters more than the animation here: a reveal that never fires
// leaves a blank gap in the middle of the page. Three guards, in order —
//   1. reveal immediately if the element is already on screen at mount,
//   2. observe with threshold 0 so a single visible pixel is enough,
//   3. a timeout that reveals regardless, so nothing can stay hidden.
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const show = () => el.classList.add('in')

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      show()
      return
    }

    // Already visible on first paint (short pages, tall viewports, deep links,
    // or a restored scroll position). The observer would catch this too, but
    // doing it synchronously avoids a frame of blank space.
    const box = el.getBoundingClientRect()
    if (box.top < window.innerHeight && box.bottom > 0) {
      show()
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            show()
            io.unobserve(e.target)
          }
        })
      },
      // threshold 0: an element taller than the viewport may never reach a
      // fractional threshold. The bottom margin pre-triggers slightly before
      // entry so the fade has settled by the time it is read.
      { threshold: 0, rootMargin: '0px 0px 64px 0px' }
    )
    io.observe(el)

    // Last resort. If the observer never delivers — stale layout, an element
    // parked inside a scroll container — the content still appears.
    const failsafe = window.setTimeout(show, 3000)

    return () => {
      io.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [])

  return ref
}
