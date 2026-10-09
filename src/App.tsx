import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Home from './pages/Home.tsx'
import About from './pages/About.tsx'
import VirtualTour from './pages/VirtualTour.tsx'
import GalleryPage from './pages/GalleryPage.tsx'
import HotelsList from './pages/HotelsList.tsx'
import BanquetsList from './pages/BanquetsList.tsx'
import Corporate from './pages/Corporate.tsx'
import Restaurant from './pages/Restaurant.tsx'
import CateringDetail from './pages/CateringDetail.tsx'
import Contact from './pages/Contact.tsx'
import Login from './pages/Login.tsx'
import Account from './pages/Account.tsx'
import Register from './pages/Register.tsx'
import NotFound from './pages/NotFound.tsx'
import AdminDashboard from './pages/AdminDashboard.tsx'
import CancellationPolicy from './pages/CancellationPolicy.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import TermsAndConditions from './pages/TermsAndConditions.tsx'
import { BanquetRoute, HotelRoute, LegacyRoomRedirect } from './components/LegacyRedirect.tsx'
import { LEGACY_PATHS } from './data/legacyRoutes.ts'

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about-us" element={<About />} />
        <Route path="/virtual-tour" element={<VirtualTour />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/hotels" element={<HotelsList />} />
        <Route path="/hotels/:slug" element={<HotelRoute />} />
        <Route path="/banquets" element={<BanquetsList />} />
        <Route path="/banquets/:slug" element={<BanquetRoute />} />
        <Route path="/corporate-hotel-booking" element={<Corporate />} />
        <Route path="/restaurant" element={<Restaurant />} />
        <Route path="/restaurant/outdoor-catering-service" element={<CateringDetail />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="/register" element={<Register />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />

        {/*
          Legacy URLs from the client's existing site. We cut over on the same
          domain, so these keep arriving from Google and from her backlinks —
          63 of her 74 indexed URLs land here. See src/data/legacyRoutes.ts and
          AGENTS.md 3a. Real 301s come from nginx; this is the fallback.
        */}
        {Object.entries(LEGACY_PATHS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {/*
          Her room pages sit at the top level, not under /hotels/, so this has
          to be a two-segment wildcard. It is declared last and React Router
          ranks static segments above dynamic ones, so no real route loses to
          it — and an unrecognised first segment falls through to NotFound
          rather than being redirected somewhere plausible-looking.
        */}
        <Route path="/:hotelSlug/:roomSlug" element={<LegacyRoomRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
