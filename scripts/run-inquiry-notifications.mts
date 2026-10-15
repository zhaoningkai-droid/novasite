/** Separate, explicitly enabled notification worker; no SMTP verification/test send. */
import { writeFile, unlink } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { inquiryNotificationsEnabled, inquiryPersistenceEnabled, inquiryStorageAvailable } from '../src/platform/inquiry/persist'
import { inquirySMTPSettings, runOneInquiryNotification } from '../src/platform/inquiry/notifications'

if (!inquiryPersistenceEnabled() || !inquiryNotificationsEnabled()) {
  process.stderr.write('Inquiry notification worker is disabled. No email was sent.\n')
  process.exit(1)
}
try { inquirySMTPSettings() } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'SMTP settings are missing.'}\n`)
  process.exit(1)
}
const payload = await getPayload({ config })
if (!(await inquiryStorageAvailable(payload))) {
  process.stderr.write('Inquiry delivery tables are not installed. No email was sent.\n')
  await payload.destroy()
  process.exit(1)
}
let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })
const path = process.env.INQUIRY_WORKER_HEARTBEAT_FILE
const heartbeat = async () => {
  if (path) await writeFile(path, String(Date.now()), { mode: 0o600 })
}
await heartbeat()
const timer = setInterval(() => { void heartbeat().catch(() => { process.stderr.write('Notification heartbeat unavailable.\n') }) }, 15000)
timer.unref()
process.stdout.write('Inquiry notification worker ready.\n')
while (!stopping) {
  try { if (!(await runOneInquiryNotification(payload))) await setTimeout(2000) }
  catch { process.stderr.write('Notification storage unavailable; will retry.\n'); await setTimeout(5000) }
}
clearInterval(timer)
if (path) await unlink(path).catch(() => {})
await payload.destroy()
process.exit(0)
