import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import {
  classifyGeoCitations,
  detectGeoObservation,
  type GeoObservation,
  type GeoTrackedQuestion,
} from './visibility'

type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type ConfigRow = {
  id: string
  tenant_id: number
  brand: string
  aliases: string[]
  core: string
  terms: string[]
  website: string
  blog: string
  version: number
}
type SetRow = { version: number; questions: GeoTrackedQuestion[]; updated_at: Date | string }
type SourceRow = { url: string; status: string; title: string | null; kind: string }
type ObservationRow = {
  id: string
  batch_id: string
  question_id: string
  question: string
  query_type: 'brand_self' | 'discovery'
  result_state: 'detected' | 'not_mentioned' | 'failed'
  matched_aliases: string[]
  recommendation_context: string
  raw_answer: string
  grounding_queries: string[]
  citations: GeoObservation['citations']
  failure_message: string
  platform: string
  model: string
  browsing_mode: string
  language: string
  region: string
  optimization_version: number
  question_set_version: number
  method: 'manual'
  sampled_at: Date | string
  optimization_snapshot: GeoObservation['optimizationSnapshot']
}
const toObservation = (row: ObservationRow): GeoObservation => ({
  id: row.id,
  batchID: row.batch_id,
  questionID: row.question_id,
  question: row.question,
  queryType: row.query_type,
  resultState: row.result_state,
  matchedAliases: row.matched_aliases,
  recommendationContext: row.recommendation_context,
  rawAnswer: row.raw_answer,
  groundingQueries: row.grounding_queries,
  citations: row.citations,
  failureMessage: row.failure_message,
  platform: row.platform,
  model: row.model,
  browsingMode: row.browsing_mode,
  language: row.language,
  region: row.region,
  optimizationVersion: row.optimization_version,
  questionSetVersion: row.question_set_version,
  method: row.method,
  sampledAt: new Date(row.sampled_at).toISOString(),
  optimizationSnapshot: row.optimization_snapshot,
})

export function createGeoVisibilityStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)

  return {
    async list(optimizationID: string) {
      const [set, history] = await Promise.all([
        pool.query<SetRow>(
          'SELECT version,questions,updated_at FROM platform_geo.tracking_sets WHERE tenant_id=$1 AND optimization_id=$2::uuid',
          [tenantID, optimizationID],
        ),
        pool.query<ObservationRow>(
          `
          SELECT o.id,o.batch_id,o.question_id,o.question,o.query_type,o.result_state,o.matched_aliases,
            o.recommendation_context,o.raw_answer,o.grounding_queries,o.citations,o.failure_message,
            b.platform,b.model,b.browsing_mode,b.language,b.region,b.optimization_version,b.question_set_version,
            b.method,b.sampled_at,b.optimization_snapshot
          FROM platform_geo.observations o JOIN platform_geo.observation_batches b
            ON b.tenant_id=o.tenant_id AND b.id=o.batch_id
          WHERE o.tenant_id=$1 AND b.optimization_id=$2::uuid
          ORDER BY b.sampled_at DESC,o.id DESC LIMIT 100`,
          [tenantID, optimizationID],
        ),
      ])
      return {
        questionSet: set.rows[0]
          ? {
              version: set.rows[0].version,
              questions: set.rows[0].questions,
              updatedAt: new Date(set.rows[0].updated_at).toISOString(),
            }
          : { version: 0, questions: [] as GeoTrackedQuestion[], updatedAt: null },
        observations: history.rows.map(toObservation),
      }
    },

    async saveQuestions(
      optimizationID: string,
      expectedVersion: number,
      questions: GeoTrackedQuestion[],
    ) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const config = await client.query(
          'SELECT id FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE',
          [tenantID, optimizationID],
        )
        if (!config.rows[0]) throw new GeoError('NOT_FOUND', '未找到当前客户的GEO优化词。', 404)
        const saved = await client.query<SetRow>(
          `
          INSERT INTO platform_geo.tracking_sets(tenant_id,optimization_id,version,questions,actor_id)
          VALUES($1,$2::uuid,1,$4::jsonb,$5)
          ON CONFLICT(tenant_id,optimization_id) DO UPDATE SET
            version=platform_geo.tracking_sets.version+1,questions=EXCLUDED.questions,
            actor_id=EXCLUDED.actor_id,updated_at=clock_timestamp()
          WHERE platform_geo.tracking_sets.version=$3
          RETURNING version,questions,updated_at`,
          [tenantID, optimizationID, expectedVersion, JSON.stringify(questions), actorID],
        )
        if (!saved.rows[0])
          throw new GeoError('VERSION_CONFLICT', '问题集已在其他窗口修改，请刷新后重试。', 409)
        await client.query('COMMIT')
        return {
          version: saved.rows[0].version,
          questions: saved.rows[0].questions,
          updatedAt: new Date(saved.rows[0].updated_at).toISOString(),
        }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },

    async record(
      optimizationID: string,
      requestID: string,
      input: {
        questionID: string
        optimizationVersion: number
        questionSetVersion: number
        platform: string
        model: string
        browsingMode: 'connected' | 'disconnected' | 'unknown'
        language: string
        region: string
        outcome: 'answered' | 'failed'
        rawAnswer: string
        groundingQueries: string[]
        citationURLs: string[]
        recommendationContext: string
        failureMessage: string
      },
    ) {
      const client = await pool.connect()
      const batchID = randomUUID(),
        observationID = randomUUID()
      const inputHash = createHash('sha256')
        .update(JSON.stringify({ optimizationID, input }))
        .digest('hex')
      const existingObservation = async () =>
        (
          await client.query<ObservationRow & { input_hash: string }>(
            `
        SELECT o.id,o.batch_id,o.question_id,o.question,o.query_type,o.result_state,o.matched_aliases,
          o.recommendation_context,o.raw_answer,o.grounding_queries,o.citations,o.failure_message,
          b.platform,b.model,b.browsing_mode,b.language,b.region,b.optimization_version,b.question_set_version,
          b.method,b.sampled_at,b.optimization_snapshot,b.input_hash
        FROM platform_geo.observations o JOIN platform_geo.observation_batches b
          ON b.tenant_id=o.tenant_id AND b.id=o.batch_id
        WHERE b.tenant_id=$1 AND b.request_id=$2::uuid LIMIT 1`,
            [tenantID, requestID],
          )
        ).rows[0]
      const replay = async (row: (ObservationRow & { input_hash: string }) | undefined) => {
        if (!row)
          throw new GeoError('IDEMPOTENCY_CONFLICT', '此请求编号已被使用，请刷新后重试。', 409)
        if (row.input_hash !== inputHash)
          throw new GeoError('IDEMPOTENCY_CONFLICT', '相同请求编号不能提交不同的采样内容。', 409)
        await client.query('COMMIT')
        return { observation: toObservation(row), replayed: true }
      }
      try {
        await client.query('BEGIN')
        let previous = await existingObservation()
        if (previous) return await replay(previous)
        const configResult = await client.query<ConfigRow>(
          `SELECT id,tenant_id,brand,aliases,core,terms,website,blog,version
          FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE`,
          [tenantID, optimizationID],
        )
        const config = configResult.rows[0]
        if (!config) throw new GeoError('NOT_FOUND', '未找到当前客户的GEO优化词。', 404)
        previous = await existingObservation()
        if (previous) return await replay(previous)
        if (config.version !== input.optimizationVersion)
          throw new GeoError('VERSION_CONFLICT', 'GEO优化词已变化，请刷新问题集并重新采样。', 409)
        const setResult = await client.query<SetRow>(
          `SELECT version,questions,updated_at FROM platform_geo.tracking_sets
          WHERE tenant_id=$1 AND optimization_id=$2::uuid FOR SHARE`,
          [tenantID, optimizationID],
        )
        const set = setResult.rows[0]
        if (!set || set.version !== input.questionSetVersion)
          throw new GeoError('VERSION_CONFLICT', '问题集已变化，请刷新页面后重试。', 409)
        const question = set.questions.find((item) => item.id === input.questionID)
        if (!question)
          throw new GeoError('QUESTION_NOT_FOUND', '此问题已从当前问题集移除，请刷新后重试。', 409)
        if (question.language !== input.language)
          throw new GeoError(
            'LANGUAGE_MISMATCH',
            '采样语言与问题集版本不一致，请按问题指定语言进行采样。',
          )

        const sourceResult = await client.query<SourceRow>(
          `SELECT url,status,title,kind FROM platform_geo.source_pages
          WHERE tenant_id=$1 AND optimization_id=$2::uuid AND optimization_version=$3`,
          [tenantID, optimizationID, config.version],
        )
        const citations = classifyGeoCitations(input.citationURLs, sourceResult.rows)
        const values = { brand: config.brand, aliases: config.aliases }
        const matchedAliases =
          input.outcome === 'answered' ? detectGeoObservation(input.rawAnswer, values) : []
        const resultState =
          input.outcome === 'failed'
            ? 'failed'
            : matchedAliases.length
              ? 'detected'
              : 'not_mentioned'
        if (resultState === 'detected' && input.recommendationContext === 'not_applicable')
          throw new GeoError('INVALID_INPUT', '答案命中公司名称，请判断其推荐语境。')
        const context = resultState === 'detected' ? input.recommendationContext : 'not_applicable'
        const snapshot = {
          brand: config.brand,
          aliases: config.aliases,
          core: config.core,
          terms: config.terms,
          website: config.website,
          blog: config.blog,
          version: config.version,
        }
        const createdBatch = await client.query(
          `INSERT INTO platform_geo.observation_batches
          (id,tenant_id,request_id,input_hash,optimization_id,optimization_version,question_set_version,question_set_snapshot,
           optimization_snapshot,platform,model,browsing_mode,language,region,method,actor_id)
          VALUES($1::uuid,$2,$3::uuid,$4,$5::uuid,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,'manual',$15)
          ON CONFLICT(tenant_id,request_id) DO NOTHING RETURNING id`,
          [
            batchID,
            tenantID,
            requestID,
            inputHash,
            optimizationID,
            config.version,
            set.version,
            JSON.stringify({ version: set.version, questions: set.questions }),
            JSON.stringify(snapshot),
            input.platform,
            input.model,
            input.browsingMode,
            input.language,
            input.region,
            actorID,
          ],
        )
        if (!createdBatch.rows[0]) return await replay(await existingObservation())
        const inserted = await client.query<ObservationRow>(
          `WITH inserted AS (
          INSERT INTO platform_geo.observations
            (id,tenant_id,batch_id,question_id,question,query_type,result_state,raw_answer,matched_aliases,
             recommendation_context,grounding_queries,citations,failure_message,actor_id)
          VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,$13,$14)
          RETURNING *)
          SELECT inserted.id,inserted.batch_id,inserted.question_id,inserted.question,inserted.query_type,
            inserted.result_state,inserted.matched_aliases,inserted.recommendation_context,inserted.raw_answer,
            inserted.grounding_queries,inserted.citations,inserted.failure_message,
            $15::text AS platform,$16::text AS model,$17::text AS browsing_mode,$18::text AS language,
            $19::text AS region,$20::int AS optimization_version,$21::int AS question_set_version,
            'manual'::text AS method,now() AS sampled_at,$22::jsonb AS optimization_snapshot FROM inserted`,
          [
            observationID,
            tenantID,
            batchID,
            question.id,
            question.question,
            question.queryType,
            resultState,
            input.rawAnswer,
            JSON.stringify(matchedAliases),
            context,
            JSON.stringify(input.groundingQueries),
            JSON.stringify(citations),
            input.failureMessage,
            actorID,
            input.platform,
            input.model,
            input.browsingMode,
            input.language,
            input.region,
            config.version,
            set.version,
            JSON.stringify(snapshot),
          ],
        )
        await client.query('COMMIT')
        return { observation: toObservation(inserted.rows[0]), replayed: false }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
