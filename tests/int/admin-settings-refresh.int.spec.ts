import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AboutEditor } from '../../src/platform/components/AboutEditor/AboutEditor'
import { ContactEditor } from '../../src/platform/components/ContactEditor/ContactEditor'
import { FAQManager } from '../../src/platform/components/FAQManager/FAQManager'
import { HomepageBannerEditor } from '../../src/platform/components/HomepageBannerEditor/HomepageBannerEditor'
import { NavigationEditor } from '../../src/platform/components/NavigationEditor/NavigationEditor'
import { SiteManager } from '../../src/platform/components/SiteManager/SiteManager'
import { WorkspaceCategories } from '../../src/platform/components/WorkspaceCategories/WorkspaceCategories'

// Scenarios come from the user's whole-admin interaction/bug review and previous QR/library requirements.
// All responses are in-memory mocks; these tests never save customer data or connect to PostgreSQL.
const state = vi.hoisted(() => ({ canEditContent: true, canManageSite: true, refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('next/image', () => ({ default: ({ alt, src }: { alt: string; src: string }) => h('img', { alt, src }) }))
vi.mock('../../src/platform/components/WorkspaceShell/WorkspacePermissions', () => ({
  useWorkspacePermissions: () => ({ canEditContent: state.canEditContent, canManageSite: state.canManageSite }),
}))
vi.mock('../../src/platform/components/WorkspaceEditor/useWorkspaceUnsaved', () => ({ useWorkspaceUnsaved: vi.fn() }))
const json = (data: object, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
})
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  state.canEditContent = true; state.canManageSite = true; state.refresh.mockClear()
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ message: '已保存', docs: [] })))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true },
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const nav = [
  { localeCode: 'zh', footerIntro: '', items: [{ label: '产品', href: '/products', children: [] }], quickLinks: [] },
  { localeCode: 'en', footerIntro: '', items: [{ label: 'Products', href: '/products', children: [] }], quickLinks: [] },
]
const siteInitial = {
  companyName: '测试公司', defaultDescription: '', defaultLocale: 'zh', enabledLocales: ['zh'],
  indexingEnabled: false, name: '测试站', previewDomain: '', primaryDomain: '', selectedTemplate: 1,
  templateRevision: 1, status: 'building', titleSuffix: '',
}
const templates = ['power-engineering-v1', 'precision-light-v1', 'executive-industrial-pro-v1',
  'atelier-industry-v1', 'interior-575-v1', 'power-705-v1', 'autoparts-571-v1', 'machinery-710-v1',
  'solar-test-655-v1'].map((key, index) => ({ id: index + 1, key, name: `模板 ${index + 1}`, version: '1.0.0' }))
const site = () => h(SiteManager, { companySlug: 'test', createdAt: '2026-01-01', initial: siteInitial,
  templates, templateHistory: [], templateName: '默认模板' })

describe('配置页客户端交互回归（不写客户记录）', () => {
  test('导航输入不丢焦点；切换语种保留草稿，保存后再切回保留新值', async () => {
    render(h(NavigationEditor, { companySlug: 'test', initial: nav }))
    const field = screen.getByRole('textbox', { name: /菜单名称/ })
    field.focus(); fireEvent.change(field, { target: { value: '产品中心' } })
    expect(document.activeElement).toBe(field)
    fireEvent.click(screen.getByRole('button', { name: '英语' }))
    expect((screen.getByRole('textbox', { name: /菜单名称/ }) as HTMLInputElement).value).toBe('Products')
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    expect((screen.getByRole('textbox', { name: /菜单名称/ }) as HTMLInputElement).value).toBe('产品中心')
    fireEvent.submit(document.querySelector('#navigation-settings')!)
    await screen.findByText('简体中文导航已保存。')
    fireEvent.click(screen.getByRole('button', { name: '英语' }))
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    expect((screen.getByRole('textbox', { name: /菜单名称/ }) as HTMLInputElement).value).toBe('产品中心')
  })
  test('导航非法外链保留菜单并阻止静默过滤', async () => {
    render(h(NavigationEditor, { companySlug: 'test', initial: nav }))
    fireEvent.change(screen.getByRole('textbox', { name: /链接地址/ }), { target: { value: 'javascript:alert(1)' } })
    fireEvent.submit(document.querySelector('#navigation-settings')!)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox', { name: /链接地址/ }) as HTMLInputElement).value).toBe('javascript:alert(1)')
  })
  test('关于我们不自动造3个空模块；取消后重新打开还原已保存标题', () => {
    render(h(AboutEditor, { companySlug: 'test', initial: { title: '原简介', intro: '原描述', modules: [] } }))
    expect(screen.getByText('还没有图文模块')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '编辑内容' }))
    expect(screen.queryByText('模块 1')).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: '页面标题' }), { target: { value: '未保存标题' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑内容' }))
    expect((screen.getByRole('textbox', { name: '页面标题' }) as HTMLInputElement).value).toBe('原简介')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  test('FAQ排序不修改原数组；删除网络失败保留问题和错误提示', async () => {
    const original = [
      { id: 2, question: '第二问', answer: '第二个答案', enabled: true, sortOrder: 2 },
      { id: 1, question: '第一问', answer: '第一个答案', enabled: true, sortOrder: 1 },
    ]
    fetchMock.mockRejectedValue(new Error('模拟离线'))
    render(h(FAQManager, { companySlug: 'test', initial: original }))
    expect(original.map((item) => item.id)).toEqual([2, 1])
    const row = screen.getByText('第一问').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: '删除' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '模拟离线')
    expect(screen.getByText('第一问')).toBeTruthy()
  })
  test('联系必填字段和3图位不回退；大于500KB的二维码不发送上传', async () => {
    render(h(ContactEditor, { companySlug: 'test', initial: { address: '地址', email: 'a@test.com',
      phone: '123', whatsapp: '', title: '', intro: '', showInquiryForm: true } }))
    for (const label of ['地址', '邮箱', '电话']) expect((screen.getByLabelText(new RegExp(label)) as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('WhatsApp') as HTMLInputElement).required).toBe(false)
    expect(screen.getAllByLabelText(/上传 .* 二维码/)).toHaveLength(3)
    const file = new File([new Uint8Array(501 * 1024)], 'large.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('上传 WhatsApp 二维码'), { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  test('九模板库始终最底；最后语言不能关；应用后本地修订不被旧props回退', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/templates')
      ? { revision: 2, selectedTemplateId: 2 } : { message: '已保存' })))
    render(site())
    const library = screen.getByRole('region', { name: '模板库' })
    expect(library.querySelectorAll('article')).toHaveLength(9)
    expect(document.querySelector('.site-manager')!.lastElementChild).toBe(library)
    expect((screen.getByRole('checkbox', { name: /简体中文/ }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(within(library.querySelectorAll('article')[1]).getByRole('button', { name: '选择模板' }))
    expect(screen.getByText(/点击“保存站点设置”后应用/)).toBeTruthy()
    fireEvent.submit(document.querySelector('#site-settings')!)
    await screen.findByText('修订 2')
    expect(within(library.querySelectorAll('article')[1]).getByRole('button', { name: '已应用' })).toBeTruthy()
  })
  test('首页关于开关可保存，提交只含开关，实力显示数字/单位/说明', async () => {
    render(h(HomepageBannerEditor, { companySlug: 'test', initial: { showCompanyIntro: true,
      strengthItems: [{ label: '行业经验', value: '20', unit: '年', sortOrder: 1 }] } }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /关于我们/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: '在客户网站展示' }))
    fireEvent.click(screen.getByRole('button', { name: '保存当前模块' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true))
    const request = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')![1]
    expect(JSON.parse(request.body)).toEqual({ mode: 'intro', showCompanyIntro: false })
    await screen.findByText('已保存')
    fireEvent.click(screen.getByRole('button', { name: /企业实力/ }))
    expect((screen.getByLabelText('数字') as HTMLInputElement).value).toBe('20')
    expect((screen.getByLabelText('单位') as HTMLInputElement).value).toBe('年')
    expect((screen.getByLabelText('说明') as HTMLInputElement).value).toBe('行业经验')
  })
  test('分类切换后丢弃旧翻译迟到响应，不在新类型开旧编辑窗', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done }))
    const row = { childCount: 0, contentCount: 1, id: 1, level: 1, name: '产品分类', parentID: null,
      slug: 'products', sortOrder: 1, translationComplete: false, updatedAt: '2026-01-01' }
    render(h(WorkspaceCategories, { companyName: '测试公司', endpoint: '/api/test/categories',
      categories: { products: [row], news: [], cases: [], posts: [] } }))
    fireEvent.click(screen.getByRole('button', { name: '语言' }))
    fireEvent.click(screen.getByRole('button', { name: /文章分类/ }))
    await act(async () => { resolve(json({ translations: { zh: '产品分类' } })); await Promise.resolve() })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('还没有文章分类。')).toBeTruthy()
  })
  test('只读账号可查看，但不能保存/上传联系和选择新模板', () => {
    state.canEditContent = false; state.canManageSite = false
    const first = render(h(ContactEditor, { companySlug: 'test', initial: { address: '地址', email: 'a@test.com',
      phone: '123', whatsapp: '', title: '', intro: '', showInquiryForm: true } }))
    expect((screen.getByRole('button', { name: '保存联系信息' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('上传 WhatsApp 二维码') as HTMLInputElement).matches(':disabled')).toBe(true)
    first.unmount(); render(site())
    expect((screen.getAllByRole('button', { name: '选择模板' })[0] as HTMLButtonElement).disabled).toBe(true)
  })
})
