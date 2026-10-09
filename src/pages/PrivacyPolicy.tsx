import { Reveal } from '../components/blocks.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

/**
 * Ported from the client's existing site, read off
 * https://www.quadishotels.com/privacy-policy on 30 Jul 2026. Her page is
 * indexed and would 404 after the cutover, since we move onto the same domain.
 *
 * Her wording is kept. One thing was corrected: the live page gives the contact
 * address as "info.quadishotels.com or wecare.quadishotels.com" — a dot where
 * an @ belongs, on both. `info@quadishotels.com` is confirmed live (it is the
 * address in her own footer and the MX records point at Google Workspace).
 * `wecare@` is NOT confirmed and is therefore left out rather than guessed at;
 * a privacy policy that names an address nobody reads is worse than one that
 * names a single address that works. Ask her whether wecare@ exists.
 */
export default function PrivacyPolicy() {
  return (
    <>
      {/* canonicalPath is still pinned — it now comes from the registry entry,
          because /privacy-policy is one of the URLs already in Google's index
          off the client's existing site and must not self-canonicalise onto a
          query-string variant. */}
      <Seo {...pageSeo('/privacy-policy')} />
      <div className="page-head bg-cream">
        <div className="container center-col">
          <h1 className="h1 h1--single-line">Privacy Policy</h1>
          <p className="lead">
            At Quadis Group of Hotels, we prioritise your privacy and dedicate ourselves to safeguarding your personal information. This policy describes how we collect, use and store your data when you visit our website, make reservations, or experience our guest services.
          </p>
        </div>
      </div>

      <section className="section bg-warm">
        <div className="container" style={{ maxWidth: '800px' }}>
          <Reveal className="prose">
            <h2 className="h3 mt-0">What we collect</h2>
            <p>
              We store your personal data, such as your name, email ID, phone number and booking details, when you interact with our services or our website. We use your information to process reservations, provide customer support, enhance our services and improve your overall guest experience.
            </p>

            <h2 className="h3">Key highlights</h2>
            <ul>
              <li>Secure collection and storage of personal data</li>
              <li>Use of information for bookings, communication and service improvement</li>
              <li>No selling or renting of customer data</li>
              <li>Sharing data only with trusted service providers when necessary</li>
              <li>Use of cookies to enhance website performance and user experience</li>
              <li>Option to manage or disable cookies via browser settings</li>
            </ul>

            <h2 className="h3">How your data is protected</h2>
            <p>
              Quadis Hotels ensures that your information is securely stored and protected against unauthorised access, misuse or disclosure. We do not sell or rent your personal data to third parties. However, we may share your data with trusted service providers for payment processing, booking management or legal compliance, ensuring your information remains safe.
            </p>

            <h2 className="h3">Your agreement</h2>
            <p>
              By using our website and services, you agree to the terms of this Privacy Policy. Your trust is very important to us, and we are committed to maintaining the security and confidentiality of your information.
            </p>

            <h2 className="h3">Contact</h2>
            <p>
              If you have any queries or concerns regarding your personal data, please contact:<br/><br/>
              <strong>Quadis Services Private Limited</strong><br/>
              Brand: Quadis Hotels<br/>
              Email: <a href="mailto:info@quadishotels.com">info@quadishotels.com</a><br/>
              Phone: +91 92173 73532
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}
