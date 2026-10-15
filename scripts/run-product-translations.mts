/** Persistent worker: run beside Next; no browser request is required for continued processing. */
import { setTimeout } from 'node:timers/promises'
import { writeFile, unlink } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import {
  runOneProductTranslation,
  translationQueueAvailable,
} from '../src/platform/product-translation/jobs'
import { translationBudgetReady } from '../src/platform/translation-usage/budget'

const payload = await getPayload({ config })
if (!(await translationQueueAvailable(payload))) {
  process.stderr.write(
    'Product translation worker is disabled or queue storage has not been installed.\n',
  )
  await payload.destroy()
  process.exit(1)
}
if (!(await translationBudgetReady(payload))) {
  process.stderr.write('Translation budget is enabled but its approved storage/configuration is not ready. No jobs were claimed.\n')
  await payload.destroy()
  process.exit(1)
}
let stopping = false
const heartbeatFile = process.env.TRANSLATION_WORKER_HEARTBEAT_FILE
const heartbeat = async () => {
  if (!heartbeatFile) return
  try { await writeFile(heartbeatFile, String(Date.now()), { mode: 0o600 }) } catch {
    process.stderr.write('Translation worker heartbeat could not be recorded.\n')
  }
}
await heartbeat()
const heartbeatTimer = heartbeatFile ? setInterval(() => { void heartbeat() }, 15000) : undefined
heartbeatTimer?.unref()
process.on('SIGINT', () => {
  stopping = true
})
process.on('SIGTERM', () => {
  stopping = true
})
async function work() {
  while (!stopping) {
    try {
      if (!(await runOneProductTranslation(payload))) await setTimeout(2000)
    } catch {
      process.stderr.write('Translation worker connection failed; will retry.\n')
      await setTimeout(5000)
    }
  }
}
// Small single-server installations may lower concurrency without changing
// the database's global/per-company locks or the default managed deployment.
const concurrency = process.env.TRANSLATION_WORKER_CONCURRENCY || '2'
if (!['1', '2'].includes(concurrency)) throw new Error('TRANSLATION_WORKER_CONCURRENCY must be 1 or 2.')
process.stdout.write(`Translation worker ready (${concurrency} workers, per-company 1).\n`)
await Promise.all(Array.from({ length: Number(concurrency) }, () => work()))
if (heartbeatTimer) clearInterval(heartbeatTimer)
if (heartbeatFile) await unlink(heartbeatFile).catch(() => {})
await payload.destroy()
process.exit(0)
