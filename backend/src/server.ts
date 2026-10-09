import dotenv from 'dotenv'
dotenv.config()

import { createApp } from './app'
import { startHoldCleanupWorker } from './workers/holdCleanup'
import { startChannelSyncWorker } from './workers/channelSync'
import { runMigrations } from './db/migrate'

const PORT = process.env.PORT || 3001

async function start() {
  // Bring the schema up to date before serving. A server that answers requests
  // against a half-migrated database is worse than one that refuses to boot.
  try {
    await runMigrations()
  } catch (err) {
    console.error('❌ Database migration failed — refusing to start:', err)
    process.exit(1)
  }

  const app = createApp()
  startHoldCleanupWorker()
  startChannelSyncWorker()

  app.listen(PORT, () => {
    console.log(`🚀 Quadis Hotels API Server running strictly on TypeScript at http://localhost:${PORT}`)
    console.log(`📡 Health Check endpoint: http://localhost:${PORT}/api/health`)
  })
}

start()
