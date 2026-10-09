import cron from 'node-cron'
import { db } from '../db'

export function startHoldCleanupWorker(intervalSchedule: string = '* * * * *') {
  console.log('⏳ Starting 15-Minute Soft Hold Cleanup Cron Worker (`node-cron`)...')
  
  const task = cron.schedule(intervalSchedule, async () => {
    try {
      const cleanedCount = await db.cleanupExpiredHolds(15)
      if (cleanedCount > 0) {
        console.log(`🧹 [Cron Worker] Released ${cleanedCount} expired soft hold(s) and restored inventory units back to available pool.`)
      }
    } catch (err: any) {
      console.error('❌ [Cron Worker] Error during hold cleanup:', err.message || err)
    }
  })

  return task
}
