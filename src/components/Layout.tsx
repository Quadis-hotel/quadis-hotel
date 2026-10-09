import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.tsx'
import Footer from './Footer.tsx'
import QuadisAssistChat from './QuadisAssistChat.tsx'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    // Honour #anchors — scrolling to top unconditionally made every in-page
    // link in the nav and footer look broken.
    if (hash) {
      const target = document.querySelector(hash)
      if (target) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function Layout() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <QuadisAssistChat />
    </>
  )
}
