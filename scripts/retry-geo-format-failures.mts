/** Explicit, bounded retry of failed article jobs; never publishes an article. */
import { getPayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import config from '../src/payload.config'
import { userHasRole } from '../src/access/roles'
import { createGeoArticleStore } from '../src/platform/geo/article-store'
import { refreshArticleContext } from '../src/platform/geo/article-context'

if (process.env.NODE_ENV !== 'production') throw new Error('Production adapter mode is required.')
const [slug, ...ids] = process.argv.slice(2)
if (
  !slug ||
  !ids.length ||
  ids.length > 2 ||
  new Set(ids).size !== ids.length ||
  ids.some((id) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
) {
  throw new Error('Pass a company slug and one or two explicit job UUIDs.')
}
const payload = await getPayload({ config })
try {
  const tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  if (!tenant) throw new Error('Company not found.')
  const pool = (payload.db as unknown as PostgresAdapter).pool
  const jobs = (
    await pool.query(
      `SELECT * FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND id=ANY($2::uuid[])
     AND state='failed' AND error_code='INVALID_OUTPUT'`,
      [tenant.id, ids],
    )
  ).rows
  if (jobs.length !== ids.length)
    throw new Error('Jobs must belong to this company and have confirmed format failures.')
  for (const job of jobs) {
    const actor = await payload.findByID({
      collection: 'users',
      id: job.actor_id,
      depth: 0,
      overrideAccess: true,
    })
    if (actor.expiresAt && new Date(actor.expiresAt).getTime() <= Date.now())
      throw new Error('Submitting account has expired.')
    const assigned = actor.tenants?.some(
      (item) =>
        Number(typeof item.tenant === 'object' && item.tenant ? item.tenant.id : item.tenant) ===
        tenant.id,
    )
    if (
      !userHasRole(actor, ['super-admin']) &&
      !(assigned && userHasRole(actor, ['site-admin', 'editor']))
    ) {
      throw new Error('Submitting account no longer has company editing access.')
    }
    await refreshArticleContext(pool, tenant.id, job.context)
  }
  for (const job of jobs) {
    await createGeoArticleStore(pool, tenant.id, job.actor_id).retry(job.id, false)
    console.log(`Queued one retry: ${job.id}; prior attempts retained; no publication requested.`)
  }
} finally {
  await payload.destroy()
}
process.exit(0)
