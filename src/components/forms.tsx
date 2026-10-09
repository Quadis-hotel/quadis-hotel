import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { IconCheck } from './icons.tsx'
import type { FormErrors } from '../types.ts'

export const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
export const isPhone = (v: string): boolean => /^[0-9]{10}$/.test(v.replace(/[\s+]/g, '').replace(/^91/, ''))
export const required = (v: unknown): boolean => !!(v && String(v).trim())

type Validate<T> = (values: T) => FormErrors<T>
type FieldEvent = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>

export interface UseForm<T> {
  values: T
  errors: FormErrors<T>
  set: (name: keyof T) => (e: FieldEvent) => void
  submit: (onValid?: (values: T) => void | Promise<void>) => (e: FormEvent) => void
  pending: boolean
  done: boolean
  submitError: string | null
  reset: () => void
}

// Small controlled-form helper: values, errors, and a submit gate.
export function useForm<T extends object>(initial: T, validate: Validate<T>): UseForm<T> {
  const [values, setValues] = useState<T>(initial)
  const [errors, setErrors] = useState<FormErrors<T>>({})
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const set = (name: keyof T) => (e: FieldEvent) => {
    const target = e.target as HTMLInputElement
    const v = target.type === 'checkbox' ? target.checked : target.value
    setValues((s) => ({ ...s, [name]: v }) as T)
    if (errors[name]) setErrors((s) => ({ ...s, [name]: undefined }))
  }

  const submit = (onValid?: (values: T) => void | Promise<void>) => async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (first) first.focus()
      return
    }
    setPending(true)
    setSubmitError(null)
    try {
      if (onValid) {
        await onValid(values)
      }
      setDone(true)
    } catch (err) {
      // Never show the success panel on a failed submit, and never fail silently —
      // the guest needs to know the message did not go through.
      console.error('Error submitting form:', err)
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return {
    values,
    errors,
    set,
    submit,
    pending,
    done,
    submitError,
    reset: () => { setValues(initial); setErrors({}); setDone(false); setSubmitError(null) },
  }
}

/** Renders nothing until a submit actually fails. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="form-error" role="alert">{message}</p>
  )
}

interface SuccessPanelProps {
  title?: string
  children: ReactNode
  onReset?: () => void
}
export function SuccessPanel({ title = 'Thank you', children, onReset }: SuccessPanelProps) {
  return (
    <div className="success" role="status">
      <span className="success__icon"><IconCheck /></span>
      <h3 className="h3">{title}</h3>
      <p>{children}</p>
      {onReset && <button type="button" className="success__again" onClick={onReset}>Send another</button>}
    </div>
  )
}
