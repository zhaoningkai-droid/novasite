/** Persistent worker: run beside Next; no browser request is required for continued processing. */
import { setTimeout } from 'node:timers/promises'
import { writeFile, unlink } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import {
  runOneProductTranslation,
  translationQueueAvailable,
} from '../src/platform/product-translation/jobs'
import {
  fieldPreviewReady,
  pruneFieldTranslationPreviews,
  runOneFieldTranslationPreview,
} from '../src/platform/product-translation/field-preview'
import { translationUsageReady } from '../src/platform/translation-usage/budget'

const payload = await getPayload({ config })
if (!(await translationQueueAvailable(payload))) {
  process.stderr.write(
    'Product translation worker is disabled or queue storage is missing the current schema.\n',
  )
  await payload.destroy()
  process.exit(1)
}
if (!(await translationUsageReady(payload))) {
  process.stderr.write('Translation usage storage is not ready. No jobs were claimed.\n')
  await payload.destroy()
  process.exit(1)
}
const previewEnabled = await fieldPreviewReady(payload)
if (!previewEnabled) process.stderr.write('Field translation previews are awaiting their database migration.\n')
let nextPreviewCleanup = 0
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
async function work(index: number) {
  let previewFirst = index % 2 === 0
  while (!stopping) {
    try {
      if (previewEnabled && Date.now() >= nextPreviewCleanup) {
        nextPreviewCleanup = Date.now() + 60_000
        await pruneFieldTranslationPreviews(payload)
      }
      const preview = () => previewEnabled ? runOneFieldTranslationPreview(payload) : false
      const ran = previewFirst
        ? await preview() || await runOneProductTranslation(payload)
        : await runOneProductTranslation(payload) || await preview()
      previewFirst = !previewFirst
      if (!ran) await setTimeout(2000)
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
await Promise.all(Array.from({ length: Number(concurrency) }, (_, index) => work(index)))
if (heartbeatTimer) clearInterval(heartbeatTimer)
if (heartbeatFile) await unlink(heartbeatFile).catch(() => {})
await payload.destroy()
process.exit(0)
