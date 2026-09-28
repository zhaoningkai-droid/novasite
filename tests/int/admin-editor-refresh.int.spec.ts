import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { BlogWorkspaceEditor } from '../../src/platform/components/BlogWorkspaceEditor/BlogWorkspaceEditor'
import { CaseWorkspaceEditor } from '../../src/platform/components/CaseWorkspaceEditor/CaseWorkspaceEditor'
import { NewsWorkspaceEditor } from '../../src/platform/components/NewsWorkspaceEditor/NewsWorkspaceEditor'
import { ProductWorkspaceEditor } from '../../src/platform/components/ProductWorkspaceEditor/ProductWorkspaceEditor'
import { WorkspaceMediaBrowser } from '../../src/platform/components/WorkspaceMediaPicker/WorkspaceMediaBrowser'
import {
  WorkspaceTranslations,
  TranslationLocale,
} from '../../src/platform/components/WorkspaceTranslations/WorkspaceTranslations'
import { useWorkspaceUnsaved } from '../../src/platform/components/WorkspaceEditor/useWorkspaceUnsaved'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    h('a', { ...props, href }, children),
}))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => h('img', { alt, src }),
}))

const json = (value: object, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const common = {
  category: 1,
  content: '原正文\n第二段',
  country: '中国',
  description: '博客摘要',
  summary: '列表摘要',
  title: '内容标题',
}
const locales: TranslationLocale[] = [
  { code: 'zh', complete: true, label: '简体中文', summary: '中文摘要', title: '中文标题' },
  { code: 'en', complete: false, label: '英语', summary: '', title: '' },
  { code: 'ru', complete: false, label: '俄语', summary: '', title: '' },
  { code: 'id', complete: false, label: '印尼语', summary: '', title: '' },
]
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(json({ id: 77, message: '当前内容已保存。' }))
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (this.hasAttribute('open')) {
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      }
    },
  })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const submit = (container: HTMLElement) => fireEvent.submit(container.querySelector('form')!)
const bodyAt = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body as string)

// Source: actual duplicate POST bug, unsafe implicit body rewriting, and save failures found in audit.
describe('内容编辑的保存与旧数据保护', () => {
  test.each(['news', 'cases', 'blog'] as const)('%s 新建后再保存更新同一记录', async (kind) => {
    const component =
      kind === 'news'
        ? NewsWorkspaceEditor
        : kind === 'cases'
          ? CaseWorkspaceEditor
          : BlogWorkspaceEditor
    const categories = kind === 'blog' ? [{ id: 1, title: '分类' }] : [{ id: 1, name: '分类' }]
    const { container } = render(
      h(component as typeof NewsWorkspaceEditor, {
        categories: categories as { id: number; name: string }[],
        companySlug: 'test-company',
        initial: common,
      }),
    )
    submit(container)
    submit(container)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await screen.findByText('当前内容已保存。')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(bodyAt(0).bodyText).toBe(common.content)
    expect(bodyAt(0).idempotencyKey).toMatch(/^[a-zA-Z0-9_-]{16,128}$/)
    fireEvent.change(
      screen.getByLabelText(
        kind === 'cases' ? '案例名称' : kind === 'news' ? '新闻标题' : '博客标题',
      ),
      { target: { value: '第二次修改' } },
    )
    submit(container)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/workspace/test-company/${kind}/manage/77`)
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
    expect(bodyAt(1)).not.toHaveProperty('bodyText')
    expect(bodyAt(1).title).toBe('第二次修改')
  })
  test('编辑原正文未动时不发送bodyText，明确编辑后才发送', async () => {
    const { container } = render(
      h(NewsWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: { ...common, id: 5 },
      }),
    )
    expect((screen.getByLabelText('新闻正文') as HTMLTextAreaElement).readOnly).toBe(true)
    fireEvent.change(screen.getByLabelText('新闻标题'), { target: { value: '只改标题' } })
    submit(container)
    await screen.findByText('当前内容已保存。')
    expect(bodyAt(0)).not.toHaveProperty('bodyText')
    fireEvent.click(screen.getByRole('button', { name: '编辑正文文本' }))
    fireEvent.change(screen.getByLabelText('新闻正文'), { target: { value: '明确修改的正文' } })
    submit(container)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(bodyAt(1).bodyText).toBe('明确修改的正文')
  })
  test('断网和异常响应都保留输入并给中文提示，重试使用同一草稿键', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }))
      .mockResolvedValueOnce(json({ id: 77 }))
    const { container } = render(
      h(NewsWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: common,
      }),
    )
    submit(container)
    await screen.findByText('网络连接失败，请重试。已填写的内容已保留。')
    expect((screen.getByLabelText('新闻标题') as HTMLInputElement).value).toBe(common.title)
    submit(container)
    await screen.findByText('服务器返回异常，请稍后重试。已填写的内容已保留。')
    expect(bodyAt(0).idempotencyKey).toBe(bodyAt(1).idempotencyKey)
    submit(container)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(bodyAt(2).idempotencyKey).toBe(bodyAt(0).idempotencyKey)
  })
  test('空白必填与负数排序在前端拦截，服务端请求未发送', async () => {
    const { container } = render(
      h(NewsWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: {},
      }),
    )
    fireEvent.change(screen.getByLabelText('新闻排序'), { target: { value: '-1' } })
    submit(container)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.getElementById('news-category-error')?.textContent).toBe('请选择新闻分类')
    expect(screen.getByText('排序请填写 0 或正整数')).toBeTruthy()
    expect(screen.getByLabelText('新闻标题').getAttribute('aria-invalid')).toBe('true')
  })
  test('封面上传中不能保存，上传成功只变草稿不自动保存内容', async () => {
    let completeUpload!: (response: Response) => void
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          completeUpload = resolve
        }),
    )
    const { container } = render(
      h(NewsWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: { ...common, id: 5 },
      }),
    )
    fireEvent.change(screen.getByLabelText('上传新闻封面图'), {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    })
    expect(document.documentElement.dataset.workspaceBusy).toBe('true')
    expect(
      screen
        .getAllByRole('button', { name: '图片上传中…' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
    submit(container)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () =>
      completeUpload(json({ media: { id: 88, url: '/api/media/file/test.png' } })),
    )
    await screen.findByText('图片已上传。保存内容后，将应用为封面。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('true')
    expect(document.documentElement.dataset.workspaceBusy).toBe('false')
  })
})

describe('产品图库和富文本', () => {
  const product = {
    category: 1,
    detailHTML: '<table><tr><td>规格</td><td>12</td></tr></table>',
    gallery: [{ id: 9, url: '/api/media/file/product.png' }],
    id: 6,
    tags: ['测试'],
    title: '产品',
  }
  test('初始化HTML正规化不会被误判为用户改了详情', async () => {
    const { container } = render(
      h(ProductWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: product,
      }),
    )
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '改名称' } })
    submit(container)
    await screen.findByText('当前内容已保存。')
    expect(bodyAt(0).detailChanged).toBe(false)
    screen.getByLabelText('产品详情').innerHTML = '<p>新详情</p>'
    fireEvent.input(screen.getByLabelText('产品详情'))
    submit(container)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(bodyAt(1).detailChanged).toBe(true)
    expect(bodyAt(1).detailHTML).toBe('<p>新详情</p>')
  })
  test('保存并继续添加会清空编辑草稿并生成新的创建请求', async () => {
    render(
      h(ProductWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: product,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存并继续添加' }))
    await screen.findByText('上一件产品已保存，可以继续添加。')
    expect((screen.getByLabelText('产品名称') as HTMLInputElement).value).toBe('')
    expect(screen.getByLabelText('产品详情').textContent).toBe('')
    expect(screen.getByRole('heading', { name: '新增产品' })).toBeTruthy()
    expect(router.push).toHaveBeenCalledWith('/workspace/test-company/website/content/new')
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('false')
  })
  test('损坏图片读取失败会结束上传并回收objectURL', async () => {
    const revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const image = {} as HTMLImageElement
      Object.defineProperty(image, 'src', {
        set() {
          queueMicrotask(() => image.onerror?.(new Event('error')))
        },
      })
      return image
    })
    render(
      h(ProductWorkspaceEditor, {
        categories: [{ id: 1, name: '分类' }],
        companySlug: 'test-company',
        initial: product,
      }),
    )
    fireEvent.change(screen.getByLabelText('上传产品图片'), {
      target: { files: [new File(['broken'], 'broken.png', { type: 'image/png' })] },
    })
    await screen.findByText('图片内容无法读取，请更换有效图片。')
    expect(revoke).toHaveBeenCalledWith('blob:test')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.workspaceBusy).toBe('false')
  })
  test('文案起稿使用安全文本且没有假称机器AI服务', () => {
    render(
      h(ProductWorkspaceEditor, {
        categories: [],
        companySlug: 'test-company',
        initial: { title: '<img src=x onerror=alert(1)>' },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '生成文案草稿' }))
    const detail = screen.getByLabelText('产品详情')
    expect(detail.querySelector('img')).toBeNull()
    expect(detail.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(screen.queryByRole('button', { name: 'AI生成' })).toBeNull()
  })
})

describe('四语保存状态', () => {
  test('多个语言草稿切换保留，只保存快照语言，未保存语言不算已完成', async () => {
    const { container } = render(
      h(WorkspaceTranslations, {
        locales,
        returnHref: '/return',
        saveURL: '/api/test-translations',
      }),
    )
    fireEvent.click(screen.getByRole('tab', { name: /英语/ }))
    fireEvent.change(screen.getByLabelText('英语产品名称'), { target: { value: 'English title' } })
    fireEvent.change(screen.getByLabelText('英语列表摘要'), {
      target: { value: 'English summary' },
    })
    expect(screen.getByRole('tab', { name: /英语/ }).textContent).toContain('有未保存修改')
    fireEvent.click(screen.getByRole('tab', { name: /俄语/ }))
    fireEvent.change(screen.getByLabelText('俄语产品名称'), { target: { value: 'Russian title' } })
    fireEvent.change(screen.getByLabelText('俄语列表摘要'), {
      target: { value: 'Russian summary' },
    })
    submit(container)
    submit(container)
    await screen.findByText('当前内容已保存。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyAt(0).locale).toBe('ru')
    fireEvent.click(screen.getByRole('tab', { name: /英语/ }))
    expect((screen.getByLabelText('英语产品名称') as HTMLInputElement).value).toBe('English title')
    expect(screen.getByRole('tab', { name: /英语/ }).textContent).toContain('有未保存修改')
    expect(screen.getByText('2 / 4')).toBeTruthy()
    expect(document.documentElement.dataset.workspaceUnsaved).toBe('true')
  })
  test('语言标签可用方向键切换；空语言数组有可读空状态', () => {
    const { unmount } = render(
      h(WorkspaceTranslations, { locales, returnHref: '/return', saveURL: '/api/test' }),
    )
    fireEvent.keyDown(screen.getByRole('tab', { name: /简体中文/ }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /英语/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /英语/ })).toBe(document.activeElement)
    unmount()
    render(h(WorkspaceTranslations, { locales: [], returnHref: '/return', saveURL: '/api/test' }))
    expect(screen.getByText('没有可维护的语言，请返回内容管理检查。')).toBeTruthy()
  })
})

describe('离开保护与媒体检索', () => {
  function Flag({ busy = false, dirty = false }: { busy?: boolean; dirty?: boolean }) {
    useWorkspaceUnsaved(dirty, busy)
    return h('a', { href: '/another-page' }, '离开')
  }
  test('取消离开保留草稿，刷新会触发浏览器保护', () => {
    render(h(Flag, { dirty: true }))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    screen.getByRole('link').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(window.confirm).toHaveBeenCalled()
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })
  test('保存中阻止站内离开，不用放弃确认掩盖进行中的请求', () => {
    render(h(Flag, { busy: true }))
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    screen.getByRole('link').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(window.alert).toHaveBeenCalledWith('正在保存或上传，请完成后再离开页面。')
    expect(window.confirm).not.toHaveBeenCalled()
  })
  test('媒体库旧搜索晚返回不会覆盖最新结果，Esc后焦点回触发按钮', async () => {
    const pending: ((response: Response) => void)[] = []
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
    render(h(WorkspaceMediaBrowser, { companySlug: 'test-company', onSelect: vi.fn() }))
    const trigger = screen.getByRole('button', { name: '从媒体库选择' })
    fireEvent.click(trigger)
    await waitFor(() => expect(pending.length).toBe(1))
    fireEvent.change(screen.getByLabelText('搜索公司图片'), { target: { value: '最新' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(pending.length).toBe(2))
    await act(async () =>
      pending[1](
        json({
          docs: [
            { id: 2, alt: '最新图片', filename: 'latest.png', url: '/api/media/file/latest.png' },
          ],
        }),
      ),
    )
    expect(screen.getByText('最新图片')).toBeTruthy()
    await act(async () =>
      pending[0](
        json({
          docs: [{ id: 1, alt: '旧图片', filename: 'old.png', url: '/api/media/file/old.png' }],
        }),
      ),
    )
    expect(screen.queryByText('旧图片')).toBeNull()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
