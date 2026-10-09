import { galleryFacade, galleryDeluxe, gallerySuperior, galleryRoyal, galleryDining, galleryAll } from './images.ts'

export type TourProperty = 'all' | 'noida' | 'airport' | 'banquets'
export type TourZone = 'lobby' | 'deluxe' | 'royal' | 'dining'

export interface HotspotPin {
  id: string
  x: number // percentage 0-100
  y: number // percentage 0-100
  title: string
  specification: string
}

export interface DayNightPair {
  dayImage: string
  nightImage: string
  dayLabel: string
  nightLabel: string
}

export interface RoomCustomizerOption {
  category: 'firmness' | 'view' | 'amenity'
  label: string
  options: { id: string; name: string; priceDelta: number }[]
}

export interface SpatialStop {
  id: string
  property: TourProperty
  zone: TourZone
  propertyName: string
  zoneName: string
  title: string
  description: string
  getImage: () => string
  pins?: HotspotPin[]
  dayNightPair?: DayNightPair
  customizer?: RoomCustomizerOption[]
  basePriceNight?: number
}

// Helper safely retrieving photo without repetition across stops
const getPhoto = (pool: string[], index: number, fallbackPool: string[], fallbackIndex: number): string => {
  if (pool && pool.length > 0) {
    const item = pool[index % pool.length]
    if (item) return item
  }
  if (fallbackPool && fallbackPool.length > 0) {
    const item = fallbackPool[fallbackIndex % fallbackPool.length]
    if (item) return item
  }
  return '/images/home/hero.webp'
}

export const TOUR_PROPERTIES: { id: TourProperty; label: string }[] = [
  { id: 'all', label: 'All Quadis Properties' },
  { id: 'noida', label: 'Quadis Sector 51 Noida' },
  { id: 'airport', label: 'Quadis Delhi Airport Hub' },
  { id: 'banquets', label: 'Grand Banquets & Dining' },
]

export const TOUR_ZONES: { id: TourZone; label: string }[] = [
  { id: 'lobby', label: 'Grand Lobbies & Facades' },
  { id: 'deluxe', label: 'Deluxe & Superior Rooms' },
  { id: 'royal', label: 'Royal Suites & Baths' },
  { id: 'dining', label: 'Fine Dining & Banquets' },
]

// Guaranteed non-repeating spatial stops across EVERY property + zone combination
export const SPATIAL_STOPS: SpatialStop[] = [
  // ==========================================
  // NOIDA PROPERTY
  // ==========================================
  {
    id: 'noida-lobby-1',
    property: 'noida',
    zone: 'lobby',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Ground Floor • Grand Reception',
    title: 'The Calm Welcome Atrium',
    description: 'Step into a quiet sanctuary designed around considered human warmth. Check-in takes seconds while you enjoy artisanal welcome teas in our sunlit atrium.',
    getImage: () => getPhoto(galleryFacade, 0, galleryAll, 0),
    pins: [
      {
        id: 'pin-nl-1',
        x: 48,
        y: 62,
        title: 'Bespoke Italian Marble Flooring',
        specification: 'Hand-selected Carrara marble slabs polished with acoustic dampening underlayment for silent footfall.'
      },
      {
        id: 'pin-nl-2',
        x: 72,
        y: 35,
        title: 'Custom Brass Chandelier Atrium Glow',
        specification: 'Multi-tiered warm 2700K LED illumination calibrated specifically to reduce traveler eye strain.'
      }
    ],
    dayNightPair: {
      dayImage: getPhoto(galleryFacade, 0, galleryAll, 0),
      nightImage: getPhoto(galleryFacade, 1, galleryAll, 1),
      dayLabel: 'Sunlit Morning Atrium',
      nightLabel: 'Evening Ambient Turn-Down Glow'
    }
  },
  {
    id: 'noida-lobby-2',
    property: 'noida',
    zone: 'lobby',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Private Driveway & Courtyard',
    title: 'Secure Executive Porte-Cochere',
    description: 'A discreet, tree-lined private driveway ensures effortless drop-offs and valet parking away from city traffic noise.',
    getImage: () => getPhoto(galleryFacade, 2, galleryAll, 2),
  },
  {
    id: 'noida-deluxe-1',
    property: 'noida',
    zone: 'deluxe',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Level 2 • Deluxe Comfort Suite',
    title: 'Considered Comfort Sanctuary',
    description: 'Every square foot is engineered for deep rest: orthopedic pillow-top mattresses, blackout velvet curtains, and silent inverter climate control.',
    basePriceNight: 3500,
    getImage: () => getPhoto(galleryDeluxe, 0, galleryAll, 3),
    pins: [
      {
        id: 'pin-nd-1',
        x: 50,
        y: 58,
        title: 'Orthopedic Pillow-Top Bed',
        specification: '300-thread-count Egyptian cotton linens, hypoallergenic goose-down duvets, and customizable firmness.'
      },
      {
        id: 'pin-nd-2',
        x: 82,
        y: 65,
        title: 'Ergonomic Executive Workstation',
        specification: 'Solid oak writing desk with integrated international power outlets and high-speed charging ports.'
      }
    ],
    dayNightPair: {
      dayImage: getPhoto(galleryDeluxe, 0, galleryAll, 3),
      nightImage: getPhoto(galleryDeluxe, 1, galleryAll, 4),
      dayLabel: 'Natural Daytime Brightness',
      nightLabel: 'Cozy Evening Turn-Down Service'
    },
    customizer: [
      {
        category: 'firmness',
        label: 'Mattress Firmness Selection',
        options: [
          { id: 'plush', name: 'Plush Cloud Pillow-Top', priceDelta: 0 },
          { id: 'med', name: 'Medium Orthopedic Support', priceDelta: 0 },
          { id: 'firm', name: 'Firm Contour Spine Support', priceDelta: 0 }
        ]
      },
      {
        category: 'view',
        label: 'Room Orientation & View',
        options: [
          { id: 'courtyard', name: 'Private Garden Courtyard View', priceDelta: 0 },
          { id: 'skyline', name: 'Panoramic City Skyline (+INR 400)', priceDelta: 400 }
        ]
      },
      {
        category: 'amenity',
        label: 'VIP Welcome Amenity Basket',
        options: [
          { id: 'fruit', name: 'Organic Fruit & Tea Basket', priceDelta: 0 },
          { id: 'champagne', name: 'Moet & Chandon with Truffles (+INR 2,800)', priceDelta: 2800 }
        ]
      }
    ]
  },
  {
    id: 'noida-deluxe-2',
    property: 'noida',
    zone: 'deluxe',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Level 3 • Superior Balcony Room',
    title: 'Private Open-Air Terrace Chamber',
    description: 'Step out onto a private teak-wood balcony overlooking the tranquil central water fountain and manicured herb garden.',
    basePriceNight: 4100,
    getImage: () => getPhoto(gallerySuperior, 0, galleryAll, 5),
  },
  {
    id: 'noida-deluxe-3',
    property: 'noida',
    zone: 'deluxe',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Level 3 • Executive Club Suite',
    title: 'Spacious Corner Executive Suite',
    description: 'Designed for extended business stays, offering dual aspect soundproof windows and a dedicated lounge seating area.',
    basePriceNight: 4400,
    getImage: () => getPhoto(gallerySuperior, 1, galleryAll, 6),
  },
  {
    id: 'noida-royal-1',
    property: 'noida',
    zone: 'royal',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Top Level • Royal Master Chamber',
    title: 'The Pinnacle of Quadis Living',
    description: 'Our most expansive residential-style suite featuring a private dining lounge, wet bar, master bedroom, and dedicated 24-hour concierge service.',
    basePriceNight: 6500,
    getImage: () => getPhoto(galleryRoyal, 0, galleryAll, 7),
    pins: [
      {
        id: 'pin-nr-1',
        x: 45,
        y: 55,
        title: 'Master King Chamber & Lounge',
        specification: 'Separate living area with hand-woven silk carpets, 65-inch 4K OLED Smart display, and complimentary minibar.'
      }
    ]
  },
  {
    id: 'noida-royal-2',
    property: 'noida',
    zone: 'royal',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Top Level • En-Suite Spa Bath',
    title: 'Italian Marble Sanctuary Bath',
    description: 'Indulge in a deep soaking freestanding tub, oversized walk-in rainfall shower, and custom organic sandalwood bath amenities.',
    basePriceNight: 6500,
    getImage: () => getPhoto(galleryRoyal, 1, galleryAll, 8),
    pins: [
      {
        id: 'pin-nr-2',
        x: 60,
        y: 65,
        title: 'Walk-In Monsoon Rainfall Shower',
        specification: 'High-pressure brass ceiling rainfall head with thermostatic precision temperature control.'
      }
    ]
  },
  {
    id: 'noida-dining-1',
    property: 'noida',
    zone: 'dining',
    propertyName: 'Quadis Sector 51 Noida',
    zoneName: 'Lobby Level • The Spice Lounge',
    title: 'Artisanal All-Day Culinary Lounge',
    description: 'Featuring curated North Indian and Continental delicacies prepared from farm-fresh local organic ingredients.',
    getImage: () => getPhoto(galleryDining, 0, galleryAll, 9),
  },

  // ==========================================
  // AIRPORT PROPERTY
  // ==========================================
  {
    id: 'airport-lobby-1',
    property: 'airport',
    zone: 'lobby',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Express Check-In Concierge',
    title: 'Seamless Transit Reception',
    description: 'Located minutes from T3, our Airport Hub reception operates 24/7 with zero waiting time, express luggage forwarding, and executive transit showers.',
    getImage: () => getPhoto(galleryFacade, 3, galleryAll, 10),
    pins: [
      {
        id: 'pin-al-1',
        x: 55,
        y: 50,
        title: '24/7 Concierge & Luggage Desk',
        specification: 'Instant digital key provisioning and complimentary executive airport shuttle scheduling.'
      }
    ]
  },
  {
    id: 'airport-lobby-2',
    property: 'airport',
    zone: 'lobby',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Transit Lounge & Business Center',
    title: 'Executive Departure Lounge',
    description: 'Relax before international departures with high-speed fiber Wi-Fi, private acoustic phone booths, and gourmet refreshments.',
    getImage: () => getPhoto(galleryFacade, 4, galleryAll, 11),
  },
  {
    id: 'airport-deluxe-1',
    property: 'airport',
    zone: 'deluxe',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Level 3 • Soundproof Transit Haven',
    title: 'Absolute Silence Transit Room',
    description: 'Equipped with triple-glazed acoustic windows that block 99% of ambient jet noise, ensuring deep rejuvenating rest before your next connection.',
    basePriceNight: 3800,
    getImage: () => getPhoto(galleryDeluxe, 2, galleryAll, 12),
    pins: [
      {
        id: 'pin-ad-1',
        x: 35,
        y: 42,
        title: 'Triple-Glazed Acoustic Windows',
        specification: 'Tested to 48dB noise reduction rating with motorized blackout roller shades controlled from bedside.'
      }
    ]
  },
  {
    id: 'airport-deluxe-2',
    property: 'airport',
    zone: 'deluxe',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Level 4 • Superior Runway Suite',
    title: 'Panoramic Runway Observation Room',
    description: 'Enjoy sweeping unobstructed views of the aviation corridor while remaining cocooned in complete interior stillness.',
    basePriceNight: 4200,
    getImage: () => getPhoto(gallerySuperior, 2, galleryAll, 13),
  },
  {
    id: 'airport-royal-1',
    property: 'airport',
    zone: 'royal',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Level 5 • Presidential Transit Suite',
    title: 'Executive Diplomatic Chamber',
    description: 'Designed for visiting dignitaries and C-suite executives, featuring a private meeting room for up to 6 guests right inside your suite.',
    basePriceNight: 6800,
    getImage: () => getPhoto(galleryRoyal, 2, galleryAll, 14),
  },
  {
    id: 'airport-dining-1',
    property: 'airport',
    zone: 'dining',
    propertyName: 'Quadis Delhi Airport Hub',
    zoneName: 'Rooftop • The Horizon Cafe',
    title: '24-Hour International Dining Lounge',
    description: 'Whether arriving at 3 AM or departing at noon, our master chefs serve fresh hot gourmet meals around the clock.',
    getImage: () => getPhoto(galleryDining, 1, galleryAll, 15),
  },

  // ==========================================
  // BANQUETS & RESTAURANTS PROPERTY
  // ==========================================
  {
    id: 'banquets-lobby-1',
    property: 'banquets',
    zone: 'lobby',
    propertyName: 'Grand Banquets & Dining',
    zoneName: 'Grand Foyer & Welcoming Hall',
    title: 'The Grand Imperial Entrance',
    description: 'An imposing double-height foyer designed to welcome up to 500 wedding or gala guests in uncompromised architectural luxury.',
    getImage: () => getPhoto(galleryFacade, 5, galleryAll, 16),
  },
  {
    id: 'banquets-deluxe-1',
    property: 'banquets',
    zone: 'deluxe',
    propertyName: 'Grand Banquets & Dining',
    zoneName: 'VIP Dressing & Bride Suite',
    title: 'Private Celebration Dressing Suite',
    description: 'Dedicated dressing chambers adjacent to the grand halls, equipped with full-length three-way vanity lighting and private lounge seating.',
    basePriceNight: 3600,
    getImage: () => getPhoto(galleryDeluxe, 3, galleryAll, 17),
  },
  {
    id: 'banquets-royal-1',
    property: 'banquets',
    zone: 'royal',
    propertyName: 'Grand Banquets & Dining',
    zoneName: 'VIP Host Presidential Quarters',
    title: 'The Host Family Master Suite',
    description: 'Exquisite luxury accommodations for event hosts, featuring private elevator access directly to the Imperial Ballroom stage.',
    basePriceNight: 7200,
    getImage: () => getPhoto(galleryRoyal, 3, galleryAll, 18),
  },
  {
    id: 'banquets-dining-1',
    property: 'banquets',
    zone: 'dining',
    propertyName: 'Grand Banquets & Dining',
    zoneName: 'Main Restaurant • The Spice Atrium',
    title: 'Culinary Excellence All Day',
    description: 'Our flagship dining room serving curated Indian, Continental, and Oriental cuisines prepared by award-winning master chefs using fresh farm ingredients.',
    getImage: () => getPhoto(galleryDining, 2, galleryAll, 19),
    pins: [
      {
        id: 'pin-bd-1',
        x: 52,
        y: 60,
        title: 'Handcrafted Velvet Seating',
        specification: 'Plush velvet armchairs with spacious table arrangements ensuring privacy for intimate or business dinners.'
      }
    ]
  },
  {
    id: 'banquets-dining-2',
    property: 'banquets',
    zone: 'dining',
    propertyName: 'Grand Banquets & Dining',
    zoneName: 'Grand Ballroom • Imperial Hall',
    title: 'A Grand Arena for Celebrations',
    description: 'Designed with state-of-the-art acoustic ceilings, custom ambient chandeliers, and pillar-less architecture accommodating up to 500 distinguished guests.',
    getImage: () => getPhoto(galleryDining, 3, galleryAll, 20),
    pins: [
      {
        id: 'pin-bd-2',
        x: 50,
        y: 28,
        title: 'Pillar-Less Acoustic Dome Ceiling',
        specification: 'Architecturally engineered for unobstructed sightlines and crystal-clear speech intelligibility across the entire hall.'
      }
    ],
    dayNightPair: {
      dayImage: getPhoto(galleryDining, 3, galleryAll, 20),
      nightImage: getPhoto(galleryDining, 4, galleryAll, 21),
      dayLabel: 'Corporate Conference Setup',
      nightLabel: 'Grand Wedding & Gala Celebration'
    }
  }
]
