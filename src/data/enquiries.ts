import { getApiUrl, describeApiFailure } from '../config/api'
import type { ContactType } from '../types.ts'

/**
 * The shape POST /api/enquiries actually validates (see backend/src/routes/enquiries.ts).
 * Keep these names camelCase — the zod schema rejects the snake_case DB record shape.
 */
export type EnquiryType = 'ROOM_HOLD' | 'BANQUET' | 'CORPORATE_RFP' | 'GENERAL'

const CONTACT_TYPE_TO_ENQUIRY: Record<ContactType, EnquiryType> = {
  General: 'GENERAL',
  Booking: 'ROOM_HOLD',
  Banquet: 'BANQUET',
  Corporate: 'CORPORATE_RFP',
  Feedback: 'GENERAL',
}

export const enquiryTypeFor = (type: ContactType): EnquiryType => CONTACT_TYPE_TO_ENQUIRY[type] ?? 'GENERAL'

export interface EnquiryInput {
  enquiryType: EnquiryType
  guestName: string
  guestPhone: string
  guestEmail?: string
  propertySlug?: string
  eventDate?: string
  guestCount?: number
  message?: string
}

/** Resolves on a confirmed 2xx. Throws with the server's reason otherwise. */
export async function submitEnquiry(input: EnquiryInput): Promise<void> {
  let res: Response
  try {
    res = await fetch(getApiUrl('enquiries'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error(describeApiFailure())
  }

  if (!res.ok) {
    let reason = ''
    try {
      const body = await res.json()
      const fieldErrors = body?.details ? Object.values(body.details).flat().filter(Boolean) : []
      reason = (fieldErrors[0] as string) || body?.error || ''
    } catch {
      // Non-JSON error body — a static host serving index.html for /api looks
      // exactly like this. describeApiFailure names that case.
    }
    throw new Error(reason || describeApiFailure(res.status))
  }
}
