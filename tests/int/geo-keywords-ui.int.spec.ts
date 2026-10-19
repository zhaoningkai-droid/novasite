import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceCompany } from '../../src/platform/workspace'
import { GeoKeywords } from '../../src/platform/components/GeoWorkspace/GeoKeywords'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const keywordID = '00000000-0000-4000-8000-000000000001'
const company = {
  id: 101,
  slug: 'fixture',
  name: '当前客户',
  primaryDomain: 'fixture.example',
} as WorkspaceCompany
const savedKeyword = {
  id: keywordID,
  tenantID: 101,
  version: 1,
  brand: '伏特电气',
  aliases: [],
  core: '配电柜',
  terms: [
    '低压成套配电柜',
    '不锈钢户外配电柜',
    '光伏并网配电柜',
    '消防动力配电柜',
    '工地临时一级配电柜',
    '双电源自动切换配电柜',
    '防雨型工业配电柜',
    '三相动力配电柜',
    '智能控制配电柜',
    '防爆型低压配电柜',
  ],
  website: 'https://fixture.example/',
  blog: '',
  termLinks: [],
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
}
const keywordWithLegacyHint = {
  ...savedKeyword,
  termLinks: [
    {
      term: savedKeyword.terms[0],
      website: 'https://fixture.example/products/low-voltage',
      blog: '',
    },
  ],
}
let savedInput: Record<string, unknown> | null
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  router.push.mockReset()
  savedInput = null
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost:3100')
    const method = init?.method || 'GET'
    if (url.pathname.endsWith(`/keywords/${keywordID}`) && method === 'GET')
      return Response.json({ item: keywordWithLegacyHint })
    if (url.pathname.endsWith(`/keywords/${keywordID}`) && method === 'PATCH') {
      savedInput = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({
        item: { ...savedKeyword, ...savedInput, version: 2 },
        message: 'GEO优化词已保存。',
      })
    }
    if (url.pathname.endsWith('/keywords') && method === 'POST') {
      savedInput = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ item: savedKeyword, message: 'GEO优化词已保存。' }, { status: 201 })
    }
    if (url.pathname.endsWith('/keywords'))
      return Response.json({ items: savedInput ? [savedKeyword] : [], total: savedInput ? 1 : 0 })
    return Response.json({ message: 'unexpected request' }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GEO keyword configuration UI', () => {
  it('saves brand, core, ten subterms and root URLs without a per-term link table', async () => {
    render(createElement(GeoKeywords, { company }))
    await screen.findByText('当前客户尚未配置GEO优化词')

    fireEvent.click(screen.getAllByRole('button', { name: '添加' })[0])
    fireEvent.change(screen.getByLabelText('品牌词'), { target: { value: '伏特电气' } })
    fireEvent.change(screen.getByLabelText('核心词'), { target: { value: '配电柜' } })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))

    expect(screen.getByLabelText('比对标识')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /细分词/u })).toBeTruthy()
    expect(screen.getByLabelText(/网址链接/u)).toBeTruthy()
    expect(screen.getByLabelText('Blog链接')).toBeTruthy()
    expect(screen.queryByText('发文引用子链接')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(savedInput).not.toBeNull())
    expect(savedInput).toMatchObject({
      brand: '伏特电气',
      core: '配电柜',
      website: 'https://fixture.example',
      blog: '',
      termLinks: [],
    })
    expect(savedInput?.terms).toEqual(savedKeyword.terms)
  })

  it('locks saved keyword identity fields and clears old hints when a root URL changes', async () => {
    render(createElement(GeoKeywords, { company, recordId: keywordID }))

    const brand = await screen.findByLabelText(/品牌词/u)
    const aliases = screen.getByLabelText('比对标识')
    const core = screen.getByLabelText(/核心词/u)
    const terms = screen.getByRole('textbox', { name: /细分词/u })
    const website = screen.getByLabelText(/网址链接/u) as HTMLInputElement
    const blog = screen.getByLabelText('Blog链接') as HTMLInputElement

    expect((brand as HTMLInputElement).disabled).toBe(true)
    expect((aliases as HTMLInputElement).disabled).toBe(true)
    expect((core as HTMLInputElement).disabled).toBe(true)
    expect((terms as HTMLTextAreaElement).disabled).toBe(true)
    expect(website.disabled).toBe(false)
    expect(blog.disabled).toBe(false)

    fireEvent.change(website, { target: { value: 'https://new-fixture.example/' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(savedInput).not.toBeNull())
    expect(savedInput).toMatchObject({
      website: 'https://new-fixture.example/',
      termLinks: [],
    })
  })
})
