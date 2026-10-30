import { createHash, randomUUID } from 'node:crypto'
import { GeoError, geoID, geoObject } from './keywords'
import { parseGeoQuestions, type GeoTrackedQuestion } from './visibility'

export type DetectionInput = {
  requestID: string
  name: string
  optimizationID: string
  optimizationVersion: number
  questions: GeoTrackedQuestion[]
}
export type DetectionRun = {
  id: string
  name: string
  brand: string
  core: string
  optimizationVersion: number
  createdAt: string
  total: number
  saved: number
  mode: 'storage_test'
}
export type DetectionArtifact = {
  id: string
  kind: 'request' | 'response'
  byteLength: number
  sha256: string
}
export type DetectionJob = {
  id: string
  question: GeoTrackedQuestion
  state: 'pending' | 'evidence_saved'
  attempt: null | {
    id: string
    rawAnswer: string
    createdAt: string
    provider: 'local_fixture'
    evidenceOrigin: 'synthetic_fixture'
    artifacts: DetectionArtifact[]
    citations: Array<{
      id: string
      url: string
      title: string
      start: number
      end: number
      quotedSegment: string
      providerPointer: string
    }>
  }
}
export function parseDetectionInput(value: unknown): DetectionInput {
  const body = geoObject(value)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100 || /[\u0000-\u001f]/u.test(name))
    throw new GeoError('INVALID_NAME', '请填写任务名称，不超过100个字符。')
  if (!Number.isSafeInteger(body.optimizationVersion) || Number(body.optimizationVersion) < 1)
    throw new GeoError('VERSION_CONFLICT', '配置版本无效，请刷新后重试。', 409)
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 20)
    throw new GeoError('INVALID_QUESTIONS', '本步每次保存1–20个问题。')
  const questions = parseGeoQuestions(
    body.questions.map((value) => {
      const row = geoObject(value)
      return { ...row, id: randomUUID() }
    }),
  )
  return {
    requestID: geoID(body.requestID),
    name,
    optimizationID: geoID(body.optimizationID),
    optimizationVersion: Number(body.optimizationVersion),
    questions,
  }
}
export const detectionInputHash = (input: DetectionInput) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        name: input.name,
        optimizationID: input.optimizationID,
        optimizationVersion: input.optimizationVersion,
        questions: input.questions.map(({ question, queryType, language }) => ({
          question,
          queryType,
          language,
        })),
      }),
    )
    .digest('hex')

export function buildStorageFixture(question: GeoTrackedQuestion, brand: string) {
  const segment = `${brand}：这是用于核验数据库保存的本地样本。`
  const rawAnswer = `【本地验收样本，非AI真实回答，不计入GEO收录】\n${segment}\n问题：${question.question}\n🧪 保存原文和引用位置。`
  const start = rawAnswer.indexOf(segment)
  const citation = {
    url: 'https://example.invalid/geo-storage-fixture',
    title: '本地示例引用（非真实外部引用）',
    start,
    end: start + segment.length,
    quotedSegment: segment,
    providerPointer: '/citations/0',
  }
  const request = { evidenceOrigin: 'synthetic_fixture', question, mode: 'storage_test' }
  const response = {
    evidenceOrigin: 'synthetic_fixture',
    provider: 'local_fixture',
    rawAnswer,
    citations: [citation],
  }
  return { rawAnswer, citation, request, response }
}

export function evidenceBytes(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new GeoError('EVIDENCE_TOO_LARGE', '证据超出5MiB存储上限。', 413)
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** 此阶段必须显式限制为本地数据库，不能在生产侧伪造自动检测结果。 */
export function assertLocalDetectionStorage(
  env: Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'DATABASE_URL'> = process.env,
) {
  let localDatabase = false
  try {
    localDatabase = ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(env.DATABASE_URL || '').hostname,
    )
  } catch {
    /* 未配置时关闭本地验收入口。 */
  }
  if (env.NODE_ENV === 'production' || !localDatabase)
    throw new GeoError('LOCAL_STORAGE_ONLY', '检测存储目前仅在本地验收，未启用真实AI调用。', 503)
}
