// Admin routes fail closed when ADMIN_PIN / ADMIN_PASSWORD are unset, so the
// suite has to supply them the same way a real deployment does.
process.env.ADMIN_PIN = process.env.ADMIN_PIN || '998877'
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-token'
