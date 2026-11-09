/** Separate GEO worker. NODE_ENV=production prevents Payload development schema push. */
import { setTimeout } from 'node:timers/promises'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import path from 'node:path'
if (process.env.NODE_ENV !== 'production' || process.env.GEO_ARTICLE_WORKER_ENABLED !== 'true')
  throw new Error('GEO worker requires explicit enablement and production database adapter mode.')
if (!process.env.DEEPSEEK_API_KEY) throw new Error('GEO article provider is not configured.')
const { getPayload } = await import('payload')
const { default: config } = await import('../src/payload.config')
const { createGeoPublishAuthorization } = await import('../src/platform/geo/publish-authorization')
const { recordGeoGenerationHeartbeat } = await import('../src/platform/geo/generation-health')
const { runOneGeoArticle } = await import('../src/platform/geo/article-runner')
const payload = await getPayload({ config })
const pool = (payload.db as unknown as import('@payloadcms/db-postgres').PostgresAdapter).pool
const ready = await pool.query("SELECT to_regclass('platform_geo.generation_worker_heartbeat') IS NOT NULL AS ready")
if (!ready.rows[0].ready) { await payload.destroy(); throw new Error('Install the GEO generation recovery migration first.') }
const file = path.join(process.cwd(), '.codex-runtime/geo-article-worker.heartbeat')
let stopping = false
process.on('SIGINT', () => { stopping = true }); process.on('SIGTERM', () => { stopping = true })
const heartbeat = async () => {
  await recordGeoGenerationHeartbeat(pool)
  await writeFile(file, String(Date.now()), { mode: 0o600 }).catch(() => {})
}
await heartbeat()
const timer = setInterval(() => { void heartbeat().catch(() => process.stderr.write('GEO worker heartbeat write failed.\n')) }, 10000)
const checkActor = createGeoPublishAuthorization(payload)
const authorize = async (actorID: number, tenantID: number) => Boolean(await checkActor(actorID, tenantID))
process.stdout.write('GEO article worker ready; only explicitly queued jobs will run.\n')
try {
  do {
    try {
      if (!await runOneGeoArticle(pool, { key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', authorize })) {
        if (process.argv.includes('--once')) break
        await setTimeout(2000)
      }
    } catch { process.stderr.write('GEO queue unavailable; no automatic provider retry.\n'); if (!process.argv.includes('--once')) await setTimeout(5000) }
  } while (!stopping && !process.argv.includes('--once'))
} finally { clearInterval(timer); await unlink(file).catch(() => {});
  const pidFile = path.join(process.cwd(), '.codex-runtime/geo-article-worker.pid')
  try { if (Number(await readFile(pidFile, 'utf8')) === process.pid) await unlink(pidFile) } catch { /* unrelated/missing PID file */ }
  await payload.destroy() }
process.exit(0)

