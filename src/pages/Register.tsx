import { Link, useNavigate } from 'react-router-dom'
import { registerImages } from '../data/images.ts'
import { Field, PasswordField, Button, Logo } from '../components/ui.tsx'
import { HeroMedia } from '../components/media.tsx'
import { useForm, SuccessPanel, FormError, isEmail, isPhone, required } from '../components/forms.tsx'
import { register } from '../data/auth.ts'
import { refreshSession } from '../data/useSession.ts'
import type { RegisterPayload } from '../types.ts'
import Seo from '../components/Seo.tsx'

export default function Register() {
  const nav = useNavigate()
  const bg = registerImages[0]

  const f = useForm<RegisterPayload>(
    { fullName: '', email: '', phone: '', password: '', terms: false },
    (v) => {
      const e: Partial<Record<keyof RegisterPayload, string>> = {}
      if (!required(v.fullName)) e.fullName = 'Enter your full name'
      if (!isEmail(v.email)) e.email = 'Enter a valid email'
      if (!isPhone(v.phone)) e.phone = 'Enter a valid 10-digit phone'
      if (!v.password || v.password.length < 8) e.password = 'Minimum 8 characters'
      if (!v.terms) e.terms = 'Please accept the terms to continue'
      return e
    }
  )

  return (
    <>
      <Seo
        title="Create an Account"
        description="Create a Quadis Hotels account to book faster and keep your reservations in one place."
        noIndex
      />
      <section className="auth scrim">
        <HeroMedia src={bg} />
        <div className="auth__card auth__card--wide">
          <div className="auth__header">
            <Logo variant="auth" />
            <p className="auth__welcome">Create your account in seconds</p>
          </div>
          <div className="auth__body">
            {f.done ? (
              <SuccessPanel title="Account created">Welcome to Quadis. You can now sign in and start planning your stay.</SuccessPanel>
            ) : (
              <form className="auth__form" onSubmit={f.submit(async (v) => {
                await register({ fullName: v.fullName, email: v.email, phone: v.phone, password: v.password })
                await refreshSession()
                nav('/account')
              })} noValidate>
                <Field label="Full name" value={f.values.fullName} onChange={f.set('fullName')} error={f.errors.fullName} autoComplete="name" />
                <Field label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} autoComplete="email" />
                <Field label="Phone" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} placeholder="+91 " autoComplete="tel" />
                <PasswordField label="Password" value={f.values.password} onChange={f.set('password')} error={f.errors.password} autoComplete="new-password" />
                <label className={`checkbox checkbox--terms ${f.errors.terms ? 'is-error' : ''}`}>
                  <input type="checkbox" checked={f.values.terms} onChange={f.set('terms')} aria-invalid={!!f.errors.terms} />
                  <span>I agree to the <Link to="/contact">Terms</Link> &amp; <Link to="/contact">Privacy Policy</Link></span>
                </label>
                {f.errors.terms && <span className="field__error" role="alert">{f.errors.terms}</span>}
                <FormError message={f.submitError} />
                <Button as="button" type="submit" variant="primary" className="auth__submit" disabled={f.pending}>
                  {f.pending ? 'Creating…' : 'CREATE FREE ACCOUNT'}
                </Button>
              </form>
            )}
            <p className="auth__alt">Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
