import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assertLocalDetectionStorage,
  buildStorageFixture,
  detectionInputHash,
  evidenceBytes,
  parseDetectionInput,
} from '../../src/platform/geo/detection'

const input = () => ({
  requestID: randomUUID(),
  name: '华东存储验收',
  optimizationID: randomUUID(),
  optimizationVersion: 1,
  questions: [{ question: '哪些厂家提供六角头螺栓？', queryType: 'discovery', language: 'zh' }],
})

// 场景来源：用户第一步验收、技术方案中的幂等/原文保存/样本不冒充真实收录。
describe('GEO first-step storage contract', () => {
  it('keeps the same hash when retry parsing allocates new internal question IDs', () => {
    const body = input(),
      a = parseDetectionInput(body),
      b = parseDetectionInput(body)
    expect(a.questions[0].id).not.toBe(b.questions[0].id)
    expect(detectionInputHash(a)).toBe(detectionInputHash(b))
    expect(detectionInputHash({ ...a, name: '另一任务' })).not.toBe(detectionInputHash(a))
  })
  it('rejects empty, duplicate and over-limit question sets', () => {
    const body = input()
    expect(() => parseDetectionInput({ ...body, questions: [] })).toThrow(/1–20/u)
    expect(() =>
      parseDetectionInput({ ...body, questions: Array(21).fill(body.questions[0]) }),
    ).toThrow(/1–20/u)
    expect(() =>
      parseDetectionInput({ ...body, questions: Array(2).fill(body.questions[0]) }),
    ).toThrow(/重复/u)
    expect(() => parseDetectionInput({ ...body, optimizationVersion: 0 })).toThrow(/版本/u)
  })
  it('stores unambiguous synthetic provenance and an exact citation segment', () => {
    const question = parseDetectionInput(input()).questions[0]
    const fixture = buildStorageFixture(question, '华东紧固件')
    expect(fixture.rawAnswer).toContain('非AI真实回答')
    expect(fixture.response.evidenceOrigin).toBe('synthetic_fixture')
    expect(fixture.rawAnswer.slice(fixture.citation.start, fixture.citation.end)).toBe(
      fixture.citation.quotedSegment,
    )
    expect(fixture.citation.url).toContain('example.invalid')
  })
  it('preserves original Unicode and hashes exactly the downloadable bytes', () => {
    const content = { rawAnswer: '\n  华东🧪：原始标点！  \n' }
    const { bytes, sha256 } = evidenceBytes(content)
    expect(JSON.parse(bytes.toString()).rawAnswer).toBe(content.rawAnswer)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
    expect(() => evidenceBytes({ raw: 'a'.repeat(6 * 1024 * 1024) })).toThrow(/上限/u)
  })
  it('prevents storage fixtures from being enabled in production or remote databases', () => {
    expect(() =>
      assertLocalDetectionStorage({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://local@127.0.0.1/test',
      }),
    ).not.toThrow()
    expect(() =>
      assertLocalDetectionStorage({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://local@127.0.0.1/test',
      }),
    ).toThrow(/本地/u)
    expect(() =>
      assertLocalDetectionStorage({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://local@db.example/test',
      }),
    ).toThrow(/本地/u)
  })
})
