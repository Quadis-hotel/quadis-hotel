import { Button } from '../components/ui.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

export default function NotFound() {
  return (
    <>
      {/* The '/404' registry entry deliberately carries no canonicalPath: this
          component also renders in place of an unknown /hotels/:slug or
          /banquets/:slug, so the canonical has to be whatever URL was actually
          missed rather than a fixed one. noIndex comes from the registry. */}
      <Seo {...pageSeo('/404')} />
      <section className="section bg-cream">
        <div className="container center-col stack" style={{ gap: 24, minHeight: '46vh', justifyContent: 'center' }}>
          <span className="overline">404</span>
          <h1 className="h2">This page has checked out</h1>
          <p className="lead" style={{ maxWidth: 520 }}>
            The page you're looking for isn't here. Let's get you back to a warm welcome.
          </p>
          <Button to="/" variant="primary">RETURN HOME</Button>
        </div>
      </section>
    </>
  )
}
