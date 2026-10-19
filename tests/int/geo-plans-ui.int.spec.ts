import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceCompany } from '../../src/platform/workspace'
import { GeoPlans } from '../../src/platform/components/GeoWorkspace/GeoPlans'

const id = '00000000-0000-4000-8000-000000000001'
const company = { id: 101, slug: 'fixture', name: '当前客户' } as WorkspaceCompany
const plan = {
  id,
  name: '配电柜发布计划',
  version: 1,
  state: 'active',
  next_run_at: null,
  last_run_at: null,
  updated_at: '2026-10-17T01:00:00.000Z',
  runs: [],
  targetSummaries: [
    {
      collection: 'news',
      categoryID: 1,
      categoryName: '新闻分类',
      publishedCount: 2,
      failedCount: 1,
      unknownCount: 1,
      awaitingCount: 3,
      queuedCount: 0,
      lastPublishedAt: '2026-10-16T01:00:00.000Z',
    },
  ],
  sources: [{ id, name: '配电柜选型创作任务' }],
  config: {
    sourceMode: 'tasks',
    sourceIDs: [id],
    distribution: 'all',
    approvalMode: 'manual',
    maxArticles: 2,
    targets: [
      {
        collection: 'news',
        categoryID: 1,
        categoryName: '新闻分类',
        locale: 'zh',
        categoryUpdatedAt: '',
        companySlug: 'fixture',
        companyUpdatedAt: '',
        origin: 'https://fixture.example',
      },
    ],
    schedule: {
      timezone: 'Asia/Shanghai',
      startDate: '2026-10-17',
      endDate: '2026-10-18',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      windowStart: '09:00',
      windowEnd: '17:00',
      intervalMinutes: 60,
    },
  },
}
let currentState = 'active'
let listedPlan = plan
let siteStatus = 'published'
let postBodies: Record<string, unknown>[] = []
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input), 'http://localhost:3100')
  if (init?.method === 'POST') {
    postBodies.push(JSON.parse(String(init.body)))
    throw new Error('测试网络中断')
  }
  if (url.pathname.endsWith('/plans'))
    return Response.json({
      items: [{ ...listedPlan, state: currentState }],
      total: 21,
      pageSize: 15,
    })
  if (url.pathname.endsWith('/publish'))
    return Response.json({
      items: [{ id: Number(url.searchParams.get('page')), name: '当前客户分类' }],
      total: 81,
      siteStatus,
    })
  if (url.pathname.endsWith('/articles'))
    return Response.json({ items: [{ id, title: '配电柜文章', status: 'ready' }], total: 41 })
  if (url.pathname.endsWith('/tasks'))
    return Response.json({ items: [{ id, name: '配电柜搜索词任务', status: 'ready' }], total: 41 })
  return Response.json({ item: { id, name: '已选创作任务', status: 'ready' } })
})
const settle = async (milliseconds = 180) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}
const mount = async (createMode = false) => {
  render(createElement(GeoPlans, { company, canManageSite: true, createMode }))
  await settle()
}
const fillRequiredPlanFields = () => {
  fireEvent.change(screen.getByLabelText('计划名称'), { target: { value: '配电柜计划' } })
  const source = screen.getByText('配电柜搜索词任务').closest('label')?.querySelector('input')
  const target = screen
    .getByText('本站新闻 / 当前客户分类')
    .closest('label')
    ?.querySelector('input')
  if (!source || !target) throw new Error('测试计划来源或发布分类未显示')
  fireEvent.click(source)
  fireEvent.click(target)
  fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-10-18' } })
  fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-10-22' } })
  fireEvent.click(screen.getByLabelText('9:00-9:59'))
  fireEvent.click(screen.getByLabelText('15:00-15:59'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-17T01:00:00.000Z'))
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function close() {
      this.open = false
    }
  currentState = 'active'
  listedPlan = plan
  siteStatus = 'published'
  postBodies = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GEO plan UI corrections requested against the reference site', () => {
  it('opens the plan list with the ten reference columns and no new-plan form', async () => {
    await mount()
    expect(screen.queryByLabelText('计划名称')).toBeNull()
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '',
      '序号',
      '计划名称',
      '发布方式',
      '发布审核',
      '发布平台',
      '状态',
      '关联创作任务',
      '结束时间',
      '操作',
    ])
    expect(screen.getByText('配电柜选型创作任务').getAttribute('href')).toBe(
      `/workspace/fixture/geo/creation/${id}?view=1`,
    )
    expect(screen.queryByRole('link', { name: '新建发布计划' })).toBeNull()
  })

  it('requests later plan pages and applies real name/status filters', async () => {
    await mount()
    fireEvent.click(
      within(screen.getByLabelText('发布计划分页')).getByRole('button', { name: '下一页' }),
    )
    await settle()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('plans?page=2'))).toBe(true)
    fireEvent.change(screen.getByLabelText('搜索发布计划'), { target: { value: '配电柜' } })
    fireEvent.change(screen.getByLabelText('计划状态'), { target: { value: 'paused' } })
    await settle()
    const latest = fetchMock.mock.calls.filter(([url]) => String(url).includes('/plans')).at(-1)
    expect(new URL(String(latest?.[0]), 'http://localhost').searchParams.get('page')).toBe('1')
    expect(new URL(String(latest?.[0]), 'http://localhost').searchParams.get('q')).toBe('配电柜')
    expect(new URL(String(latest?.[0]), 'http://localhost').searchParams.get('state')).toBe(
      'paused',
    )
  })

  it('refreshes running plans while preserving the current page', async () => {
    await mount()
    currentState = 'paused'
    await settle(5100)
    await settle()
    expect(within(screen.getByRole('table')).getByText('已暂停')).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/plans')).length,
    ).toBeGreaterThan(1)
  })

  it('opens reference-style plan details and target publication records', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: '查看' }))
    expect(screen.getByText('配电柜发布计划 · 查看')).toBeTruthy()
    expect(screen.getByText('09:00–17:00')).toBeTruthy()
    expect(screen.getByText('每60分钟')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '发布成功' })).toBeTruthy()
    expect(within(screen.getAllByRole('table')[1]).getByText('等待审核')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看记录' }))
    expect(screen.getByRole('heading', { name: '发布记录' })).toBeTruthy()
    expect(screen.getByText('暂无发布记录')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭发布记录' }))
  })

  it('keeps a legacy plan cadence when only its name is edited', async () => {
    currentState = 'paused'
    await mount()
    fireEvent.click(screen.getByLabelText('更多计划操作：配电柜发布计划'))
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await settle()
    fireEvent.change(screen.getByLabelText('计划名称'), { target: { value: '改名后的计划' } })
    const form = screen.getByRole('button', { name: '保存计划' }).closest('form')!
    await act(async () => fireEvent.submit(form))
    expect(postBodies.at(-1)?.config).toMatchObject({
      schedule: {
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        windowStart: '09:00',
        windowEnd: '17:00',
        intervalMinutes: 60,
      },
    })
  })

  it('keeps an existing article-based plan editable without using that source for new plans', async () => {
    currentState = 'paused'
    listedPlan = {
      ...plan,
      config: { ...plan.config, sourceMode: 'articles' },
      sources: [{ id, name: '旧创作记录' }],
    }
    await mount()
    fireEvent.click(screen.getByLabelText('更多计划操作：配电柜发布计划'))
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await settle()
    expect((screen.getByLabelText('原计划来源') as HTMLSelectElement).value).toBe('articles')
    expect(screen.getByLabelText('指定创作记录')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/articles?'))).toBe(true)
  })

  it('embeds only the automatic plan form and paginates sources and categories', async () => {
    await mount(true)
    expect(screen.getByRole('navigation', { name: '快速导航' })).toBeTruthy()
    expect(screen.getByLabelText('计划名称')).toBeTruthy()
    const timezone = screen.getByLabelText('发布时间时区') as HTMLSelectElement
    expect(timezone.querySelectorAll('optgroup')).toHaveLength(7)
    expect(timezone.querySelector('option[value="America/St_Johns"]')).toBeTruthy()
    expect(screen.getByLabelText('开始日期')).toBeTruthy()
    expect(screen.getByLabelText('结束日期')).toBeTruthy()
    expect(screen.getByLabelText('间隔天数')).toBeTruthy()
    expect(screen.getByText('创作任务')).toBeTruthy()
    expect(screen.getByPlaceholderText('搜索任务名称')).toBeTruthy()
    expect(screen.queryByLabelText('文章来源')).toBeNull()
    const timeSlotLabels = screen
      .getAllByRole('checkbox')
      .map((checkbox) => (checkbox as HTMLInputElement).getAttribute('aria-label') || '')
      .filter((label) => /^\d{1,2}:00-\d{1,2}:59$/.test(label))
    expect(timeSlotLabels).toHaveLength(24)
    expect((screen.getByLabelText('9:00-9:59') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('radio', { name: '自动确认' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: '自动确认' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: '手动确认' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '一篇多发' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '多篇多发' })).toBeTruthy()
    expect(screen.queryByText('发布确认')).toBeNull()
    expect(screen.queryByText('上午')).toBeNull()
    expect(screen.queryByText('下午')).toBeNull()
    expect(screen.queryByText('晚上')).toBeNull()
    expect(screen.queryByText('深夜')).toBeNull()
    expect(screen.queryByLabelText('每次发布篇数')).toBeNull()
    expect(screen.queryByLabelText('重复星期')).toBeNull()
    expect(screen.queryByLabelText('间隔分钟')).toBeNull()
    fireEvent.change(screen.getByLabelText('发布时间时区'), {
      target: { value: 'Asia/Tokyo' },
    })
    expect((screen.getByLabelText('发布时间时区') as HTMLSelectElement).value).toBe('Asia/Tokyo')
    fireEvent.click(screen.getByLabelText('9:00-9:59'))
    fireEvent.click(screen.getByLabelText('15:00-15:59'))
    expect((screen.getByLabelText('9:00-9:59') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('15:00-15:59') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText('搜索发布计划')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/plans?'))).toBe(false)
    fireEvent.click(
      within(screen.getByLabelText('创作任务分页')).getByRole('button', { name: '下一页' }),
    )
    fireEvent.click(
      within(screen.getByLabelText('发布分类分页')).getByRole('button', { name: '下一页' }),
    )
    await settle()
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url).includes('/tasks?') && String(url).includes('page=2'),
      ),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url).includes('/publish?') && String(url).includes('page=2'),
      ),
    ).toBe(true)
  })

  it('navigates immediately with unsaved plan input, as requested', async () => {
    await mount(true)
    fireEvent.change(screen.getByLabelText('计划名称'), { target: { value: '未保存计划' } })
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('true')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const link = document.createElement('a')
    link.href = '/workspace/other/geo/plans'
    document.body.append(link)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    link.remove()
  })

  it('reuses a failed create request ID until the customer changes the form', async () => {
    await mount(true)
    fillRequiredPlanFields()
    const form = screen.getByRole('button', { name: '提交发布' }).closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })
    await act(async () => {
      fireEvent.submit(form)
    })
    expect(postBodies).toHaveLength(2)
    expect(postBodies[0].requestId).toBe(postBodies[1].requestId)
    expect(postBodies[0].config).toMatchObject({
      sourceMode: 'tasks',
      maxArticles: 1,
      schedule: {
        cadence: 'daily',
        timeSlot: '09:00',
        selectedSlots: [9, 15],
        intervalDays: 1,
      },
    })
    fireEvent.change(screen.getByLabelText('计划名称'), { target: { value: '修改后的计划' } })
    await act(async () => {
      fireEvent.submit(form)
    })
    expect(postBodies[2].requestId).not.toBe(postBodies[0].requestId)
  })

  it('defaults an unpublished customer to a savable draft and does not preview or activate it', async () => {
    siteStatus = 'draft'
    await mount(true)
    expect((screen.getByRole('radio', { name: '暂不开启' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '立即开启' }) as HTMLInputElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/计划可以保存为草稿/u)).toBeTruthy()
    fillRequiredPlanFields()
    const form = screen.getByLabelText('计划名称').closest('form')!
    await act(async () => fireEvent.submit(form))
    expect(postBodies.map((body) => body.action)).toEqual(['create'])
    expect(postBodies[0]).toMatchObject({ name: '配电柜计划' })
  })
})
