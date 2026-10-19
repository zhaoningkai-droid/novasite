import { createElement, createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceCompany } from '../../src/platform/workspace'
import { GeoCreation } from '../../src/platform/components/GeoWorkspace/GeoCreation'
import { GeoRichTextToolbar } from '../../src/platform/components/GeoWorkspace/GeoRichTextToolbar'

const fixture = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fixture.push }) }))

const taskID = '00000000-0000-4000-8000-000000000001'
const keyID = '00000000-0000-4000-8000-000000000002'
const groupID = '00000000-0000-4000-8000-000000000003'
const company = {
  id: 101,
  slug: 'fixture',
  name: '当前客户',
  defaultLocale: 'zh',
} as WorkspaceCompany
const task = {
  id: taskID,
  name: '配电柜选型任务',
  version: 3,
  status: 'ready',
  updatedAt: '2026-10-17T01:00:00.000Z',
  optimizationID: keyID,
  optimizationVersion: 2,
  locale: 'zh',
  questions: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      term: '配电柜',
      intent: 'default',
      original: '配电柜如何选型？',
      translated: '',
      translatedFrom: '',
      translatedLocale: '',
    },
  ],
  materialGroupID: groupID,
  materialGroupVersion: 1,
  imagesPerArticle: 1,
  direction: 'AI匹配',
  length: 'short',
  mode: 'deduplicate',
  count: 1,
  snapshot: {},
}
const keyword = {
  id: keyID,
  version: 2,
  brand: '澄川电气',
  core: '配电柜',
  terms: ['低压成套配电柜'],
  aliases: ['澄川配电'],
}
const group = {
  id: groupID,
  name: '配电柜素材',
  version: 1,
  images: [{ id: 1, url: '/test.jpg', alt: '配电柜', available: true }],
}
const taskRow = {
  id: taskID,
  name: task.name,
  locale: 'zh',
  direction: 'AI匹配',
  questions: 1,
  status: 'ready',
  updated_at: '2026-10-17T01:00:00.000Z',
  version: 3,
  count: 1,
  available_count: 1,
  generated_count: 0,
  used_count: 0,
  related_plan_count: 1,
  generation_state: 'running',
}
let fetchMock: ReturnType<typeof vi.fn>
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

beforeEach(() => {
  fixture.push.mockReset()
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function close() {
      this.open = false
    }
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost:3100')
    if (init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'DELETE')
      return Response.json({ message: 'unexpected mutation' }, { status: 500 })
    if (url.pathname.endsWith(`/tasks/${taskID}`)) return Response.json({ item: task })
    if (url.pathname.endsWith(`/keywords/${keyID}`)) return Response.json({ item: keyword })
    if (url.pathname.endsWith(`/materials/${groupID}`)) return Response.json({ item: group })
    if (url.pathname.endsWith('/keywords')) return Response.json({ items: [keyword], total: 1 })
    if (url.pathname.endsWith('/materials')) return Response.json({ items: [group], total: 1 })
    if (url.pathname.endsWith('/plans'))
      return Response.json({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000010',
            name: '配电柜计划',
            state: 'active',
            config: { schedule: { cadence: 'daily' }, targets: [{ collection: 'news' }] },
            created_at: '2026-10-17T01:00:00.000Z',
          },
        ],
        total: 1,
      })
    if (url.pathname.endsWith('/tasks'))
      return Response.json({ items: [taskRow], total: 1, page: 1, pageSize: 10 })
    return Response.json({ items: [], total: 0 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand)
  else Reflect.deleteProperty(document, 'execCommand')
})

describe('GEO creation controls follow task and reference state', () => {
  it('opens a plan-linked task as a read-only view and cannot submit changes', async () => {
    render(createElement(GeoCreation, { company, recordId: taskID, readOnly: true }))

    expect(await screen.findByRole('heading', { name: '查看任务' })).toBeTruthy()
    const name = screen.getByLabelText(/任务名称/) as HTMLInputElement
    expect(name.matches(':disabled')).toBe(true)
    expect(screen.getByText('AI生成').closest('button')?.matches(':disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy()

    const form = name.closest('form')
    expect(form).toBeTruthy()
    await act(async () => {
      fireEvent.submit(form!)
    })
    await waitFor(() => expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true))
  })

  it('exposes the reference rich-text controls and applies selected block formatting', () => {
    const execute = vi.fn()
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execute,
    })
    const editorRef = createRef<HTMLDivElement>()
    render(
      createElement(
        'div',
        null,
        createElement(GeoRichTextToolbar, {
          editorRef,
          onChange: vi.fn(),
        }),
        createElement('div', { ref: editorRef, contentEditable: true }),
      ),
    )

    fireEvent.change(screen.getByLabelText('标题样式'), { target: { value: 'h4' } })
    fireEvent.click(screen.getByRole('button', { name: '左对齐' }))
    expect(execute).toHaveBeenCalledWith('formatBlock', false, 'h4')
    expect(execute).toHaveBeenCalledWith('justifyLeft', false, undefined)
    expect(screen.getByRole('option', { name: '48px' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '插入表格' })).toBeTruthy()
  })

  it('locks plan-linked and already-running task actions in the list', async () => {
    render(createElement(GeoCreation, { company }))

    expect(await screen.findByText(task.name)).toBeTruthy()
    const typeFilter = screen.getByLabelText('文章类型') as HTMLSelectElement
    expect(screen.getByLabelText('前往任务页码')).toBeTruthy()
    fireEvent.change(typeFilter, { target: { value: 'search' } })
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            new URL(String(input), 'http://localhost:3100').searchParams.get('type') === 'search',
        ),
      ).toBe(true),
    )
    expect(screen.getByLabelText('选择当前页全部任务').matches(':disabled')).toBe(true)
    expect(screen.getByLabelText(`选择任务 ${task.name}`).matches(':disabled')).toBe(true)
    expect(screen.getByRole('cell', { name: '1/篇' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '查看' }).getAttribute('href')).toBe(
      `/workspace/fixture/geo/creation/${taskID}?view=1`,
    )
    const generate = screen.getByRole('button', { name: '生成中' })
    expect(generate.matches(':disabled')).toBe(true)
    fireEvent.click(screen.getByLabelText(`更多任务操作：${task.name}`))
    expect(screen.getByRole('button', { name: '删除' }).matches(':disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '复制' }).matches(':disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '1个计划' }))
    const relatedDialog = await screen.findByRole('dialog', { name: '关联发布计划' })
    expect(await within(relatedDialog).findByText('配电柜计划')).toBeTruthy()
    const viewPlanLink = within(relatedDialog).getByRole('link', { name: '查看' })
    expect(viewPlanLink.getAttribute('href')).toContain(`sourceID=${taskID}`)
    expect(viewPlanLink.getAttribute('href')).toContain(
      'planID=00000000-0000-4000-8000-000000000010',
    )
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), 'http://localhost:3100')
        return url.pathname.endsWith('/plans') && url.searchParams.get('sourceID') === taskID
      }),
    ).toBe(true)
  })
})
