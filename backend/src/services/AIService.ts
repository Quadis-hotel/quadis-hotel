import Groq from 'groq-sdk'
import { GoogleGenAI } from '@google/genai'
import { db } from '../db'
import { notificationService } from './NotificationService'
import {
  policyFor,
  MEAL_PLAN_UPLIFT_PERCENT,
  GST_PERCENT_STANDARD,
  GST_PERCENT_LUXURY,
  GST_LUXURY_THRESHOLD_PER_ROOM_NIGHT,
} from '../lib/pricing'

export interface ChatTurnResult {
  reply: string
  toolsInvoked: string[]
  handoffTriggered: boolean
}

export class AIService {
  private groqClients: Groq[] = []
  private geminiClients: GoogleGenAI[] = []
  private currentGeminiKeyIndex = 0
  private currentKeyIndex = 0

  /**
   * Gemini models to try in order, best first.
   *
   * Free-tier quota is granted per project PER MODEL, so each entry here is a
   * separate daily allowance rather than a share of one. gemini-2.5-flash alone
   * is 20 requests/day, which a public site exhausts before lunch; the lighter
   * models carry the overflow. Override with GEMINI_MODELS (comma separated) to
   * retune without a code change — model names come and go.
   */
  private geminiModels: string[] =
    (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

  /** model -> epoch ms until which it is known-exhausted and worth skipping. */
  private modelCooldownUntil = new Map<string, number>()

  constructor() {
    // Collect keys from GROQ_API_KEYS (comma separated), GROQ_API_KEY, and GROQ_API_KEY_1..10
    const keysSet = new Set<string>()
    if (process.env.GROQ_API_KEYS) {
      process.env.GROQ_API_KEYS.split(',').map(k => k.trim()).filter(k => k && k.startsWith('gsk_')).forEach(k => keysSet.add(k))
    }
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_')) {
      keysSet.add(process.env.GROQ_API_KEY.trim())
    }
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GROQ_API_KEY_${i}`]
      if (k && k.startsWith('gsk_')) keysSet.add(k.trim())
    }

    
    const geminiKeysSet = new Set<string>()
    if (process.env.GEMINI_API_KEYS) {
      process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k).forEach(k => geminiKeysSet.add(k))
    }
    if (process.env.GEMINI_API_KEY) {
      geminiKeysSet.add(process.env.GEMINI_API_KEY.trim())
    }
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`]
      if (k) geminiKeysSet.add(k.trim())
    }

    geminiKeysSet.forEach(apiKey => {
      try {
        this.geminiClients.push(new GoogleGenAI({ apiKey }))
      } catch (err) {
        console.warn('Failed to initialize Gemini client for key:', err)
      }
    })

    if (this.geminiClients.length > 0) {
      // Log the model order too: free-tier quota is per project per model, so
      // which models are in the cascade decides the daily ceiling, and that is
      // the first thing worth knowing when the assistant goes quiet.
      console.log(
        `🤖 AIService initialized with ${this.geminiClients.length} rotating Gemini API key(s), ` +
        `models: ${this.geminiModels.join(' -> ')}`
      )
    }

    keysSet.forEach(apiKey => {
      try {
        this.groqClients.push(new Groq({ apiKey }))
      } catch (err) {
        console.warn('Failed to initialize Groq client for key:', err)
      }
    })

    if (this.groqClients.length > 0) {
      console.log(`🤖 AIService initialized with ${this.groqClients.length} rotating Groq API key(s).`)
    }

    // Warn only when BOTH pools are empty. This was tied to the Groq pool
    // alone, so a Gemini-only deploy — the working configuration — booted
    // announcing it had no usable key at all. A guard that fires while the
    // thing it guards is healthy is how the real warning gets ignored.
    if (this.geminiClients.length === 0 && this.groqClients.length === 0) {
      // With no clients neither provider loop runs, and every visitor gets the
      // deterministic engine at HTTP 200 — the assistant looks alive while
      // answering from a keyword table. Nothing else makes that visible.
      console.warn(
        '[Quadis] AIService has NO usable API key for either provider ' +
        '(GEMINI_API_KEY / GEMINI_API_KEYS / GEMINI_API_KEY_1..10, or ' +
        'GROQ_API_KEY / GROQ_API_KEYS / GROQ_API_KEY_1..10 which must begin ' +
        'with "gsk_"). The chat assistant will reply with static fallback text.'
      )
    }
  }

  
  private getNextGeminiClient(): GoogleGenAI | null {
    if (this.geminiClients.length === 0) return null
    const client = this.geminiClients[this.currentGeminiKeyIndex]
    this.currentGeminiKeyIndex = (this.currentGeminiKeyIndex + 1) % this.geminiClients.length
    return client
  }

  private getNextGroqClient(): Groq | null {
    if (this.groqClients.length === 0) return null
    const client = this.groqClients[this.currentKeyIndex]
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.groqClients.length
    return client
  }

  // Build a rich live system prompt injecting ALL hotel, room, and pricing data
  // This eliminates the need for RAG — the model has full knowledge of every property
  private async buildSystemPromptWithContext(): Promise<string> {
    const properties = await db.getPropertiesWithRooms()

    // This prompt is rebuilt and re-sent on EVERY request, and Groq's token
    // budget is a shared daily pool, so it must carry only what the model
    // cannot obtain from a tool. Room dimensions, bed types and live unit
    // counts moved out to search_hotels, which already returns them on demand.
    // The occupancy policy and the contact number are stated once rather than
    // duplicated across all nine properties.
    //
    // Occupancy pricing is per-property configurable, so it cannot simply be
    // hardcoded once: state the shared rule and then name any property that
    // deviates. A divergent property must never inherit the common rate — the
    // whole point of these bands is not under-quoting a guest with a child.
    const policies = properties.map((item) => ({ p: item.property, policy: policyFor(item.property) }))
    const shapeOf = (x: ReturnType<typeof policyFor>) =>
      `${x.extraAdultPercent}/${x.childFreeUnderAge}/${x.childPercent}/${x.adultFromAge}`
    const shapeCounts = new Map<string, number>()
    policies.forEach(({ policy }) => shapeCounts.set(shapeOf(policy), (shapeCounts.get(shapeOf(policy)) || 0) + 1))
    const commonShape = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const commonPolicy = policies.find(({ policy }) => shapeOf(policy) === commonShape)?.policy
    const outliers = policies.filter(({ policy }) => shapeOf(policy) !== commonShape)

    // Tabular, because a header row names each field once instead of repeating
    // the label on every row. Prose like "extra adult +30%, child free under 8,
    // 8-12 +20%" spends the same words again for every property that deviates.
    const occupancyRules = commonPolicy
      ? `Rate covers 2 adults/room. Additions, as % of that night's rate:
| Party | Charge |
|---|---|
| each adult beyond 2 | +${commonPolicy.extraAdultPercent}% |
| child under ${commonPolicy.childFreeUnderAge} | free |
| child ${commonPolicy.childFreeUnderAge}-${commonPolicy.adultFromAge - 1} | +${commonPolicy.childPercent}% |
| child ${commonPolicy.adultFromAge}+ | full adult |
ALWAYS ask a child's age before quoting. NEVER call a child free without it. NEVER quote 3 adults at the 2-adult rate.${
          outliers.length
            ? `\nEXCEPTIONS — use these instead of the table above:\n| Hotel | +adult | free under | mid-band | adult from |\n|---|---|---|---|---|\n${outliers
                .map(({ p, policy }) => `| ${p.name} | +${policy.extraAdultPercent}% | ${policy.childFreeUnderAge} | +${policy.childPercent}% | ${policy.adultFromAge} |`)
                .join('\n')}`
            : ''
        }`
      : ''

    // Tabular for the same reason as the policy above: one header row instead
    // of "— city, ⭐rating. address. From ₹x/night. Rooms:" restated nine times.
    // Prices are bare integers in ₹ per night, declared once in the caption.
    const hotelKnowledge = properties
      .map((item) => {
        const p = item.property
        const rooms = item.rooms
          .map((r) => `${r.name}[${r.slug}] ${p.base_price + r.price_offset}${r.is_available ? '' : ' SOLDOUT'}`)
          .join('; ')
        const flags = [
          p.weekend_surcharge_percent > 0 ? `+${p.weekend_surcharge_percent}% wknd` : '',
          p.is_active ? '' : 'INACTIVE-do-not-offer',
        ].filter(Boolean).join(' ')
        return `| ${p.name} | ${p.slug} | ${p.city} | ${p.rating} | ${p.base_price} | ${rooms} | ${p.address} | ${flags} |`
      })
      .join('\n')

    const contact = properties[0]?.property?.whatsapp || '+91 92173 73532'
    const email = properties[0]?.property?.email || 'stay@quadishotels.com'

    return `You are Quadis Assist, the official AI Concierge for Quadis Hotels — a premium hotel group across Noida and New Delhi.

PERSONALITY: Warm, professional, knowledgeable. Always helpful. Address guests by name if they share it. Format all prices in INR (₹). Always answer clearly and concisely.

TOOLS AT YOUR DISPOSAL:
1. search_hotels — Search real-time availability by city, name, dates, guest count
2. initiate_soft_hold — Reserve a room for 15 minutes (collect: property slug, room slug, dates, name, phone)
3. create_banquet_enquiry — Submit banquet/wedding/corporate RFP to management
4. check_booking_status — Look up reservation by booking code (e.g. QD-5JY4ZB7E)
5. human_handoff — Alert hotel management on WhatsApp for live human assistance

POLICIES (answer these without tools):
• Check-in 2:00 PM | Check-out 11:00 AM. Early/late subject to availability.
${occupancyRules}
• GST: ${GST_PERCENT_STANDARD}% under ₹${GST_LUXURY_THRESHOLD_PER_ROOM_NIGHT.toLocaleString('en-IN')}/night; ${GST_PERCENT_LUXURY}% at ₹${GST_LUXURY_THRESHOLD_PER_ROOM_NIGHT.toLocaleString('en-IN')}+ (SAC 996311)
• Cancellation: free up to 24 hours before check-in
• Payment: UPI/card/net banking via secure checkout, or cash at the property
• Pets: not allowed in standard rooms
• Booking codes are QD- followed by 8 characters
• Contact: ${contact} | ${email}

HOTELS — all prices ₹ per night, room-only, covering 2 adults:
| Hotel | slug | City | Rating | From | Rooms: name[slug] rate | Address | Notes |
|---|---|---|---|---|---|---|---|
${hotelKnowledge}

INSTRUCTIONS:
- Answer from the table above where you can — no tool needed for names, cities, addresses or rates.
- Call search_hotels for room size, bed type, live unit counts, or date-based availability. Those are deliberately absent above; do not guess them.
- Booking: collect name, phone and dates, then use initiate_soft_hold.
- Banquet/wedding/conference enquiries: use create_banquet_enquiry.
- A booking code like QD-5JY4ZB7E: use check_booking_status immediately.
- Upset, confused, or asking for a person: use human_handoff.

REPLY FORMAT — match it to the question, do not pick one style and reuse it:
- A single fact (check-in time, pets, GST): ONE short sentence. No preamble, no list.
- Several hotels or rates: short "• Name — from ₹X" lines, at most 5. Write prose, NOT a table — this is a narrow chat bubble, not a spreadsheet.
- Anything else: 2-3 sentences.
- Never restate the question, never open with "Certainly" or "I'd be happy to".
- End with one short question only when you genuinely need something (dates, city, a child's age).
- Confirm booking codes in bold.`
  }

  // Execute actual database tool based on tool name and arguments
  private async executeTool(toolName: string, args: any): Promise<{ result: any; handoff?: boolean }> {
    if (toolName === 'search_hotels') {
      const results = await db.searchHotelsForChat({
        search: args.query || args.search,
        city: args.city,
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        roomsCount: args.roomsCount ? Number(args.roomsCount) : undefined,
      })
      return {
        result: results.map((item) => ({
          hotel: item.property.name,
          slug: item.property.slug,
          city: item.property.city,
          address: item.property.address,
          rating: item.property.rating,
          availableRooms: item.rooms.map((r) => ({
            roomName: r.name,
            roomSlug: r.slug,
            size: r.size_sqft,
            bed: r.bed_type,
            maxGuests: r.max_guests,
            pricePerNight: `₹${r.currentPriceInr.toLocaleString('en-IN')}`,
            availableUnits: r.available_units,
          })),
        })),
      }
    }

    if (toolName === 'initiate_soft_hold') {
      const holdRes = await db.initiateBookingHold({
        propertySlug: args.propertySlug,
        roomTypeSlug: args.roomTypeSlug,
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        roomsCount: Number(args.roomsCount || 1),
        guestsCount: Number(args.guestsCount || 2),
        // Pass the split when the model collected it. The server re-derives the
        // extra-bed charge either way; if only guestsCount arrives, it treats
        // the whole party as adults, which errs toward charging rather than
        // undercharging.
        adultsCount: args.adultsCount !== undefined ? Number(args.adultsCount) : undefined,
        childAges: Array.isArray(args.childAges) ? args.childAges.map(Number) : undefined,
        guestName: args.guestName,
        guestPhone: args.guestPhone,
        guestEmail: args.guestEmail,
      })

      if (!holdRes.success || !holdRes.booking) {
        return { result: { success: false, error: holdRes.error || 'Failed to hold room inventory' } }
      }

      return {
        result: {
          success: true,
          bookingCode: holdRes.booking.booking_code,
          status: holdRes.booking.booking_status,
          totalAmount: `₹${Number(holdRes.booking.total_amount).toLocaleString('en-IN')}`,
          checkIn: holdRes.booking.check_in,
          checkOut: holdRes.booking.check_out,
          note: 'Room is held for exactly 15 minutes. Complete payment to confirm your reservation.',
        },
      }
    }

    if (toolName === 'create_banquet_enquiry') {
      const enq = await db.createEnquiry({
        enquiry_type: args.enquiryType || 'BANQUET',
        guest_name: args.guestName || 'Valued Guest',
        guest_phone: args.guestPhone || '9876543210',
        guest_email: args.guestEmail,
        event_date: args.eventDate,
        guest_count: args.guestCount ? Number(args.guestCount) : undefined,
        message: args.message || `AI Chatbot RFP (${args.enquiryType || 'Banquet'})`,
      })

      try {
        await notificationService.sendOwnerEnquiryAlert(enq)
      } catch (e) {
        console.error('Failed to notify owner of AI enquiry:', e)
      }

      return {
        result: {
          success: true,
          enquiryId: enq.id,
          status: enq.status,
          message: 'Your banquet/event request has been submitted directly to hotel management. Our event director will contact you within 2 hours.',
        },
      }
    }

    if (toolName === 'check_booking_status') {
      const booking = await db.getBookingByCode(args.bookingCode, args.guestPhone)
      if (!booking) {
        return { result: { found: false, message: `No booking found for code ${args.bookingCode}. Please verify the code or contact our desk.` } }
      }

      const prop = await db.getPropertyById(booking.property_id)
      const room = await db.getRoomTypeById(booking.room_type_id)

      return {
        result: {
          found: true,
          bookingCode: booking.booking_code,
          guestName: booking.guest_name,
          bookingStatus: booking.booking_status,
          paymentStatus: booking.payment_status,
          totalAmount: `₹${Number(booking.total_amount).toLocaleString('en-IN')}`,
          dates: `${booking.check_in} to ${booking.check_out}`,
          rooms: `${booking.rooms_count} room(s), ${booking.guests_count} guest(s)`,
          property: prop?.name || 'Quadis Hotel',
          roomCategory: room?.name || 'Room',
          address: prop?.address || '',
          checkInTime: '2:00 PM',
          checkOutTime: '11:00 AM',
        },
      }
    }

    if (toolName === 'human_handoff') {
      const enq = await db.createEnquiry({
        enquiry_type: 'GENERAL',
        guest_name: args.guestName || 'Guest via Chat',
        guest_phone: args.guestPhone || 'Via AI Chatbot',
        message: `🚨 HUMAN HANDOFF REQUESTED from Chatbot. Reason: ${args.reason || 'Guest requested live assistance'}`,
      })

      try {
        await notificationService.sendOwnerEnquiryAlert(enq)
      } catch (e) {
        console.error('Failed to notify owner of human handoff:', e)
      }

      return {
        result: {
          success: true,
          message: 'A hotel manager has been alerted on WhatsApp and will join or contact you shortly. Average response time: under 5 minutes.',
        },
        handoff: true,
      }
    }

    return { result: { error: `Unknown tool ${toolName}` } }
  }

  // Tool definitions for Groq LLM
  private getGroqTools(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_hotels',
          description: 'Search available Quadis properties and room categories by city, dates, name, or guest count. Use this when the guest wants to filter by specific availability or multi-criteria.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keywords, property name, or area' },
              city: { type: 'string', description: 'City name (Noida or New Delhi)' },
              checkIn: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
              checkOut: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
              roomsCount: { type: 'number', description: 'Number of rooms needed' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'initiate_soft_hold',
          description: '15-minute reservation hold. Collect name, phone, slugs and dates first.',
          parameters: {
            type: 'object',
            required: ['propertySlug', 'roomTypeSlug', 'checkIn', 'checkOut', 'guestName', 'guestPhone'],
            properties: {
              propertySlug: { type: 'string', description: 'Slug in [brackets] in the hotel list' },
              roomTypeSlug: { type: 'string', description: 'Room slug in [brackets], e.g. deluxe-room' },
              checkIn: { type: 'string', description: 'YYYY-MM-DD' },
              checkOut: { type: 'string', description: 'YYYY-MM-DD' },
              roomsCount: { type: 'number' },
              guestsCount: { type: 'number', description: 'Adults + children' },
              // These two used to state "18+" and "under 12 stay free", which
              // contradicted the occupancy policy in the system prompt (adult
              // from 13, free under 8) and is exactly how a guest gets quoted a
              // child rate they will not be billed. Defer to the policy instead
              // of restating thresholds that are per-property configurable.
              adultsCount: { type: 'number', description: 'Adults, per the age threshold in the occupancy policy' },
              childAges: {
                type: 'array',
                items: { type: 'number' },
                description: 'One entry per child. Charge follows the age bands in the occupancy policy — never assume free.',
              },
              guestName: { type: 'string' },
              guestPhone: { type: 'string', description: '10-digit mobile' },
              guestEmail: { type: 'string' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_banquet_enquiry',
          description: 'Submit a banquet, wedding, or corporate conference RFP/enquiry to hotel management.',
          parameters: {
            type: 'object',
            required: ['guestName', 'guestPhone'],
            properties: {
              guestName: { type: 'string' },
              guestPhone: { type: 'string' },
              guestEmail: { type: 'string' },
              eventDate: { type: 'string', description: 'Event date YYYY-MM-DD' },
              guestCount: { type: 'number', description: 'Expected number of guests' },
              enquiryType: { type: 'string', enum: ['BANQUET', 'CORPORATE_RFP', 'GENERAL'], description: 'Type of enquiry' },
              message: { type: 'string', description: 'Additional requirements or message' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_booking_status',
          description: 'Look up real-time status of an existing reservation by booking code.',
          parameters: {
            type: 'object',
            required: ['bookingCode'],
            properties: {
              bookingCode: { type: 'string', description: 'Booking code e.g. QD-5JY4ZB7E' },
              guestPhone: { type: 'string', description: 'Optional phone number for verification' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'human_handoff',
          description: 'Trigger an immediate WhatsApp alert to hotel management to take over or call the guest.',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Reason for requesting human assistance' },
              guestName: { type: 'string' },
              guestPhone: { type: 'string' },
            },
          },
        },
      },
    ]
  }

  public async chat(
    sessionId: string,
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<ChatTurnResult> {
    const toolsInvoked: string[] = []
    let handoffTriggered = false
    let reply = ''

    
    // 0. Gemini, cascading across MODELS and then keys.
    //
    // The free-tier quota id is GenerateRequestsPerDayPerProjectPerModel, and
    // the observed value for gemini-2.5-flash is 20 requests per day. Two
    // things follow from that name. Keys in one Google Cloud project share the
    // bucket, so rotating five of them buys nothing — which is why the
    // assistant kept dying after roughly twenty messages. And the bucket is
    // per MODEL, so a different model is a different allowance: falling through
    // to a lighter model on 429 multiplies capacity for free.
    //
    // Order matters — best model first, lighter ones as the overflow.
    const totalGeminiClients = this.geminiClients.length
    outer: for (const model of this.geminiModels) {
      // Skip a model we already know is exhausted. Without this every request
      // re-burns a round trip per key against a bucket that is empty until
      // tomorrow, adding seconds of latency before reaching a model that works.
      const until = this.modelCooldownUntil.get(model) ?? 0
      if (Date.now() < until) continue

      for (let attempt = 0; attempt < totalGeminiClients; attempt++) {
      const geminiClient = this.getNextGeminiClient()
      if (!geminiClient) break outer

      try {
        const systemPrompt = await this.buildSystemPromptWithContext()
        const contents: any[] = history.slice(-6).map((h) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        }))
        contents.push({ role: 'user', parts: [{ text: userMessage }] })

        const tools = [{ functionDeclarations: this.getGroqTools().map((t: any) => t.function) }]

        const response = await geminiClient.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            tools,
            temperature: 0.3,
            maxOutputTokens: 500
          }
        })

        if (response.functionCalls && response.functionCalls.length > 0) {
          contents.push({
            role: 'model',
            parts: response.functionCalls.map(fc => ({ functionCall: fc }))
          })

          const functionResponses: any[] = []
          for (const tc of response.functionCalls) {
            toolsInvoked.push(tc.name!)
            const { result, handoff } = await this.executeTool(tc.name!, tc.args as any)
            if (handoff) handoffTriggered = true
            functionResponses.push({
              functionResponse: {
                name: tc.name,
                // Gemini types this as Record<string, unknown> and rejects
                // anything that is not a JSON object. executeTool returns a
                // bare ARRAY for search_hotels, which failed the follow-up call
                // outright — and search_hotels is the tool most guests trigger,
                // so every availability question fell through Gemini, then
                // through a rate-limited Groq, to the canned engine. The plain
                // chat path hid it: tools are attached to every request, so a
                // greeting still worked and the provider looked healthy.
                // "output" is the key the API documents for function results.
                response: { output: result },
              }
            })
          }

          contents.push({
            role: 'user',
            parts: functionResponses
          })

          const followUp = await geminiClient.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              tools,
              temperature: 0.3,
              maxOutputTokens: 500
            }
          })
          reply = followUp.text || 'I have completed your request.'
        } else {
          reply = response.text || 'How can I assist you with your Quadis Hotels stay?'
        }

        return { reply, toolsInvoked, handoffTriggered }
      } catch (geminiErr: any) {
        const errMsg = geminiErr?.message || String(geminiErr)
        console.warn(`Gemini ${model} key ${attempt + 1}/${totalGeminiClients} failed (${errMsg}). Rotating...`)

        // A quota refusal is about the model's daily bucket, not this key, so
        // every remaining key in the same project will refuse identically.
        // Park the model and move to the next one instead of paying a round
        // trip per key to be told the same thing.
        if (/RESOURCE_EXHAUSTED|rate_?limit|quota|\b429\b/i.test(errMsg)) {
          // Google returns a retryDelay; when the bucket is daily that value is
          // only the next polite moment to retry, not when it refills. Clamp so
          // a bad parse can neither hammer the API nor sideline a model for
          // hours, and let a later request discover it has recovered.
          const secs = Number(errMsg.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 60)
          const cooldown = Math.min(Math.max(secs, 30), 900) * 1000
          this.modelCooldownUntil.set(model, Date.now() + cooldown)
          continue outer
        }
      }
      }
    }

    // 1. Try Groq API as fallback
    const totalClients = this.groqClients.length
    for (let attempt = 0; attempt < totalClients; attempt++) {
      const groqClient = this.getNextGroqClient()
      if (!groqClient) break

      try {
        const systemPrompt = await this.buildSystemPromptWithContext()

        const messages: any[] = [
          { role: 'system', content: systemPrompt },
          // Only the recent turns. The client posts its entire transcript, and
          // an unbounded history means a long chat re-sends every prior message
          // on every request — the cost grows quadratically against a shared
          // daily token pool. Six turns is enough to follow a booking thread.
          ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: userMessage },
        ]

        const completion = await groqClient.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages,
          tools: this.getGroqTools(),
          tool_choice: 'auto',
          temperature: 0.3,
          // Reserved against the daily token budget whether or not it is used,
          // so this ceiling is a direct cost lever. Replies are meant to be a
          // few sentences; 1024 was paying for headroom nothing needed.
          max_tokens: 500,
        })

        const choice = completion.choices[0]

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          messages.push(choice.message)

          for (const tc of choice.message.tool_calls) {
            toolsInvoked.push(tc.function.name)
            const args = JSON.parse(tc.function.arguments || '{}')
            const { result, handoff } = await this.executeTool(tc.function.name, args)
            if (handoff) handoffTriggered = true

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(result),
            })
          }

          // Follow-up completion with tool results using the same rotated client
          const followUp = await groqClient.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.3,
            max_tokens: 500,
          })
          reply = followUp.choices[0].message.content || 'I have completed your request.'
        } else {
          reply = choice.message.content || 'How can I assist you with your Quadis Hotels stay?'
        }

        return { reply, toolsInvoked, handoffTriggered }
      } catch (groqErr: any) {
        const errMsg = groqErr?.message || String(groqErr)
        console.warn(`Groq API key attempt ${attempt + 1}/${totalClients} failed (${errMsg}). Rotating to next key...`)
        if (attempt === totalClients - 1) {
          console.warn('All Groq API keys exhausted or rate-limited. Falling back to deterministic engine.')
        }
      }
    }

    // 2. Deterministic Fallback Engine (when API key missing or rate-limited)
    const lower = userMessage.toLowerCase()

    if (lower.includes('handoff') || lower.includes('human') || lower.includes('manager') || lower.includes('speak to')) {
      toolsInvoked.push('human_handoff')
      const { result, handoff } = await this.executeTool('human_handoff', { reason: userMessage, guestName: 'Guest via Chat' })
      handoffTriggered = Boolean(handoff)
      reply = `🔔 ${result.message}`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('qd-') || (lower.includes('booking') && lower.includes('status'))) {
      // Codes are `QD-` + 8 Crockford base32 symbols, not digits.
      const match = userMessage.match(/qd-[0-9a-hjkmnp-tv-z]{8}/i)
      if (match) {
        toolsInvoked.push('check_booking_status')
        const { result } = await this.executeTool('check_booking_status', { bookingCode: match[0].toUpperCase() })
        if (result.found) {
          reply = `📋 *Booking **${result.bookingCode}** — Live Status*\n` +
            `• Guest: ${result.guestName}\n` +
            `• Property: ${result.property} | ${result.roomCategory}\n` +
            `• Dates: ${result.dates}\n` +
            `• Rooms: ${result.rooms}\n` +
            `• Status: *${result.bookingStatus}* | Payment: *${result.paymentStatus}*\n` +
            `• Total: ${result.totalAmount}\n` +
            `• Check-in: ${result.checkInTime} | Check-out: ${result.checkOutTime}`
        } else {
          reply = `❌ ${result.message}`
        }
        return { reply, toolsInvoked, handoffTriggered }
      }
    }

    // NOTHING BELOW THIS POINT MAY WRITE TO THE DATABASE.
    //
    // This engine cannot see what the guest actually said — it only matches
    // keywords — so anything it stores is invented. It used to create a real
    // enquiry for any message containing "wedding", filed under guest name
    // "Valued Guest" with phone 9876543210 and a flat 150 guests, and to place
    // a real 15-minute inventory hold on hardcoded November dates for anything
    // containing "book a room". Both fired a WhatsApp alert to management, and
    // the rows are indistinguishable from genuine leads. Collect and hand off;
    // never invent a booking.
    const contactNumber = (await db.getProperties())[0]?.whatsapp || '+91 92173 73532'

    // Greetings and thanks. These previously fell through to the property dump
    // at the bottom, so "hi" was answered with three hotels and a price list.
    if (/^(hi|hii+|hey|hello|yo|namaste|hola|good\s+(morning|afternoon|evening))\b[\s!.,]*$/i.test(userMessage.trim())) {
      reply = `Hello! 👋 I'm Quadis Assist — rooms, banquets, or an existing booking. What do you need?`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (/^(thanks|thank you|thx|ty|ok|okay|cool|great|bye|goodbye)\b[\s!.,]*$/i.test(userMessage.trim())) {
      reply = `Happy to help! 🙏 Anything else, just ask.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    // Policy questions the prompt already answers without any lookup.
    if (lower.includes('check-in') || lower.includes('check in') || lower.includes('checkin') ||
        lower.includes('check-out') || lower.includes('check out') || lower.includes('checkout')) {
      reply = `Check-in *2:00 PM*, check-out *11:00 AM*. Early/late subject to availability — call ${contactNumber} and we'll try.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('pet') || lower.includes('dog') || lower.includes('cat')) {
      reply = `Sorry — pets aren't allowed in our standard rooms. For anything specific, please call ${contactNumber}.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('cancel') || lower.includes('refund')) {
      reply = `Free cancellation up to *24 hours* before check-in. Call ${contactNumber} with your QD- booking code.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('gst') || lower.includes('invoice') || lower.includes('tax')) {
      // The rate the concierge quotes has to be the rate the invoice charges,
      // so both come from the pricing library rather than from a literal here.
      // Client, 5 Aug 2026: "our gst is 5%, so please replace 12% with 5%".
      reply = `GST is *${GST_PERCENT_STANDARD}%* under ₹${GST_LUXURY_THRESHOLD_PER_ROOM_NIGHT.toLocaleString('en-IN')}/night, *${GST_PERCENT_LUXURY}%* at ₹${GST_LUXURY_THRESHOLD_PER_ROOM_NIGHT.toLocaleString('en-IN')}+. Invoice is issued against your booking code.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('pay') || lower.includes('upi') || lower.includes('card')) {
      reply = `UPI, card or net banking at checkout — or cash at the property. Book via *Check availability*, or call ${contactNumber}.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    // Occupancy and child pricing. This is the costliest question to get wrong
    // — answering "yes, children are free" to a parent of a 10-year-old
    // under-quotes a booking they are then billed for at the counter. It used
    // to fall through to a property search and answer "I couldn't match that to
    // a property", so the guest got nothing. State the real bands instead,
    // read from the property record rather than restated as literals here.
    if (lower.includes('child') || lower.includes('kid') || lower.includes('infant') ||
        lower.includes('extra adult') || lower.includes('extra bed') || lower.includes('occupancy') ||
        (lower.includes('adult') && (lower.includes('free') || lower.includes('charge') || lower.includes('cost')))) {
      const props = await db.getProperties()
      const pol = props[0] ? policyFor(props[0]) : null
      if (pol) {
        reply = `Rates cover *2 adults*. A 3rd adult adds *+${pol.extraAdultPercent}%*. ` +
          `Children under *${pol.childFreeUnderAge}* are free, *${pol.childFreeUnderAge}–${pol.adultFromAge - 1}* adds *+${pol.childPercent}%*, and *${pol.adultFromAge}+* counts as a full adult.\n\n` +
          `Ages? I'll quote exactly.`
        return { reply, toolsInvoked, handoffTriggered }
      }
    }

    // Banquets and events. Answer and route — do not file an enquiry the guest
    // did not actually give us the details for.
    if (lower.includes('banquet') || lower.includes('wedding') || lower.includes('conference') || lower.includes('corporate') || lower.includes('rfp') || lower.includes('event')) {
      reply = `We'd love to host it. 🎉 Send your date, guest count and city via our *Banquets* page and the events team replies with a proposal — or call ${contactNumber}.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    if (lower.includes('hold') || lower.includes('reserve') || lower.includes('book a room') || lower.includes('book a hotel') || lower.includes('booking')) {
      reply = `Happy to help. 🛎️ I'd rather not hold the wrong room — use *Check availability* to pick dates and confirm instantly, or call ${contactNumber}.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    // Where we are / how to get there. Checked BEFORE the room search because
    // "nearest hotel to noida airport" contains "hotel" and would otherwise be
    // treated as an inventory query and answered with a price list.
    if (lower.includes('where') || lower.includes('location') || lower.includes('address') ||
        lower.includes('direction') || lower.includes('airport') || lower.includes('metro') ||
        lower.includes('station') || lower.includes('near') || lower.includes('reach') ||
        lower.includes('map')) {
      const all = await db.getProperties()
      const wanted = lower.includes('delhi') ? 'new delhi' : lower.includes('noida') ? 'noida' : null
      const pool = wanted ? all.filter((p) => p.city.toLowerCase().includes(wanted)) : all
      const shown = pool.slice(0, 3)
      if (shown.length > 0) {
        const list = shown
          .map((p) => `• *${p.name.replace(/^Hotel\s+/i, '')}* — ${p.address}${p.map_link ? `\n  ${p.map_link}` : ''}`)
          .join('\n')
        const more = pool.length > 3 ? ` (+${pool.length - 3} more)` : ''
        reply = `${wanted ? `In ${shown[0].city}` : 'Where we are'}${more}:\n\n${list}\n\n` +
          `I can't measure distance from a landmark — the map links will, or call ${contactNumber}.`
        return { reply, toolsInvoked, handoffTriggered }
      }
    }

    // Meals. Percentage-based across the whole group since 5 Aug 2026, so the
    // headline is a single fact the concierge can state outright rather than a
    // per-room lookup: breakfast is 25% of the room rate everywhere.
    //
    // The rupee range is still read from the room rows, because "25%" alone is
    // not what a guest asking "how much is breakfast" wants to hear. Those
    // columns are recomputed from the same percentage by the schema migration on
    // every boot, so the range quoted here cannot drift from the amount the
    // checkout actually adds.
    if (lower.includes('breakfast') || lower.includes('meal') || lower.includes('food') ||
        lower.includes('dinner') || lower.includes('lunch')) {
      const withRooms = await db.getPropertiesWithRooms()
      const bf = withRooms.flatMap((i) => i.rooms.map((r: any) => Number(r.breakfast_offset))).filter((n) => n > 0)
      const am = withRooms.flatMap((i) => i.rooms.map((r: any) => Number(r.all_meals_offset))).filter((n) => n > 0)
      if (bf.length > 0) {
        const rng = (xs: number[]) => (Math.min(...xs) === Math.max(...xs)
          ? `₹${Math.min(...xs).toLocaleString('en-IN')}`
          : `₹${Math.min(...xs).toLocaleString('en-IN')}–₹${Math.max(...xs).toLocaleString('en-IN')}`)
        const bfPct = MEAL_PLAN_UPLIFT_PERCENT['With Breakfast']
        const amPct = MEAL_PLAN_UPLIFT_PERCENT['All Meals Included']
        reply = `Rooms are room-only as standard. Breakfast adds *${bfPct}%* to the room rate (${rng(bf)} per night)` +
          (am.length ? `, all meals *${amPct}%* (${rng(am)})` : '') + `.\n\n` +
          `It's the same percentage at every hotel, so the rupee amount follows the room — pick dates on the site to see yours.`
        return { reply, toolsInvoked, handoffTriggered }
      }
    }

    // Amenities we hold NO data for. Answering these from general knowledge of
    // what hotels usually offer is how a guest arrives expecting parking we
    // never promised. Say we'll check rather than guess.
    if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet') ||
        lower.includes('parking') || lower.includes('pool') || lower.includes('gym') ||
        lower.includes('laundry') || lower.includes('amenit') || lower.includes('facilit') ||
        lower.includes('ac ') || lower.includes('lift') || lower.includes('elevator')) {
      reply = `That varies by property and I'd rather not guess — WhatsApp ${contactNumber} and the team will confirm for the exact hotel.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    // Rooms, rates and availability. Only search when the guest actually asked
    // about staying somewhere — the old code ran this for EVERY unmatched
    // message, so "hi" was answered with a full inventory listing.
    // "under 2k", "below ₹3000", "cheapest", "budget" — parsed here rather than
    // inside the branch, because a budget question contains none of the keywords
    // below. "best under 2k" matched nothing and fell through to the generic
    // "here is what I can help with", which is a non-answer to a clear question.
    const capMatch = lower.match(/(?:under|below|less than|upto|up to|within)\s*₹?\s*(\d+(?:\.\d+)?)\s*(k)?/)
    const priceCap = capMatch ? Number(capMatch[1]) * (capMatch[2] ? 1000 : 1) : undefined

    const asksAboutRooms =
      priceCap !== undefined ||
      ['room', 'rate', 'price', 'cost', 'tariff', 'availab', 'stay', 'night', 'hotel', 'noida',
       'delhi', 'suite', 'deluxe', 'cheap', 'budget', 'affordab', 'best'].some((w) => lower.includes(w))

    const properties = await db.getProperties()

    if (asksAboutRooms) {
      toolsInvoked.push('search_hotels')
      const city = lower.includes('delhi') ? 'New Delhi' : lower.includes('noida') ? 'Noida' : undefined

      // NEVER pass the raw sentence as `search`. searchHotelsForChat substring-
      // matches the whole string against name/slug/city, so "best property in
      // noida" asks whether a hotel is literally called that and always returns
      // nothing. Every natural-language room question therefore answered "I
      // couldn't match that to a property" — the guest asked something
      // perfectly reasonable and got a dead end. Match on a property name only
      // when the guest actually named one.
      const named = (await db.getProperties()).find((p) => {
        const words = p.name.toLowerCase().replace(/^hotel\s+/, '').split(/\s+/).filter((w) => w.length > 3)
        return words.length > 0 && words.every((w) => lower.includes(w))
      })

      const { result } = await this.executeTool('search_hotels', { city, search: named?.name })

      const cheapestOf = (h: any): number =>
        h.availableRooms
          .map((r: any) => Number(String(r.pricePerNight).replace(/[^0-9]/g, '')))
          .filter((n: number) => n > 0)
          .sort((a: number, b: number) => a - b)[0]

      let matches: any[] = Array.isArray(result) ? result : []
      const capped = priceCap ? matches.filter((h) => cheapestOf(h) <= priceCap) : matches

      // A price cap that excludes everything is worth saying out loud rather
      // than reporting as "nothing found", which reads as "we have no hotels".
      if (priceCap && matches.length > 0 && capped.length === 0) {
        const lowest = Math.min(...matches.map(cheapestOf))
        reply = `Nothing under ₹${priceCap.toLocaleString('en-IN')}/night${city ? ` in ${city}` : ''} at the moment — our lowest there is *₹${lowest.toLocaleString('en-IN')}/night*.\n\nWant me to show what's closest to your budget, or call ${contactNumber} for current offers?`
        return { reply, toolsInvoked, handoffTriggered }
      }
      matches = capped

      if (matches.length > 0) {
        // Cheapest first — "best under 2k" and "cheapest room" both want this
        // order, and it was previously whatever the database returned.
        const sorted = [...matches].sort((a, b) => cheapestOf(a) - cheapestOf(b))
        // A table carries the same facts in a fraction of the characters, and
        // the bubble is ~340px wide. "Hotel " prefixes every name and buys
        // nothing, so it comes off.
        const rows = sorted
          .slice(0, 5)
          .map((h: any) => `• ${String(h.hotel).replace(/^Hotel\s+/i, '')} — from ₹${cheapestOf(h).toLocaleString('en-IN')}`)
          .join('\n')

        const more = sorted.length > 5 ? `\n+${sorted.length - 5} more.` : ''
        const head = priceCap
          ? `Under ₹${priceCap.toLocaleString('en-IN')}${city ? ` in ${city}` : ''}:`
          : city
            ? `In ${city}:`
            : `Our properties:`
        reply = `${head}\n\n${rows}${more}\n\nWhich dates?`
        return { reply, toolsInvoked, handoffTriggered }
      }

      reply = `I don't have anything matching that right now. We're across Noida and New Delhi — tell me the area and your dates, or call ${contactNumber} and our team will find you something.`
      return { reply, toolsInvoked, handoffTriggered }
    }

    // Genuinely unrecognised. Say what we can do, briefly — the old version
    // answered this with a five-item numbered menu and a "from ₹1,399/night"
    // claim that no property's rate actually supported.
    const cheapestOverall = properties
      .map((p) => p.base_price)
      .filter((n) => typeof n === 'number' && n > 0)
      .sort((a, b) => a - b)[0]

    reply = `I can help with rooms and availability across our ${properties.length} hotels in Noida and New Delhi` +
      `${cheapestOverall ? ` (from ₹${cheapestOverall.toLocaleString('en-IN')}/night)` : ''}` +
      `, banquet and event enquiries, or the status of an existing booking.\n\nWhat would you like to do? For anything urgent, call ${contactNumber}.`

    return { reply, toolsInvoked, handoffTriggered }
  }
}

export const aiService = new AIService()
