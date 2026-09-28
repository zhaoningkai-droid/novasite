'use client'

import Image from 'next/image'
import { Bell, CirclePlus, ExternalLink, ImageUp, Save, Video, X } from 'lucide-react'
import { ChangeEvent, useEffect, useState } from 'react'

import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './homepage-banner-editor.scss'

type ModuleName = 'banner' | 'video' | 'products' | 'cases' | 'news' | 'intro' | 'strength' | 'inquiry' | 'footer'
type BannerTab = 'desktop' | 'mobile' | 'navigation'
type BannerItem = { desktopImage?: string; desktopMediaID?: number; description?: string; linkType?: 'external' | 'internal' | 'none'; linkURL?: string; mobileImage?: string; mobileMediaID?: number; navigationImage?: string; navigationMediaID?: number; sortOrder: number; title?: string }

type Values = {
  companyIntro?: string
  footerIntro?: string
  companyIntroTitle?: string
  desktopImage?: string
  footerLogoMediaID?: number
  footerLogoURL?: string
  heroDescription?: string
  heroEyebrow?: string
  heroTitle?: string
  inquiryDescription?: string
  inquiryTitle?: string
  mobileImage?: string
  navigationImage?: string
  introImageID?: number
  introImageURL?: string
  videoDescription?: string
  videoMediaID?: number
  videoMediaURL?: string
  videoTitle?: string
  videoURL?: string
  showVideo?: boolean
  showCompanyIntro?: boolean
  showFeaturedProducts?: boolean
  showNews?: boolean
  showCases?: boolean
  showStrength?: boolean
  showInquiryForm?: boolean
  strengthItems?: Array<{ imageID?: number; imageURL?: string; label: string; sortOrder: number; unit: string; value: string }>
  featuredNewsCategoryID?: number | null
  inquiryRequiredFields?: Record<string, boolean>
  socialLinks?: Record<string, string>
  banners?: BannerItem[]
}

type Recommendation = { id: number; imageURL?: string | null; subtitle?: string | null; title: string }

const modules: Array<{ id: ModuleName; label: string }> = [
  { id: 'banner', label: '轮播图' },
  { id: 'video', label: '官方视频' },
  { id: 'products', label: '推荐产品' },
  { id: 'cases', label: '推荐案例' },
  { id: 'news', label: '推荐新闻' },
  { id: 'intro', label: '关于我们' },
  { id: 'strength', label: '企业实力' },
  { id: 'inquiry', label: '询盘表单' },
  { id: 'footer', label: '页脚' },
]

const moduleKeys: Record<ModuleName, Array<keyof Values>> = {
  banner: ['banners', 'desktopImage', 'mobileImage', 'navigationImage', 'heroTitle', 'heroDescription', 'heroEyebrow'],
  video: ['showVideo', 'videoTitle', 'videoDescription', 'videoURL', 'videoMediaID', 'videoMediaURL'],
  products: ['showFeaturedProducts'], cases: ['showCases'], news: ['showNews', 'featuredNewsCategoryID'],
  intro: ['showCompanyIntro'], strength: ['showStrength', 'strengthItems'],
  inquiry: ['showInquiryForm', 'inquiryTitle', 'inquiryDescription', 'inquiryRequiredFields'],
  footer: ['footerIntro', 'footerLogoMediaID', 'footerLogoURL', 'socialLinks'],
}
const moduleValue = (values: Values, module: ModuleName) => JSON.stringify(moduleKeys[module].map((key) => values[key]))

const panelCopy: Record<Exclude<ModuleName, 'banner'>, { description: string; title: string }> = {
  video: { title: '官方视频', description: '可选择本地上传企业宣传视频，或填写第三方公开视频链接。' },
  products: { title: '推荐产品', description: '本区仅展示已在产品管理中设为“推荐首页”的产品，不在这里编辑。' },
  cases: { title: '推荐案例', description: '本区仅展示已在案例管理中设为“推荐首页”的案例，不在这里编辑。' },
  news: { title: '推荐新闻', description: '选择新闻分类后，首页将展示该分类下已推荐首页的新闻。' },
  intro: { title: '关于我们', description: '本区只读展示“关于我们”内容；请通过左侧“关于我们”维护，保存后会同步客户网站。' },
  strength: { title: '企业实力', description: '用数字、单位和说明展示企业能力，可添加图片与调整顺序。' },
  inquiry: { title: '询盘表单', description: '固定显示姓名、公司、邮箱、联系方式和备注，只控制每项是否必填。' },
  footer: { title: '页脚', description: '维护页脚 Logo、公司简介及社媒平台链接。' },
}

const parseUploadResponse = async (response: Response) => {
  const text = await response.text()
  if (!text) return { message: response.ok ? '上传完成。' : '上传失败，服务器没有返回详细原因。' } as { media?: { id?: number; url?: string | null }; message?: string }
  try {
    return JSON.parse(text) as { media?: { id?: number; url?: string | null }; message?: string }
  } catch {
    return { message: response.ok ? '上传完成。' : `上传失败，服务器返回了非 JSON 内容（HTTP ${response.status}）。` } as { media?: { id?: number; url?: string | null }; message?: string }
  }
}
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'mpeg', 'mpg', 'ogv', '3gp'])
const uploadWithProgress = (url: string, form: FormData, onProgress: (progress: number) => void) => new Promise<{ media?: { id?: number; url?: string | null }; message?: string }>((resolve, reject) => {
  const request = new XMLHttpRequest()
  request.open('POST', url)
  request.withCredentials = true
  request.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
  }
  request.onload = () => {
    const response = new Response(request.responseText, { status: request.status })
    void parseUploadResponse(response).then((result) => request.status >= 200 && request.status < 300 ? resolve(result) : reject(new Error(result.message || '上传失败。')))
  }
  request.onerror = () => reject(new Error('网络连接失败，文件没有上传成功。'))
  request.send(form)
})

function UploadPlaceholder({ hint, icon = 'image', onUpload }: { hint: string; icon?: 'image' | 'video'; onUpload?: (file: File) => void }) {
  const Icon = icon === 'video' ? Video : ImageUp
  return <label className="homepage-banner-editor__upload-placeholder">
    <Icon aria-hidden="true" size={32} strokeWidth={1.7} />
    <strong>点击上传</strong>
    <small>{hint}</small>
    {onUpload && <input accept={icon === 'video' ? 'video/*' : 'image/jpeg,image/png,image/webp'} aria-label="选择上传文件" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = '' }} type="file" />}
  </label>
}

type AboutPreview = { description: string; imageURL?: string | null; title: string }

export function HomepageBannerEditor({ aboutPreview = [], companySlug, initial, recommendedCases = [], recommendedProducts = [] }: { aboutPreview?: AboutPreview[]; companySlug: string; initial: Values; recommendedCases?: Recommendation[]; recommendedProducts?: Recommendation[] }) {
  const { canManageSite } = useWorkspacePermissions()
  const [activeModule, setActiveModule] = useState<ModuleName>('banner')
  const [bannerTab, setBannerTab] = useState<BannerTab>('desktop')
  const [activeBannerIndex, setActiveBannerIndex] = useState(0)
  const [values, setValues] = useState<Values>(initial)
  const [saved, setSaved] = useState<Values>(initial)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [newsCategories, setNewsCategories] = useState<Array<{ id: number; name: string }>>([])
  const dirtyModules = modules.filter((module) => moduleValue(values, module.id) !== moduleValue(saved, module.id))
  useWorkspaceUnsaved(dirtyModules.length > 0, saving)
  const banners = values.banners?.length ? values.banners : [{ desktopImage: values.desktopImage, description: values.heroDescription, mobileImage: values.mobileImage, navigationImage: values.navigationImage, sortOrder: 1, title: values.heroTitle }]
  const bannerHint = bannerTab === 'desktop' ? '推荐 1920 × 800，单张最大500KB' : bannerTab === 'mobile' ? '推荐 750 × 400，单张最大500KB' : '导航横幅用于内页顶部，单张最大500KB'
  const update = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }))
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/workspace/${companySlug}/categories/news`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : { docs: [] })
      .then((result) => { if (!controller.signal.aborted) setNewsCategories(result.docs || []) })
      .catch(() => { if (!controller.signal.aborted) setMessage('新闻分类暂时无法读取，请刷新页面重试。') })
    return () => controller.abort()
  }, [companySlug])
  const save = async () => {
    if (saving || !canManageSite) return
    if (activeModule === 'banner' && banners.some((banner) => {
      if (banner.linkType === 'internal') return !banner.linkURL?.startsWith('/') || banner.linkURL.startsWith('//') || banner.linkURL.includes('\\')
      if (banner.linkType === 'external') { try { return new URL(banner.linkURL || '').protocol !== 'https:' } catch { return true } }
      return false
    })) { setMessage('请检查轮播图跳转：站内地址以 / 开头，站外地址使用完整 HTTPS 链接。'); return }
    const mode = activeModule === 'banner' ? 'banner' : activeModule === 'video' ? 'video' : activeModule === 'intro' ? 'intro' : activeModule === 'strength' ? 'strength' : activeModule === 'inquiry' ? 'inquiry' : activeModule === 'news' || activeModule === 'footer' ? 'homepage-config' : 'recommendations'
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/homepage/banner`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(activeModule === 'intro' ? { mode: 'intro', showCompanyIntro: values.showCompanyIntro } : { ...values, banners, config: { featuredNewsCategoryID: values.featuredNewsCategoryID, inquiryRequiredFields: values.inquiryRequiredFields, socialLinks: values.socialLinks, footerIntro: values.footerIntro, footerLogoMediaID: values.footerLogoMediaID }, mode }) })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(result.message || '当前模块没有保存，请重试。')
      const savedKeys = mode === 'homepage-config'
        ? [...moduleKeys.news, ...moduleKeys.footer, 'inquiryRequiredFields' as const]
        : mode === 'recommendations' ? [...moduleKeys.products, ...moduleKeys.cases, 'showNews' as const]
          : moduleKeys[activeModule]
      setSaved((current) => ({ ...current, ...Object.fromEntries(savedKeys.map((key) => [key, values[key]])) }))
      setMessage(result.message || '当前模块已保存。')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '网络连接失败，内容没有保存。') } finally { setSaving(false) }
  }
  const updateBanner = (index: number, patch: Partial<BannerItem>) => {
    const next = banners.map((banner, current) => current === index ? { ...banner, ...patch } : banner)
    const first = next[0]
    update({ banners: next, desktopImage: first.desktopImage || '', heroDescription: first.description || '', heroTitle: first.title || '', mobileImage: first.mobileImage || '', navigationImage: first.navigationImage || '' })
  }
  const addBanner = () => {
    const next = [...banners, { description: '', linkType: 'none' as const, linkURL: '', mobileImage: '', navigationImage: '', sortOrder: banners.length + 1, title: '' }]
    update({ banners: next })
    setActiveBannerIndex(next.length - 1)
    setBannerTab('desktop')
    setMessage('已新增一条轮播图，请上传图片并填写内容后保存。')
  }
  const removeBanner = (index: number) => {
    if (saving || !window.confirm(`移除轮播图 ${index + 1}？保存后生效。`)) return
    if (banners.length === 1) { setMessage('至少保留一条轮播图。'); return }
    const next = banners.filter((_, current) => current !== index).map((banner, current) => ({ ...banner, sortOrder: current + 1 }))
    const first = next[0]
    update({ banners: next, desktopImage: first.desktopImage || '', heroDescription: first.description || '', heroTitle: first.title || '', mobileImage: first.mobileImage || '', navigationImage: first.navigationImage || '' })
    setActiveBannerIndex(Math.max(0, Math.min(index, next.length - 1)))
    setMessage('轮播图已移除，请点击保存使更改生效。')
  }
  const moveBanner = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= banners.length) return
    const next = [...banners]
    ;[next[index], next[target]] = [next[target], next[index]]
    const sorted = next.map((banner, current) => ({ ...banner, sortOrder: current + 1 }))
    const first = sorted[0]
    update({ banners: sorted, desktopImage: first.desktopImage || '', heroDescription: first.description || '', heroTitle: first.title || '', mobileImage: first.mobileImage || '', navigationImage: first.navigationImage || '' })
    setActiveBannerIndex(target)
  }
  const uploadBanner = async (index: number, file: File) => {
    if (saving || !canManageSite) return
    const imageKey = bannerTab === 'desktop' ? 'desktopImage' : bannerTab === 'mobile' ? 'mobileImage' : 'navigationImage'
    const mediaKey = bannerTab === 'desktop' ? 'desktopMediaID' : bannerTab === 'mobile' ? 'mobileMediaID' : 'navigationMediaID'
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 500 * 1024) { setMessage('轮播图支持 JPG、PNG、WebP，单张须大于0且不超过500KB。'); return }
    const form = new FormData(); form.set('file', file); form.set('alt', `${bannerTab === 'desktop' ? 'PC' : bannerTab === 'mobile' ? '移动端' : '导航'} Banner`); form.set('homepageBanner', 'true'); form.set('homepageBannerType', bannerTab)
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, { body: form, method: 'POST' })
      const result = await parseUploadResponse(response)
      if (!response.ok || !result.media?.url || !result.media.id) throw new Error(result.message || '图片上传失败。')
      updateBanner(index, { [imageKey]: result.media.url, [mediaKey]: result.media.id })
      setMessage('图片已上传成功，请点击保存使首页生效。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片上传失败。') } finally { setSaving(false) }
  }
  const uploadVideo = async (file: File) => {
    if (saving || !canManageSite) return
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!file.type.startsWith('video/') && !videoExtensions.has(extension)) { setMessage('请选择视频文件。推荐 MP4 或 WebM，其他常见视频格式也可上传。'); return }
    if (file.size === 0 || file.size > 512 * 1024 * 1024) { setMessage('本地视频大小须大于 0 且不超过 512MB。'); return }
    const form = new FormData(); form.set('file', file); form.set('alt', '首页官方视频'); form.set('homepageVideo', 'true')
    setSaving(true); setUploadProgress(0); setMessage('视频开始上传，请不要关闭页面。')
    try {
      const result = await uploadWithProgress(`/api/workspace/${companySlug}/media`, form, setUploadProgress)
      if (!result.media?.id) throw new Error(result.message || '视频上传失败。')
      update({ showVideo: true, videoMediaID: result.media.id, videoMediaURL: result.media.url || '', videoURL: '' })
      setUploadProgress(100)
      setMessage('视频上传成功，已自动勾选“在客户网站展示官方视频”。请点击右上角“保存”同步到前台。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '视频上传失败。') } finally { setSaving(false) }
  }
  const uploadFooterLogo = async (file: File) => {
    if (saving || !canManageSite) return
    const form = new FormData(); form.set('file', file); form.set('alt', '网站页脚 Logo')
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, { body: form, method: 'POST' })
      const result = await parseUploadResponse(response)
      if (!response.ok || !result.media?.id) throw new Error(result.message || 'Logo 上传失败。')
      update({ footerLogoMediaID: result.media.id, footerLogoURL: result.media.url || '' })
      setMessage('Logo 已上传成功，请点击保存使页脚生效。')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Logo 上传失败。') } finally { setSaving(false) }
  }
  const uploadStrengthImage = async (file: File, index: number) => {
    if (saving || !canManageSite) return
    const form = new FormData(); form.set('file', file); form.set('alt', '企业实力展示图片')
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, { body: form, method: 'POST' })
      const result = await parseUploadResponse(response)
      if (!response.ok || !result.media?.id) throw new Error(result.message || '图片上传失败。')
      const items = values.strengthItems || []
      update({ strengthItems: items.map((item, itemIndex) => itemIndex === index ? { ...item, imageID: result.media?.id, imageURL: result.media?.url || '' } : item) })
      setMessage('图片已上传，请点击保存使首页生效。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片上传失败。') } finally { setSaving(false) }
  }

  return <section className="homepage-banner-editor">
    <header className="homepage-banner-editor__page-header">
      <div><p>网站配置 / 首页管理</p><h1>首页管理</h1><span>按模块维护首页内容、显示状态与图片，保存当前模块后生效。</span></div>
      <button className="homepage-banner-editor__save" disabled={saving || !canManageSite} onClick={() => void save()} type="button"><Save aria-hidden="true" size={17} />{saving ? '处理中…' : '保存当前模块'}</button>
    </header>
    <div className="homepage-banner-editor__workspace">
      <aside aria-label="首页模块列表" className="homepage-banner-editor__module-list">
        <div className="homepage-banner-editor__module-heading"><strong>页面模块</strong><small>9 个模块</small></div>
        {modules.map((module, index) => <button aria-pressed={activeModule === module.id} disabled={saving} className={activeModule === module.id ? 'active' : ''} key={module.id} onClick={() => { setActiveModule(module.id); setMessage('') }} type="button"><b>{String(index + 1).padStart(2, '0')}</b>{module.label}{dirtyModules.some((dirty) => dirty.id === module.id) && <i aria-label="有未保存修改" />}</button>)}
        <a href={`/s/${companySlug}/zh`} rel="noopener noreferrer" target="_blank">预览网站<ExternalLink size={14} /></a>
      </aside>
      <div className="homepage-banner-editor__panel">
        {message && <div className="homepage-banner-editor__notice" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')} type="button"><X size={16} /></button></div>}
        <fieldset className="homepage-banner-editor__controls" disabled={saving || !canManageSite}>
        {activeModule === 'banner' ? <BannerPanel activeIndex={activeBannerIndex} bannerHint={bannerHint} bannerTab={bannerTab} banners={banners} onAdd={addBanner} onChangeBanner={setActiveBannerIndex} onChangeTab={setBannerTab} onMove={moveBanner} onRemove={removeBanner} onUpload={uploadBanner} onUpdateBanner={updateBanner} /> : <GenericPanel aboutPreview={aboutPreview} categories={newsCategories} companySlug={companySlug} module={activeModule} onFooterLogoUpload={uploadFooterLogo} onStrengthImageUpload={uploadStrengthImage} onVideoUpload={uploadVideo} recommendedCases={recommendedCases} recommendedProducts={recommendedProducts} update={update} uploadProgress={uploadProgress} values={values} />}
        </fieldset>
      </div>
    </div>
  </section>
}

function BannerPanel({ activeIndex, bannerHint, bannerTab, banners, onAdd, onChangeBanner, onChangeTab, onMove, onRemove, onUpdateBanner, onUpload }: { activeIndex: number; bannerHint: string; bannerTab: BannerTab; banners: BannerItem[]; onAdd: () => void; onChangeBanner: (index: number) => void; onChangeTab: (tab: BannerTab) => void; onMove: (index: number, direction: -1 | 1) => void; onRemove: (index: number) => void; onUpdateBanner: (index: number, patch: Partial<BannerItem>) => void; onUpload: (index: number, file: File) => void }) {
  const label = bannerTab === 'desktop' ? '电脑端轮播图' : bannerTab === 'mobile' ? '移动端轮播图' : '导航横幅'
  return <>
    <div className="homepage-banner-editor__panel-header"><div><h2>轮播图</h2><p>分别维护电脑端、移动端与导航横幅。</p></div><button className="homepage-banner-editor__outline-button" onClick={onAdd} type="button"><CirclePlus aria-hidden="true" size={17} />添加轮播图</button></div>
    <nav aria-label="轮播图类型" className="homepage-banner-editor__tabs homepage-banner-editor__tabs--sub">{(['desktop', 'mobile', 'navigation'] as const).map((tab) => <button aria-pressed={bannerTab === tab} className={bannerTab === tab ? 'active' : ''} key={tab} onClick={() => onChangeTab(tab)} type="button">{tab === 'desktop' ? '电脑端' : tab === 'mobile' ? '移动端' : '导航横幅'}</button>)}</nav>
    <div className="homepage-banner-editor__banner-list">
      {banners.map((banner, index) => {
        const image = bannerTab === 'desktop' ? banner.desktopImage : bannerTab === 'mobile' ? banner.mobileImage : banner.navigationImage
        return <section className={activeIndex === index ? 'homepage-banner-editor__banner-form active' : 'homepage-banner-editor__banner-form'} key={index} onFocusCapture={() => onChangeBanner(index)}>
          <div className="homepage-banner-editor__banner-card-title">轮播图 {String(index + 1).padStart(2, '0')}<small>{bannerHint}</small></div>
          <div className="homepage-banner-editor__banner-preview">{image ? <label className="homepage-banner-editor__image-current"><Image unoptimized width={640} height={360} alt={`${label} ${index + 1} 当前图片`} src={image} /><span>点击更换图片</span><input accept="image/jpeg,image/png,image/webp" aria-label={`更换 Banner ${index + 1} 图片`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(index, file); event.target.value = '' }} type="file" /></label> : <UploadPlaceholder hint={bannerHint} onUpload={(file) => onUpload(index, file)} />}</div>
          <div className="homepage-banner-editor__fields">
            <Field label="名称" onChange={(event) => onUpdateBanner(index, { title: event.target.value })} placeholder={`请输入${label}名称`} value={banner.title || ''} />
            <Field label="简介" multiline onChange={(event) => onUpdateBanner(index, { description: event.target.value })} placeholder="请输入简介" value={banner.description || ''} />
            <label className="homepage-banner-editor__field"><span>排序</span><input min="0" onChange={(event) => onUpdateBanner(index, { sortOrder: Number(event.target.value) || 0 })} type="number" value={banner.sortOrder} /></label>
            <label className="homepage-banner-editor__field"><span>跳转类型</span><select onChange={(event) => onUpdateBanner(index, { linkType: event.target.value as BannerItem['linkType'], linkURL: event.target.value === 'none' ? '' : banner.linkURL || '' })} value={banner.linkType || 'none'}><option value="none">无跳转</option><option value="internal">站内链接</option><option value="external">站外链接</option></select></label>
            {banner.linkType && banner.linkType !== 'none' ? <Field label={banner.linkType === 'internal' ? '站内路径' : '站外链接'} onChange={(event) => onUpdateBanner(index, { linkURL: event.target.value })} placeholder={banner.linkType === 'internal' ? '例如 /products 或 /news' : '请输入 https:// 开头的链接'} value={banner.linkURL || ''} /> : null}
            <div className="homepage-banner-editor__inline-actions"><button disabled={index === 0} onClick={() => onMove(index, -1)} type="button">上移</button><button disabled={index === banners.length - 1} onClick={() => onMove(index, 1)} type="button">下移</button><button className="danger" disabled={banners.length === 1} onClick={() => onRemove(index)} type="button">删除本条</button></div>
          </div>
        </section>
      })}
    </div>
  </>
}

function GenericPanel({ aboutPreview, categories, companySlug, module, onFooterLogoUpload, onStrengthImageUpload, onVideoUpload, recommendedCases, recommendedProducts, update, uploadProgress, values }: { aboutPreview: AboutPreview[]; categories: Array<{ id: number; name: string }>; companySlug: string; module: Exclude<ModuleName, 'banner'>; onFooterLogoUpload: (file: File) => void; onStrengthImageUpload: (file: File, index: number) => void; onVideoUpload: (file: File) => void; recommendedCases: Recommendation[]; recommendedProducts: Recommendation[]; update: (patch: Partial<Values>) => void; uploadProgress: number | null; values: Values }) {
  const copy = panelCopy[module]
  const readOnly = module === 'products' || module === 'cases'
  return <>
    <div className="homepage-banner-editor__panel-header"><div><h2>{copy.title}</h2><p>{copy.description}</p></div><ModuleVisibility module={module} update={update} values={values} /></div>
    {readOnly ? <ReadOnlyRecommendation items={module === 'products' ? recommendedProducts : recommendedCases} type={copy.title} /> : module === 'video' ? <VideoForm onVideoUpload={onVideoUpload} update={update} uploadProgress={uploadProgress} values={values} /> : module === 'news' ? <NewsForm categories={categories} update={update} values={values} /> : module === 'intro' ? <AboutReadOnly companySlug={companySlug} items={aboutPreview} /> : module === 'strength' ? <StrengthForm onUpload={onStrengthImageUpload} update={update} values={values} /> : module === 'inquiry' ? <InquiryForm update={update} values={values} /> : <FooterForm onUpload={onFooterLogoUpload} update={update} values={values} />}
  </>
}

function ModuleVisibility({ module, update, values }: { module: Exclude<ModuleName, 'banner'>; update: (patch: Partial<Values>) => void; values: Values }) {
  const key = module === 'products' ? 'showFeaturedProducts' : module === 'cases' ? 'showCases' : module === 'news' ? 'showNews' : module === 'intro' ? 'showCompanyIntro' : module === 'strength' ? 'showStrength' : module === 'inquiry' ? 'showInquiryForm' : null
  if (!key || module === 'video' || module === 'footer') return null
  return <label className="homepage-banner-editor__switch homepage-banner-editor__switch--header"><input checked={values[key] !== false} onChange={(event) => update({ [key]: event.target.checked })} type="checkbox" />在客户网站展示</label>
}

function Field({ label, multiline = false, onChange, placeholder, value }: { label: string; multiline?: boolean; onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; placeholder: string; value?: string }) {
  return <label className="homepage-banner-editor__field"><span>{label}</span>{multiline ? <textarea onChange={onChange} placeholder={placeholder} readOnly={!onChange} value={value} /> : <input onChange={onChange} placeholder={placeholder} readOnly={!onChange} value={value} />}</label>
}

function ReadOnlyRecommendation({ items, type }: { items: Recommendation[]; type: string }) {
  return <div className="homepage-banner-editor__readonly"><h3>已推荐</h3>{items.length ? <div className="homepage-banner-editor__recommendation-list">{items.map((item) => <article key={item.id}>{item.imageURL ? <Image unoptimized width={640} height={360} alt="" src={item.imageURL} /> : <ImageUp aria-hidden="true" size={22} />}<div><strong>{item.title}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</div></article>)}</div> : <div className="homepage-banner-editor__empty-readonly"><ImageUp aria-hidden="true" size={30} /><p>当前没有已推荐的{type}</p><small>请在内容管理中设置“推荐首页”，本页只作展示。</small></div>}</div>
}

function VideoForm({ onVideoUpload, update, uploadProgress, values }: { onVideoUpload: (file: File) => void; update: (patch: Partial<Values>) => void; uploadProgress: number | null; values: Values }) {
  const [source, setSource] = useState<'local' | 'external'>(values.videoMediaID ? 'local' : 'external')
  return <div className="homepage-banner-editor__form-grid"><Field label="模块名称" onChange={(event) => update({ videoTitle: event.target.value })} placeholder="官方视频" value={values.videoTitle || ''} /><Field label="简介" multiline onChange={(event) => update({ videoDescription: event.target.value })} placeholder="请输入视频简介" value={values.videoDescription || ''} /><label className="homepage-banner-editor__switch"><input checked={values.showVideo === true} onChange={(event) => update({ showVideo: event.target.checked })} type="checkbox" />在客户网站展示官方视频</label><div className="homepage-banner-editor__video-choice"><span>视频来源</span><button className={source === 'local' ? 'active' : ''} onClick={() => setSource('local')} type="button">本地上传</button><button className={source === 'external' ? 'active' : ''} onClick={() => setSource('external')} type="button">第三方链接</button></div>{source === 'local' ? <><UploadPlaceholder hint={values.videoMediaID ? '视频已选择，可重新上传视频。推荐 MP4 / WebM，大小不超过 512MB' : '推荐 MP4 / WebM，其他常见视频格式也可上传，大小不超过 512MB'} icon="video" onUpload={onVideoUpload} />{uploadProgress !== null && uploadProgress < 100 ? <div className="homepage-banner-editor__upload-progress"><span>视频上传中 {uploadProgress}%</span><progress max={100} value={uploadProgress} /></div> : null}{values.videoMediaID ? <div className="homepage-banner-editor__video-status"><strong>视频已上传成功</strong><span>已选择本地视频。点击右上角“保存”后，前台首页会同步显示。</span>{values.videoMediaURL ? <video controls preload="metadata" src={values.videoMediaURL} /> : null}</div> : null}</> : <Field label="视频链接" onChange={(event) => update({ videoMediaID: undefined, videoMediaURL: '', videoURL: event.target.value })} placeholder="请输入公开 HTTPS 视频链接" value={values.videoURL || ''} />}</div>
}

function NewsForm({ categories, update, values }: { categories: Array<{ id: number; name: string }>; update: (patch: Partial<Values>) => void; values: Values }) {
  return <div className="homepage-banner-editor__form-grid"><p className="homepage-banner-editor__helper">新闻的标题、简介与图片请在内容管理中编辑。本模块设置显示范围。</p><label className="homepage-banner-editor__field"><span>资讯分类</span><select aria-label="推荐新闻分类" onChange={(event) => update({ featuredNewsCategoryID: event.target.value ? Number(event.target.value) : null })} value={values.featuredNewsCategoryID || ''}><option value="">请选择新闻分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="homepage-banner-editor__hint-block"><Bell aria-hidden="true" size={20} /><p>选择一个新闻分类后，首页展示该分类中已推荐首页的新闻。</p></div></div>
}

function AboutReadOnly({ companySlug, items }: { companySlug: string; items: AboutPreview[] }) {
  return <div className="homepage-banner-editor__readonly"><div className="homepage-banner-editor__readonly-title"><h3>企业简介模块</h3><a href={`/workspace/${companySlug}/website/about`}>前往“关于我们”编辑</a></div>{items.length ? <div className="homepage-banner-editor__recommendation-list">{items.map((item, index) => <article key={`${item.title}-${index}`}>{item.imageURL ? <Image unoptimized width={640} height={360} alt={item.title} src={item.imageURL} /> : <ImageUp aria-hidden="true" size={22} />}<div><strong>{item.title}</strong><small>{item.description || '暂未填写模块描述。'}</small></div></article>)}</div> : <div className="homepage-banner-editor__empty-readonly"><ImageUp aria-hidden="true" size={30} /><p>暂未维护关于我们模块</p><small>请到左侧“关于我们”页面添加企业图文模块。</small></div>}</div>
}

function StrengthForm({ onUpload, update, values }: { onUpload: (file: File, index: number) => void; update: (patch: Partial<Values>) => void; values: Values }) {
  const items = values.strengthItems || []
  const replace = (index: number, patch: Partial<{ imageID?: number; imageURL?: string; label: string; sortOrder: number; unit: string; value: string }>) => update({ strengthItems: items.map((item, current) => current === index ? { ...item, ...patch } : item) })
  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    update({ strengthItems: next.map((item, current) => ({ ...item, sortOrder: current + 1 })) })
  }
  const remove = (index: number) => { if (window.confirm('移除此项企业实力？保存后生效。')) update({ strengthItems: items.filter((_, current) => current !== index).map((item, current) => ({ ...item, sortOrder: current + 1 })) }) }
  return <div className="homepage-banner-editor__strength-preview">
    {items.map((item, index) => <article className="homepage-banner-editor__strength-card" key={index}>
      <div className="homepage-banner-editor__strength-card-header"><strong>企业实力 {index + 1}</strong><div className="homepage-banner-editor__inline-actions"><button disabled={index === 0} onClick={() => reorder(index, -1)} type="button">上移</button><button disabled={index === items.length - 1} onClick={() => reorder(index, 1)} type="button">下移</button><button className="danger" onClick={() => remove(index)} type="button">删除</button></div></div>
      <div className="homepage-banner-editor__strength-card-body">
        <div className="homepage-banner-editor__strength-media">{item.imageURL ? <label className="homepage-banner-editor__image-current"><Image unoptimized width={640} height={360} alt="企业实力图片" src={item.imageURL} /><span>点击更换</span><input accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, index); event.target.value = '' }} type="file" /></label> : <UploadPlaceholder hint="点击上传图片" onUpload={(file) => onUpload(file, index)} />}</div>
        <div className="homepage-banner-editor__strength-fields">
          <Field label="数字" onChange={(event) => replace(index, { value: event.target.value })} placeholder="例如 20、1000 或 99.9" value={item.value} />
          <Field label="单位" onChange={(event) => replace(index, { unit: event.target.value })} placeholder="例如 年、家、%（选填）" value={item.unit} />
          <Field label="说明" onChange={(event) => replace(index, { label: event.target.value })} placeholder="例如 行业经验" value={item.label} />
          <label className="homepage-banner-editor__field"><span>排序</span><input aria-label={`企业实力 ${index + 1} 排序`} min="0" onChange={(event) => replace(index, { sortOrder: Number(event.target.value) || 0 })} type="number" value={item.sortOrder} /></label>
        </div>
      </div>
    </article>)}
    <button className="homepage-banner-editor__outline-button" onClick={() => update({ strengthItems: [...items, { label: '', sortOrder: items.length + 1, unit: '', value: '' }] })} type="button"><CirclePlus aria-hidden="true" size={18} />添加企业实力</button>
  </div>
}

function InquiryForm({ update, values }: { update: (patch: Partial<Values>) => void; values: Values }) {
  const fields = [
    { key: 'name', label: '姓名', placeholder: '您的姓名' },
    { key: 'company', label: '公司', placeholder: '公司名称' },
    { key: 'email', label: '邮箱', placeholder: '您的邮箱地址' },
    { key: 'phone', label: '联系', placeholder: 'Phone/WhatsApp' },
    { key: 'message', label: '备注', placeholder: '需求描述' },
  ]
  const required = { name: true, company: false, email: true, phone: true, message: true, ...values.inquiryRequiredFields }
  return <div className="homepage-banner-editor__inquiry-preview"><Field label="模块名称" onChange={(event) => update({ inquiryTitle: event.target.value })} placeholder="询盘表单" value={values.inquiryTitle || ''} /><Field label="简介" multiline onChange={(event) => update({ inquiryDescription: event.target.value })} placeholder="配置询盘表单信息" value={values.inquiryDescription || ''} /><div className="homepage-banner-editor__inquiry-fields">{fields.map((field) => <div key={field.key}><span>{field.label}</span>{field.key === 'message' ? <textarea placeholder={field.placeholder} readOnly /> : <input placeholder={field.placeholder} readOnly />}<label><input checked={required[field.key as keyof typeof required]} onChange={(event) => update({ inquiryRequiredFields: { ...required, [field.key]: event.target.checked } })} type="checkbox" />必填</label></div>)}</div></div>
}

function FooterForm({ onUpload, update, values }: { onUpload: (file: File) => void; update: (patch: Partial<Values>) => void; values: Values }) {
  const social = values.socialLinks || {}
  const platforms = [['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['blog', 'Blog']] as const
  return <div className="homepage-banner-editor__footer-preview"><div className="homepage-banner-editor__footer-top">{values.footerLogoURL ? <label className="homepage-banner-editor__image-current"><Image unoptimized width={640} height={360} alt="页脚 Logo" src={values.footerLogoURL} /><span>点击更换 Logo</span><input accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = '' }} type="file" /></label> : <UploadPlaceholder hint="点击上传页脚 Logo" onUpload={onUpload} />}<Field label="关于" multiline onChange={(event) => update({ footerIntro: event.target.value })} placeholder="请输入页脚公司简介" value={values.footerIntro || ''} /></div><div className="homepage-banner-editor__social-grid">{platforms.map(([key, platform]) => <Field key={key} label={platform} onChange={(event) => update({ socialLinks: { ...social, [key]: event.target.value } })} placeholder={`请输入 ${platform} 链接`} value={social[key] || ''} />)}</div></div>
}
