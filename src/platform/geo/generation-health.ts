import type { PostgresAdapter } from '@payloadcms/db-postgres'

type Query = Pick<PostgresAdapter['pool'], 'query'>
export type GeoGenerationHealth = {
  workerReady: boolean | null
  oldestQueuedAt: string | null
  lastClaimedAt: string | null
  lastSucceededAt: string | null
  failures: { code: string; count: number }[]
}

export async function recordGeoGenerationHeartbeat(pool: Query) {
  await pool.query(`INSERT INTO platform_geo.generation_worker_heartbeat(singleton,last_seen)
    VALUES(true,clock_timestamp()) ON CONFLICT(singleton) DO UPDATE SET last_seen=clock_timestamp()`)
}

export async function geoGenerationHealth(pool: Query, tenantID: number): Promise<GeoGenerationHealth | null> {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT (SELECT last_seen>clock_timestamp()-interval '35 seconds'
              FROM platform_geo.generation_worker_heartbeat WHERE singleton) AS "workerReady",
        min(created_at) FILTER (WHERE state='queued') AS "oldestQueuedAt",
        max(last_claimed_at) AS "lastClaimedAt",
        max(updated_at) FILTER (WHERE state='succeeded') AS "lastSucceededAt",
        (SELECT coalesce(jsonb_agg(f ORDER BY f.count DESC, f.code),'[]'::jsonb)
         FROM (SELECT coalesce(error_code,'UNCLASSIFIED') AS code,count(*)::int AS count
           FROM platform_geo.generation_jobs
           WHERE tenant_id=$1 AND state IN ('failed','unknown')
           GROUP BY 1 ORDER BY count DESC,code LIMIT 10) f) AS failures
      FROM platform_geo.generation_jobs WHERE tenant_id=$1
    `, [tenantID])
    return row || null
  } catch {
    // Queue health is optional telemetry. Do not turn a successful enqueue into an error.
    return null
  }
}
