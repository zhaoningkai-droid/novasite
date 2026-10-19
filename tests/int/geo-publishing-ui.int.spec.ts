import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceCompany } from '../../src/platform/workspace'
import { GeoPublishing } from '../../src/platform/components/GeoWorkspace/GeoPublishing'

const id = '00000000-0000-4000-8000-000000000001'
const company = { id: 101, slug: 'fixture', name: '当前客户' } as WorkspaceCompany
const keyword = {
  id,
  tenantID: 101,
  version: 1,
  brand: '伏特能源',
  aliases: [],
  core: '配电柜',
  terms: ['低压成套配电柜'],
  website: 'https://fixture.example',
  blog: '',
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}
const savedArticle = {
  id,
  task_id: null,
  task_version: null,
  question_id: null,
  version: 1,
  title: '低压成套配电柜选型指南',
  summary: '根据安装环境与负载选择合适的低压成套配电柜。',
  html: '<p>低压成套配电柜需要结合负载与使用环境选择。</p>',
  status: 'ready',
  context: {
    settings: { locale: 'zh' },
    question: { term: '低压成套配电柜', original: '如何选择低压成套配电柜' },
    optimization: { id, version: 1, brand: '伏特能源', core: '配电柜' },
    materialGroup: {
      id,
      version: 1,
      images: [
        { id: 1, url: '/api/media/file/example.webp', alt: '配电柜', filename: 'cabinet.webp' },
      ],
    },
    sources: [{ url: 'https://fixture.example/products/cabinet', title: '产品页面' }],
  },
  validation: [],
  review_note: '已核对事实和引用。',
  updated_at: '2026-10-17T00:00:00.000Z',
  warnings: [],
}
let siteStatus = 'published'
const respondDefault = async (input: string | URL | Request, _init?: RequestInit) => {
  const url = new URL(String(input), 'http://localhost:3100')
  if (url.pathname.endsWith('/keywords')) return Response.json({ items: [keyword], total: 1 })
  if (url.pathname.endsWith(`/keywords/${id}`)) return Response.json({ item: keyword })
  if (url.pathname.endsWith(`/sources/${id}`))
    return Response.json({
      items: [
        {
          url: 'https://fixture.example/products/low-voltage-cabinet',
          title: '低压成套配电柜',
          kind: 'website',
          terms: ['低压成套配电柜'],
          status: 'available',
        },
      ],
    })
  if (url.pathname.endsWith('/materials')) return Response.json({ items: [], total: 0 })
  if (url.pathname.endsWith('/articles')) return Response.json({ items: [], total: 0 })
  if (url.pathname.endsWith('/publish') && url.searchParams.get('view') === 'options')
    return Response.json({
      items: [{ id: 1, name: '新闻分类' }],
      total: 1,
      defaultLocale: 'zh',
      siteStatus,
      workerReady: true,
    })
  if (url.pathname.endsWith('/publish')) return Response.json({ items: [], total: 0, counts: {} })
  return Response.json({ items: [], total: 0 })
}
const fetchMock = vi.fn(respondDefault)
const selectFuturePublishTime = () => {
  const parts = new Map(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(Date.now() + 30 * 60_000))
      .map((part) => [part.type, part.value]),
  )
  fireEvent.change(screen.getByLabelText(/指定发布时间/u), {
    target: {
      value: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}T${parts.get('hour')}:${parts.get('minute')}`,
    },
  })
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  siteStatus = 'published'
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GEO manual publishing UI', () => {
  it('loads tenant GEO configuration and presents the reference publishing structure', async () => {
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()

    const requestedPaths = fetchMock.mock.calls.map(
      ([input]) => new URL(String(input), 'http://localhost:3100').pathname,
    )
    expect(requestedPaths).toContain('/api/workspace/fixture/geo/keywords')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('文章标题')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '直接创作文章正文' })).toBeTruthy()
    expect((screen.getByLabelText(/指定发布时间/u) as HTMLInputElement).required).toBe(false)
    expect((screen.getByLabelText(/指定发布时间/u) as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}T/u,
    )
    expect(screen.queryByLabelText('GEO优化词')).toBeNull()
    expect(
      (screen.getByLabelText('发布时间时区') as HTMLSelectElement).querySelectorAll('optgroup'),
    ).toHaveLength(7)
    expect(screen.queryByRole('navigation', { name: '快速导航' })).toBeNull()
    expect(screen.queryByText(/Facebook|LinkedIn/u)).toBeNull()
    expect(screen.getByRole('tablist', { name: '发布目标' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '独立站（1）' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '博客（1）' })).toBeTruthy()
    expect(screen.queryByText('计划状态')).toBeNull()
    expect(screen.getByRole('radio', { name: /手动发布\/manual release/u })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /自动发布\/auto publish/u })).toBeTruthy()
    expect(screen.getByText('自定义编写文章内容即时直接发布')).toBeTruthy()

    expect(screen.getByLabelText('文章标题')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('文章标题'), { target: { value: '新的文章' } })
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('true')
  })

  it('presents one clear choice between an existing article and direct writing', async () => {
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()

    expect(screen.getByRole('button', { name: '选择创作记录文章' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '直接创作文章正文' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选择创作记录文章' }))
    await settle()
    expect(screen.getByRole('dialog', { name: '选择创作文章' })).toBeTruthy()
  })

  it('switches the plan form with the selected publish mode without social channels', async () => {
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()

    fireEvent.click(screen.getByRole('radio', { name: /自动发布\/auto publish/u }))
    await settle()
    expect(screen.queryByRole('navigation', { name: '快速导航' })).toBeNull()
    expect(screen.queryByText(/Facebook|LinkedIn/u)).toBeNull()
    expect(screen.getByLabelText('开始日期')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /手动发布\/manual release/u })).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /手动发布\/manual release/u }))
    expect(screen.queryByRole('navigation', { name: '快速导航' })).toBeNull()
    expect(screen.queryByText(/Facebook|LinkedIn/u)).toBeNull()
    expect(screen.getByLabelText('直接创作文章正文')).toBeTruthy()
  })

  it('lets an unpublished customer save a draft plan while keeping activation unavailable', async () => {
    siteStatus = 'draft'
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()
    expect(screen.queryByText('计划状态')).toBeNull()
    fireEvent.change(screen.getByLabelText('独立站分类'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: '保存计划' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '保存计划' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('saves a directly written, cited article and leaves the one-time plan as a draft offline', async () => {
    siteStatus = 'draft'
    const planPosts: Record<string, unknown>[] = []
    const articlePosts: Record<string, unknown>[] = []
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost:3100')
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url.pathname.endsWith('/articles') && method === 'POST') {
        articlePosts.push(body)
        return Response.json({ item: savedArticle, revisions: [] }, { status: 201 })
      }
      if (url.pathname.endsWith(`/articles/${id}`) && method === 'GET')
        return Response.json({ item: savedArticle, revisions: [] })
      if (url.pathname.endsWith('/plans') && method === 'POST') {
        planPosts.push(body)
        return Response.json(
          { item: { id: 'draft-plan', name: body.name, version: 1, state: 'draft' } },
          { status: 201 },
        )
      }
      return respondDefault(input, init)
    })
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()
    fireEvent.change(screen.getByLabelText('独立站分类'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('文章标题'), {
      target: { value: '低压成套配电柜选型说明' },
    })
    const editor = screen.getByRole('textbox', { name: '直接创作文章正文' }) as HTMLElement
    editor.innerHTML =
      '<p>根据实际负载选择低压成套配电柜，<a href="https://fixture.example/products/low-voltage-cabinet">查看产品参数</a>。</p>'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }))
    await act(async () => {
      for (let index = 0; index < 16; index += 1) await Promise.resolve()
    })
    expect(articlePosts).toHaveLength(1)
    expect(articlePosts[0]).toMatchObject({
      optimizationID: id,
      term: '配电柜',
      materialGroupID: '',
      materialGroupVersion: 0,
      imageID: null,
    })
    expect(articlePosts[0].html).toContain(
      '<a href="https://fixture.example/products/low-voltage-cabinet">',
    )
    expect(planPosts).toHaveLength(1)
    expect(planPosts[0]).toMatchObject({
      action: 'create',
      config: {
        sourceMode: 'articles',
        targets: [{ collection: 'news', categoryID: 1 }],
        schedule: { cadence: 'once', runAt: null, timezone: 'Asia/Shanghai' },
      },
    })
    expect(planPosts.map((body) => body.action)).not.toContain('preview')
    expect(planPosts.map((body) => body.action)).not.toContain('activate')
    expect(screen.getByRole('status').textContent).toContain('暂未开启')
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('false')
    fireEvent.change(screen.getByLabelText('文章标题'), { target: { value: '新的未保存标题' } })
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('true')
  })

  it('saves a manually written article without requiring website evidence or a citation', async () => {
    siteStatus = 'draft'
    const articlePosts: Record<string, unknown>[] = []
    const planPosts: Record<string, unknown>[] = []
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost:3100')
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url.pathname.endsWith('/articles') && method === 'POST') {
        articlePosts.push(body)
        return Response.json({ item: savedArticle, revisions: [] }, { status: 201 })
      }
      if (url.pathname.endsWith('/plans') && method === 'POST') planPosts.push(body)
      return respondDefault(input, init)
    })
    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()
    fireEvent.change(screen.getByLabelText('独立站分类'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('文章标题'), {
      target: { value: '低压成套配电柜选型说明' },
    })
    selectFuturePublishTime()
    const editor = screen.getByRole('textbox', { name: '直接创作文章正文' }) as HTMLElement
    editor.innerHTML =
      '<p>低压成套配电柜应根据负载和安装环境选择。</p><p>产品页面：https://fixture.example/products/low-voltage-cabinet</p>'
    fireEvent.input(editor)
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }))
    await settle()

    expect(articlePosts).toHaveLength(1)
    expect(planPosts).toHaveLength(1)
  })

  it('selects an article, loads its editable content, reviews edits, then submits the new revision once', async () => {
    const requests: { method: string; url: string; body?: Record<string, unknown> }[] = []
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost:3100')
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ method, url: url.pathname, body })
      if (url.pathname.endsWith('/articles') && method === 'GET')
        return Response.json({
          items: [{ id, title: savedArticle.title, version: 1, locale: 'zh', status: 'ready' }],
          total: 1,
        })
      if (url.pathname.endsWith(`/articles/${id}`) && method === 'GET')
        return Response.json({ item: savedArticle, revisions: [] })
      if (url.pathname.endsWith(`/articles/${id}`) && method === 'PATCH')
        return Response.json({
          item: {
            ...savedArticle,
            version: 2,
            title: body?.title,
            summary: body?.summary,
            html: body?.html,
          },
          revisions: [],
        })
      if (url.pathname.endsWith('/publish') && url.searchParams.get('view') === 'options')
        return Response.json({
          items: [{ id: 1, name: '新闻分类' }],
          total: 1,
          defaultLocale: 'zh',
          siteStatus: 'published',
          workerReady: true,
        })
      if (url.pathname.endsWith('/plans') && method === 'POST' && body?.action === 'create')
        return Response.json({
          item: { id: 'plan-1', name: body.name, version: 1, state: 'draft' },
          message: '发布计划已保存。',
        })
      if (url.pathname.endsWith('/plans') && method === 'POST' && body?.action === 'preview')
        return Response.json({
          preview: {
            nextRunAt: '2026-10-18T02:00:00.000Z',
            readyArticleCount: 1,
            articleCount: 1,
            itemCount: 1,
          },
        })
      if (url.pathname.endsWith('/plans') && method === 'POST' && body?.action === 'activate')
        return Response.json({
          item: { id: 'plan-1', name: '单次发布计划', version: 2, state: 'active' },
          message: '发布计划已开启。',
        })
      return Response.json({ items: [], total: 0, counts: {} })
    })

    render(createElement(GeoPublishing, { company, view: 'compose' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '选择创作记录文章' }))
    expect(screen.getByRole('dialog', { name: '选择创作文章' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^选择$/u }))
    await settle()

    const bodyEditor = screen.getByRole('textbox', { name: '文章正文' })
    expect((bodyEditor as HTMLElement).innerHTML).toBe(savedArticle.html)
    expect(screen.queryByLabelText('摘要')).toBeNull()
    expect(screen.queryByLabelText('发布前核查说明')).toBeNull()
    expect(screen.queryByLabelText('我已核对修改后的品牌事实、引用页面和配图')).toBeNull()
    fireEvent.change(screen.getByLabelText('文章标题'), { target: { value: '配电柜选型与安装' } })
    fireEvent.change(screen.getByLabelText('独立站分类'), { target: { value: '1' } })
    selectFuturePublishTime()
    fireEvent.click(screen.getByRole('button', { name: '提交发布' }))
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve()
    })

    const patchRequest = requests.find((request) => request.method === 'PATCH')
    const planCreateRequest = requests.find(
      (request) => request.url.endsWith('/plans') && request.body?.action === 'create',
    )
    expect(patchRequest?.body).toMatchObject({
      version: 1,
      ready: true,
      factsReviewed: true,
      summary: savedArticle.summary,
      reviewNote: '用户在手动发布页面提交修订并请求发布。',
    })
    expect(planCreateRequest?.body).toMatchObject({
      action: 'create',
      config: {
        sourceMode: 'articles',
        sourceIDs: [id],
        targets: [{ collection: 'news', categoryID: 1, locale: 'zh' }],
        approvalMode: 'auto',
        maxArticles: 1,
        schedule: { cadence: 'once', runAt: expect.any(String), timezone: 'Asia/Shanghai' },
      },
    })
    expect(requests.map((request) => request.body?.action).filter(Boolean)).toEqual([
      'create',
      'preview',
      'activate',
    ])
    expect(
      requests.some((request) => request.url.endsWith('/publish') && request.method === 'POST'),
    ).toBe(false)
    expect(screen.getByRole('status').textContent).toContain('单次发布计划已开启')
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('false')
  })

  it('shows reference status tabs and confirms selected plan items through the tenant plan API', async () => {
    const row = {
      id,
      kind: 'plan_item',
      article_id: id,
      article_version: 1,
      title: '低压成套配电柜如何选型',
      target: {
        collection: 'news',
        categoryID: 1,
        categoryName: '产品知识',
        categoryUpdatedAt: '2026-10-17T00:00:00.000Z',
        locale: 'zh',
        companySlug: 'fixture',
        origin: 'https://fixture.example',
        companyUpdatedAt: '2026-10-17T00:00:00.000Z',
      },
      publish_at: '2026-10-17T01:00:00.000Z',
      state: 'awaiting_review',
      status_tab: 'pending',
      attempts: 0,
      target_id: null,
      target_url: null,
      message: '等待人工审核。',
      error_code: null,
      updated_at: '2026-10-17T00:00:00.000Z',
      created_at: '2026-10-17T00:00:00.000Z',
      plan_id: id,
      plan_name: '每周文章计划',
      run_id: id,
      item_id: id,
      account: 'fixture',
      platform: 'news',
    }
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost:3100')
      if (url.pathname.endsWith('/publish'))
        return Response.json({
          items: [row],
          total: 1,
          counts: { pending: 1, publishing: 0, published: 0, failed: 0 },
          workerReady: true,
        })
      if (url.pathname.endsWith('/plans'))
        return Response.json({ message: '已审核并进入发布队列。' })
      return Response.json({ items: [], total: 0 })
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(createElement(GeoPublishing, { company, view: 'records' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()
    })

    expect(screen.getByRole('tab', { name: '待确认 1' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '发布中 0' })).toBeTruthy()
    expect(screen.getByLabelText('按文章标题筛选')).toBeTruthy()
    expect(screen.getByLabelText('按发布账号筛选')).toBeTruthy()
    expect(screen.getByLabelText('按发布计划筛选')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '刷新记录' })).toBeNull()

    fireEvent.click(screen.getByLabelText('选择所有行'))
    fireEvent.click(screen.getByRole('button', { name: '确认发布（1）' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const approval = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), 'http://localhost:3100')
      return url.pathname.endsWith('/plans') && JSON.parse(String(init?.body)).action === 'approve'
    })
    expect(approval).toBeTruthy()
    expect(JSON.parse(String(approval?.[1]?.body))).toMatchObject({
      action: 'approve',
      runID: id,
      itemID: id,
    })
  })
})
