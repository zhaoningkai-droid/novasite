/** Separate GEO worker. NODE_ENV=production prevents Payload development schema push. */
import { setTimeout } from 'node:timers/promises'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import path from 'node:path'
if (process.env.NODE_ENV !== 'production' || process.env.GEO_ARTICLE_WORKER_ENABLED !== 'true')
  throw new Error('GEO worker requires explicit enablement and production database adapter mode.')
if (!process.env.DEEPSEEK_API_KEY) throw new Error('GEO article provider is not configured.')
const { getPayload } = await import('payload')
const { default: config } = await import('../src/payload.config')
const { userHasRole } = await import('../src/access/roles')
const { runOneGeoArticle } = await import('../src/platform/geo/article-runner')
const payload = await getPayload({ config })
const pool = (payload.db as unknown as import('@payloadcms/db-postgres').PostgresAdapter).pool
const ready = await pool.query("SELECT to_regclass('platform_geo.generation_jobs') IS NOT NULL AS ready")
if (!ready.rows[0].ready) { await payload.destroy(); throw new Error('Install approved GEO article storage first.') }
const file = path.join(process.cwd(), '.codex-runtime/geo-article-worker.heartbeat')
let stopping = false
process.on('SIGINT', () => { stopping = true }); process.on('SIGTERM', () => { stopping = true })
const heartbeat = async () => { await writeFile(file, String(Date.now()), { mode: 0o600 }) }
await heartbeat()
const timer = setInterval(() => { void heartbeat().catch(() => { stopping = true }) }, 10000)
const authorize = async (actorID: number, tenantID: number) => {
  try {
    const user = await payload.findByID({ collection: 'users', id: actorID, depth: 0, overrideAccess: true })
    await payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true })
    if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) return false
    return userHasRole(user, ['super-admin']) || (userHasRole(user, ['site-admin','editor']) && !!user.tenants?.some((t) =>
      Number(typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant) === tenantID))
  } catch { return false }
}
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

