import { readFile } from 'node:fs/promises'
import { describe, it, expect, vi } from 'vitest'
import {
  knowledgeTokens,
  chunkKnowledge,
  rankKnowledge,
  diverseKnowledge,
} from '../../src/platform/knowledge/text'
import { parseKnowledgeFile } from '../../src/platform/knowledge/parser'
import { retrieveKnowledge } from '../../src/platform/knowledge/retrieval'
import { attachArticleKnowledge } from '../../src/platform/knowledge/article-knowledge'
import { workspaceModuleDestination } from '../../src/platform/geo/navigation'
const fixture = (name: string) => readFile(`${process.cwd()}/tests/fixtures/knowledge/${name}`)
describe('enterprise knowledge parsing and retrieval', () => {
  it('preserves Chinese product identity, Latin model numbers and numeric parameters', () => {
    expect(knowledgeTokens('高强度螺栓 KB-2468 M16×80 10.9级')).toEqual(
      expect.arrayContaining(['高强', '螺栓', 'kb-2468', 'm16', '80', '10.9']),
    )
  })
  it('keeps context, product boundaries and all facts across child chunks', () => {
    const text =
      '产品类别：高强度螺栓\n' +
      '起订量2468套，交期17个工作日。'.repeat(100) +
      '\n产品类别：防爆电机\n\n只用于电机的参数，不属于螺栓。'
    const chunks = chunkKnowledge(text, '产品手册')
    expect(chunks.length).toBeGreaterThan(2)
    expect(
      chunks.some((c) => c.heading.includes('防爆电机') && c.content.includes('不属于螺栓')),
    ).toBe(true)
    expect(chunks.every((c) => c.context.includes('产品手册'))).toBe(true)
    expect(chunks.map((c) => c.content).join('')).toContain('2468')
  })
  it.each([
    ['company.txt', '2468'],
    ['product.docx', '17 days'],
    ['specifications.xlsx', 'KB-2468'],
  ])('extracts actual %s document text', async (name, expected) => {
    expect(await parseKnowledgeFile(name, await fixture(name))).toContain(expected)
  })
  it('rejects unsupported or non-text documents with an actionable parser error', async () => {
    await expect(parseKnowledgeFile('bad.exe', Buffer.from('data'))).rejects.toMatchObject({
      code: 'INVALID_FILE',
    })
    await expect(parseKnowledgeFile('empty.txt', Buffer.alloc(0))).rejects.toMatchObject({
      code: 'EMPTY_DOCUMENT',
    })
    await expect(parseKnowledgeFile('bad.pdf', Buffer.from('not pdf'))).rejects.toMatchObject({
      code: 'INVALID_FILE',
    })
  })
  it('ranks exact product facts above unrelated company content', () => {
    const ranked = rankKnowledge(
      [
        { title: 'motor', heading: '电机', context: '电机', content: '防爆电机的真空工作条件' },
        {
          title: 'bolts',
          heading: '螺栓交期',
          context: '螺栓',
          content: '高强度螺栓起订量2468套，交货17天。',
        },
      ],
      '高强度螺栓 起订量 交货',
    )
    expect(ranked[0].title).toBe('bolts')
    expect(diverseKnowledge(ranked, 1)[0].title).toBe('bolts')
  })
  it('does not call any AI when the tenant has no active knowledge', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] }),
      fetcher = vi.fn()
    const result = await retrieveKnowledge(
      { query } as never,
      101,
      { question: '交期是多少？' },
      { key: 'fixture', fetcher },
    )
    expect(result.evidence).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    expect(query.mock.calls[0][1]).toEqual([101])
  })
  it('handles older databases without knowledge storage without blocking articles', async () => {
    const query = vi.fn().mockRejectedValue({ code: '3F000' })
    const result = await retrieveKnowledge({ query } as never, 101, { question: '交期' })
    expect(result.strategy).toBe('empty')
  })
  it('scopes candidates and parent expansion to the tenant before and after reranking', async () => {
    const chunk = {
      id: 'chunk-a',
      document_id: 'doc-a',
      ordinal: 0,
      heading: '供货政策',
      content: '螺栓起订量2468套',
      context: '螺栓产品手册',
      document_version: 2,
      title: '供货手册',
      filename: 'supply.txt',
    }
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ready: 1 }] })
      .mockResolvedValueOnce({ rows: [chunk] })
      .mockResolvedValueOnce({ rows: [chunk] })
      .mockResolvedValueOnce({ rows: [chunk] })
    const result = await retrieveKnowledge({ query } as never, 101, {
      question: '螺栓起订量',
      brand: '甲公司',
    })
    expect(result.evidence[0]).toMatchObject({ id: 'K1', documentID: 'doc-a', documentVersion: 2 })
    for (const [sql, params] of query.mock.calls) {
      expect(params[0]).toBe(101)
      expect(sql).toContain('tenant_id=$1')
      expect(sql).toContain('d.enabled')
    }
  })
  it('keeps the knowledge module selected when switching customer', () => {
    expect(workspaceModuleDestination('other', '/workspace/first/knowledge')).toBe(
      '/workspace/other/knowledge',
    )
  })
})

it('drops stale knowledge snapshots and keeps complete keyword writing when no active source exists', async () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  const context = {
    settings: { locale: 'zh', questionSource: 'original' },
    question: { original: '螺栓厂家推荐', term: '螺栓' },
    optimization: { core: '螺栓', brand: '甲公司' },
    direction: '企业推荐',
    knowledge: [{ id: 'old', title: 'old', text: '已停用的旧资料' }],
  }
  const result = await attachArticleKnowledge(pool as never, 101, context as never)
  expect(result.writingMode).toBe('keyword')
  expect(result.knowledge).toEqual([])
  expect(result.direction).toBe('企业推荐')
})
it('ignores invented reranker IDs and sources disabled while ranking', async () => {
  const chunk = {
    id: 'chunk-a',
    document_id: 'doc-a',
    ordinal: 0,
    heading: '供货',
    content: '螺栓2468套',
    context: '螺栓',
    document_version: 2,
    title: '供货',
    filename: 'supply.txt',
  }
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ ready: 1 }] })
    .mockResolvedValueOnce({ rows: [chunk] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
  const reply = (content: unknown) =>
    new Response(
      JSON.stringify({
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
      }),
    )
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(reply({ queries: ['bolt delivery'] }))
    .mockResolvedValueOnce(
      reply({
        matches: [
          { id: 'other-tenant-id', score: 1 },
          { id: 'chunk-a', score: 0.9 },
        ],
      }),
    )
  const result = await retrieveKnowledge(
    { query } as never,
    101,
    { question: '螺栓交期' },
    { key: 'fixture', fetcher },
  )
  expect(result.evidence).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.at(-1)?.[1].slice(0, 3)).toEqual([101, 'doc-a', 2])
})
