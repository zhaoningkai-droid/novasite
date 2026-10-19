import { createHash } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import type { GeoAIInput } from './question-ai'
import type { GeoQuestion } from './tasks'
import type { TranslationRequestUsage } from '../translation-usage/types'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
export type GeoAIOperation = {
  id: string
  state: 'running' | 'succeeded' | 'failed' | 'unknown'
  kind: string
  input: GeoAIInput
  input_hash: string
  result: { questions: GeoQuestion[] } | null
  model: string
  usage: TranslationRequestUsage | null
  error_code: string | null
  created_at: string
}
export function createGeoAIStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  return {
    async recent(configID: string) {
      return (
        await pool.query<GeoAIOperation>(
          `SELECT id,CASE WHEN state='running' AND created_at<now()-interval '10 minutes'
        THEN 'unknown' ELSE state END AS state,kind,input,input_hash,result,model,usage,error_code,created_at
        FROM platform_geo.ai_operations WHERE tenant_id=$1 AND optimization_id=$2::uuid ORDER BY created_at DESC LIMIT 10`,
          [tenantID, configID],
        )
      ).rows
    },
    async claim(id: string, input: GeoAIInput, model: string) {
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57297,$1)', [tenantID])
        await client.query(
          `UPDATE platform_geo.ai_operations SET state='unknown',error_code='INTERRUPTED',finished_at=now()
          WHERE tenant_id=$1 AND state='running' AND created_at<now()-interval '10 minutes'`,
          [tenantID],
        )
        const old = (
          await client.query<GeoAIOperation>(
            'SELECT * FROM platform_geo.ai_operations WHERE tenant_id=$1 AND id=$2::uuid',
            [tenantID, id],
          )
        ).rows[0]
        if (old) {
          if (old.input_hash !== hash)
            throw new GeoError('IDEMPOTENCY_CONFLICT', '同一请求编号不能提交不同内容。', 409)
          await client.query('COMMIT')
          return { operation: old, claimed: false }
        }
        const config = (
          await client.query(
            'SELECT version FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE',
            [tenantID, input.optimizationID],
          )
        ).rows[0]
        if (!config || config.version !== input.optimizationVersion)
          throw new GeoError('CONFIG_CHANGED', '优化词配置已更新，请重新选择。', 409)
        const operation = (
          await client.query<GeoAIOperation>(
            `INSERT INTO platform_geo.ai_operations
          (id,tenant_id,optimization_id,optimization_version,kind,input_hash,input,state,model,actor_id)
          VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7::jsonb,'running',$8,$9) RETURNING *`,
            [
              id,
              tenantID,
              input.optimizationID,
              input.optimizationVersion,
              input.kind,
              hash,
              JSON.stringify(input),
              model,
              actorID,
            ],
          )
        ).rows[0]
        await client.query('COMMIT')
        return { operation, claimed: true }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async usage(id: string, usage?: TranslationRequestUsage) {
      await pool.query(
        'UPDATE platform_geo.ai_operations SET usage=$3::jsonb WHERE tenant_id=$1 AND id=$2::uuid',
        [tenantID, id, usage ? JSON.stringify(usage) : null],
      )
    },
    async finish(
      id: string,
      state: GeoAIOperation['state'],
      result: GeoAIOperation['result'],
      code: string | null,
    ) {
      const row = (
        await pool.query<GeoAIOperation>(
          `UPDATE platform_geo.ai_operations SET state=$3,result=$4::jsonb,
        error_code=$5,finished_at=now() WHERE tenant_id=$1 AND id=$2::uuid AND state='running' RETURNING *`,
          [tenantID, id, state, result ? JSON.stringify(result) : null, code],
        )
      ).rows[0]
      if (!row)
        throw new GeoError(
          'OPERATION_UNCONFIRMED',
          '处理状态未确认，请先取回结果，不要重复提交。',
          503,
        )
      return row
    },
  }
}
