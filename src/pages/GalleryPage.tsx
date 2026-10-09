import { PROPERTY_COUNT, GALLERY_COUNT } from '../data/site.ts'
import { useContent } from '../data/content.ts'
import { useState, useMemo } from 'react'
import {
  galleryAll,
  galleryDeluxe,
  gallerySuperior,
  galleryRoyal,
  galleryFacade,
  galleryDining,
  galleryBannerImage,
} from '../data/images.ts'
import { FilterPills } from '../components/ui.tsx'
import { PhotoHero, SectionHeader, Reveal } from '../components/blocks.tsx'
import { IconArrowLeft, IconArrowRight, IconX } from '../components/icons.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

type GalleryTab = 'All' | 'Deluxe Rooms' | 'Superior Rooms' | 'Royal Suites' | 'Facades & Lobbies' | 'Dining & Banquets'
const TABS: readonly GalleryTab[] = [
  'All',
  'Deluxe Rooms',
  'Superior Rooms',
  'Royal Suites',
  'Facades & Lobbies',
  'Dining & Banquets',
]

export default function GalleryPage() {
  const { t } = useContent()
  const [tab, setTab] = useState<GalleryTab>('All')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const images = useMemo(() => {
    switch (tab) {
      case 'Deluxe Rooms':
        return galleryDeluxe
      case 'Superior Rooms':
        return gallerySuperior
      case 'Royal Suites':
        return galleryRoyal
      case 'Facades & Lobbies':
        return galleryFacade
      case 'Dining & Banquets':
        return galleryDining
      case 'All':
      default:
        return galleryAll
    }
  }, [tab])

  // The client's own banner leads; the facade shot stays as the fallback.
  const heroImg = galleryBannerImage ?? galleryFacade[0] ?? galleryAll[0] ?? '/images/home/hero.webp'

  return (
    <>
      {/* The old description hardcoded "nine properties"; the replacement in
          src/data/seo.ts derives the count from PROPERTY_COUNT, and the hero
          doubles as the link-preview image so a shared /gallery URL previews
          with a photograph rather than the home-page fallback. */}
      <Seo {...pageSeo('/gallery')} image={heroImg} />
      <PhotoHero image={heroImg} title={t('gallery.hero.title')} sub={`A visual journey across our ${PROPERTY_COUNT} considered properties, refined suites, and grand banquets.`} height={galleryBannerImage ? 'banner' : 'short'} />

      <section className="section bg-cream gallery-page">
        <div className="container center-col">
          <SectionHeader overline={t('gallery.explore.overline')} title={`${GALLERY_COUNT} Moments of Calm & Comfort`} />
          
          <div className="gallery-page__filters">
            <FilterPills options={TABS} value={tab} onChange={setTab} ariaLabel="Filter photo gallery categories" />
          </div>

          <div className="gallery-page__grid card-grid--anim" key={tab}>
            {images.map((src, i) => (
              <Reveal key={`${src}-${i}`} className="gallery-page__item">
                <button
                  className="gallery-page__thumb"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open photo ${i + 1} in full screen`}
                >
                  <img
                    src={src}
                    alt={`Quadis Hotels ${tab} photograph ${i + 1}`}
                    loading="lazy"
                    className="gallery-page__img"
                  />
                  <span className="gallery-page__overlay">
                    <span className="gallery-page__zoom-label">View Full Screen</span>
                  </span>
                </button>
              </Reveal>
            ))}
          </div>

          {images.length === 0 && (
            <div className="empty-state">
              <p>No photographs available in this category yet.</p>
            </div>
          )}
        </div>
      </section>

      {lightboxIndex !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${tab} photograph view`}
          onClick={() => setLightboxIndex(null)}
        >
          <button className="lightbox__close" onClick={() => setLightboxIndex(null)} aria-label="Close photo view">
            <IconX />
          </button>
          <button
            className="lightbox__nav lightbox__nav--prev"
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex((i) => ((i! - 1 + images.length) % images.length))
            }}
            aria-label="Previous photograph"
          >
            <IconArrowLeft />
          </button>
          <img
            className="lightbox__img"
            src={images[lightboxIndex]}
            alt={`Quadis Hotels ${tab} full screen photograph`}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="lightbox__nav lightbox__nav--next"
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex((i) => ((i! + 1) % images.length))
            }}
            aria-label="Next photograph"
          >
            <IconArrowRight />
          </button>
          <span className="lightbox__count">
            {lightboxIndex + 1} / {images.length}
          </span>
        </div>
      )}
    </>
  )
}
