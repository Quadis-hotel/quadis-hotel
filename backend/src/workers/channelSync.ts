import cron from 'node-cron'
import { db } from '../db'
import { channelManager } from '../services/ChannelManagerService'

/**
 * Retries reservation pushes to ResAvenue.
 *
 * The Razorpay webhook fires the first push the moment a payment is captured,
 * but the channel manager can be down, slow, or not yet configured at that
 * moment, and a Confirm that never arrives is a room sold twice — once here
 * and once on an OTA that still shows it free. So anything PENDING or FAILED
 * is retried on a schedule until it is SENT or has used up its attempts, at
 * which point it stays FAILED with cm_last_error on the row for a human.
 *
 * Idle when RESAVENUE_PUSH_URL is unset: there is nowhere to send to, and the
 * pull endpoint serves the same rows on demand.
 */
export const CHANNEL_SYNC_MAX_ATTEMPTS = 12

export async function runChannelSyncOnce(): Promise<{ attempted: number; sent: number }> {
  if (!process.env.RESAVENUE_PUSH_URL?.trim()) return { attempted: 0, sent: 0 }
  const owed = await db.getBookingsPendingChannelSync(CHANNEL_SYNC_MAX_ATTEMPTS)
  let sent = 0
  for (const booking of owed) {
    const result = await channelManager.pushBooking(booking)
    if (result.success) sent += 1
  }
  return { attempted: owed.length, sent }
}

export function startChannelSyncWorker(intervalSchedule: string = '*/5 * * * *') {
  if (!process.env.RESAVENUE_PUSH_URL?.trim()) {
    console.log('🔁 Channel-manager push is idle — RESAVENUE_PUSH_URL is not set; reservations remain available to pull.')
  } else {
    console.log('🔁 Starting ResAvenue reservation push worker (every 5 minutes)...')
  }

  return cron.schedule(intervalSchedule, async () => {
    try {
      const { attempted, sent } = await runChannelSyncOnce()
      if (attempted > 0) {
        console.log(`🔁 [Channel sync] pushed ${sent} of ${attempted} owed reservation(s) to ResAvenue.`)
      }
    } catch (err: any) {
      console.error('❌ [Channel sync] Error during reservation push:', err.message || err)
    }
  })
}
