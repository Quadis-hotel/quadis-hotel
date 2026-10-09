import { useMemo, useState, useEffect } from 'react'
import { useContent } from '../data/content.ts'
import { useSearchParams } from 'react-router-dom'
import { useHotels, CITY_FILTERS } from '../data/hotels.ts'
import { readStayParams, buildStayParams } from '../data/stay.ts'
import { hotelsHero } from '../data/images.ts'
import type { CityFilter } from '../types.ts'
import { HotelCard, FilterPills } from '../components/ui.tsx'
import { HeroMedia } from '../components/media.tsx'
import { CtaBand } from '../components/blocks.tsx'
import UpcomingHotels from '../components/UpcomingHotels.tsx'
import TierExpansion from '../components/TierExpansion.tsx'
import NcrLocatorMap from '../components/NcrLocatorMap.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

const isCityFilter = (v: string | null): v is CityFilter => !!v && (CITY_FILTERS as readonly string[]).includes(v)

export default function HotelsList() {
  const { t } = useContent()
  const [params, setParams] = useSearchParams()
  const cityParam = params.get('city')
  const [cityFilter, setCityFilter] = useState<CityFilter>(isCityFilter(cityParam) ? cityParam : 'All')

  const hotels = useHotels()

  // Honor query params on load / when it changes externally.
  useEffect(() => {
    if (isCityFilter(cityParam) && cityParam !== cityFilter) setCityFilter(cityParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityParam])

  const onCityFilter = (v: CityFilter) => {
    setCityFilter(v)
    const next = new URLSearchParams(params)
    if (v === 'All') next.delete('city'); else next.set('city', v)
    setParams(next, { replace: true })
  }

  /*
   * The tier filter is gone. All nine properties are Quadis Central, so
   * "Select" and "Experience" always returned zero results and rendered their
   * raw enum values as pill labels. The three tiers are a roadmap, and are now
   * presented as one below via <TierExpansion />.
   */
  const filtered = useMemo(
    () => hotels.filter((h) => cityFilter === 'All' || h.city === cityFilter),
    [hotels, cityFilter]
  )

  /*
   * The dates and party the guest chose on the booking bar. This page does not
   * filter on them (availability is resolved on the property page), but it must
   * hand them on — otherwise choosing dates on the home page and clicking a
   * hotel drops them, and the guest is asked all over again.
   */
  const stayQuery = useMemo(() => {
    const stay = readStayParams(params)
    if (!stay.checkin) return ''
    return buildStayParams(stay).toString()
  }, [params])

  return (
    <>
      {/* pageSeo pins canonicalPath to /hotels, so the ?city= filter variants
          this page writes into the URL do not present to a crawler as three
          separate indexable pages carrying identical copy. */}
      <Seo {...pageSeo('/hotels')} />
      <section className="mini-hero scrim">
        <HeroMedia src={hotelsHero[0]} />
        <div className="container mini-hero__content">
          <span className="overline on-dark">{t('hotels.hero.overline')}</span>
          <h1 className="h1 on-dark mini-hero__title">{t('hotels.hero.title')}</h1>
        </div>
      </section>

      <section className="section bg-cream" id="hotel-grid">
        <div className="container">
          <div className="list-pills">
            <FilterPills options={CITY_FILTERS} value={cityFilter} onChange={onCityFilter} ariaLabel="Filter hotels by city" />
          </div>

          <p className="list-count meta">
            {filtered.length} propert{filtered.length === 1 ? 'y' : 'ies'}
            {cityFilter !== 'All' ? ` in ${cityFilter}` : ''}
          </p>

          {filtered.length > 0 ? (
            <div className="card-grid card-grid--anim" key={cityFilter}>
              {filtered.map((h) => (<HotelCard key={h.slug} hotel={h} stayQuery={stayQuery} />))}
            </div>
          ) : (
            <div className="list-empty">
              <p className="lead">No properties found matching the selected filters.</p>
              <button className="btn btn--ghost" onClick={() => { setCityFilter('All'); setParams({}) }}>Clear filters</button>
            </div>
          )}
        </div>
      </section>

      <NcrLocatorMap hotels={filtered} />

      <TierExpansion />

      <UpcomingHotels />

      {/* Default `to` is /hotels, which is this page — the button did nothing
          at all. Send them back up to the filters and the grid instead. */}
      <CtaBand href="#hotel-grid" />
    </>
  )
}
