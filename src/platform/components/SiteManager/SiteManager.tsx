'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ExternalLink, ImageUp, Save, X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { getLegacyTemplate } from '@/platform/legacy-template-catalog'
import { getNewTemplate } from '@/platform/new-templates/registry'

import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './site-manager.scss'

type Value = {
  companyName: string
  defaultDescription: string
  defaultLocale: string
  enabledLocales: string[]
  favicon?: number
  faviconURL?: string
  indexingEnabled: boolean
  logo?: number
  logoURL?: string
  name: string
  previewDomain: string
  primaryDomain: string
  selectedTemplate?: number
  templateRevision: number
  status: string
  titleSuffix: string
}

type TemplateOption = {
  description?: string
  id: number
  key: string
  name: string
  version?: string
}

type Props = {
  companySlug: string
  createdAt: string
  initial: Value
  templateName: string
  templates: TemplateOption[]
  templateHistory: {
    canRollback: boolean
    createdAt: string
    fromRevision: number
    fromTemplate: string
    fromVersion: string
    id: number
    operation: 'apply' | 'rollback'
    toRevision: number
    toTemplate: string
    toVersion: string
  }[]
}

const all = [
  ['zh', '简体中文'],
  ['en', '英语'],
  ['ru', '俄语'],
  ['id', '印尼语'],
] as const

const templateLabel = (template?: TemplateOption | null) => {
  if (!template) return '默认工业模板'
  const legacy = getLegacyTemplate(template.key)
  if (legacy) return `${legacy.name}（${template.version || '1.0.0'}）`
  return `${template.name}${template.version ? `（${template.version}）` : ''}`
}

const templateDescription = (template?: TemplateOption | null) => {
  if (!template) return '默认用于紧固件五金、机械设备、B2B 外贸站点的深色工业风格。'
  const legacy = getLegacyTemplate(template.key)
  if (legacy) return legacy.description
  return template.description || '保存后客户网站会立即应用该模板。'
}

const parseUploadResponse = async (response: Response) => {
  const text = await response.text()
  if (!text) return { message: response.ok ? '上传完成。' : '上传失败。' } as { media?: { id?: number; url?: string | null }; message?: string }
  try {
    return JSON.parse(text) as { media?: { id?: number; url?: string | null }; message?: string }
  } catch {
    return { message: response.ok ? '上传完成。' : '上传失败，服务器返回内容异常。' } as { media?: { id?: number; url?: string | null }; message?: string }
  }
}

export function SiteManager({ companySlug, initial, createdAt, templateName, templates, templateHistory }: Props) {
  const { canManageSite } = useWorkspacePermissions()
  const [value, setValue] = useState(initial)
  const [savedValue, setSavedValue] = useState(initial)
  const [savedTemplateID, setSavedTemplateID] = useState(initial.selectedTemplate)
  const [templateRevision, setTemplateRevision] = useState(initial.templateRevision)
  const [tab, setTab] = useState<'site' | 'settings'>('site')
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(value) !== JSON.stringify(savedValue)
  useWorkspaceUnsaved(dirty, saving)
  const router = useRouter()
  const pendingRequestKey = useRef<string | null>(null)
  const receivedRevision = useRef(initial.templateRevision)
  useEffect(() => {
    if (initial.templateRevision === receivedRevision.current) return
    receivedRevision.current = initial.templateRevision
    setTemplateRevision(initial.templateRevision)
    setSavedTemplateID(initial.selectedTemplate)
    setValue((current) => ({ ...current, selectedTemplate: initial.selectedTemplate }))
    setSavedValue((current) => ({ ...current, selectedTemplate: initial.selectedTemplate }))
  }, [initial.selectedTemplate, initial.templateRevision])
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === value.selectedTemplate) || null,
    [templates, value.selectedTemplate],
  )
  const displayedTemplate = selectedTemplate ? templateLabel(selectedTemplate) : templateName

  const uploadSiteImage = async (file: File, target: 'logo' | 'favicon') => {
    if (saving || !canManageSite) return
    if (file.size > 500 * 1024) {
      setError(true)
      setStatus(`图片大小为 ${(file.size / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 0)}KB，超过单张 500KB 限制，请压缩后重新选择。`)
      return
    }
    const form = new FormData()
    form.set('file', file)
    form.set('alt', target === 'logo' ? '网站 Logo' : '网站 Favicon')
    setSaving(true)
    setError(false)
    setStatus(`${target === 'logo' ? 'Logo' : 'Favicon'} 上传中…`)
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, { body: form, method: 'POST' })
      const result = await parseUploadResponse(response)
      if (!response.ok || !result.media?.id) throw new Error(result.message || '上传失败。')
      setValue((current) => ({
        ...current,
        [target]: result.media?.id,
        [`${target}URL`]: result.media?.url || '',
      }))
      setStatus(`${target === 'logo' ? 'Logo' : 'Favicon'} 上传成功，请点击“保存站点设置”同步到网站。`)
    } catch (error) {
      setError(true)
      setStatus(error instanceof Error ? error.message : '上传失败。')
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (saving || !canManageSite) return
    if (!value.enabledLocales.length) { setStatus('至少启用一种语言后再保存。'); return }
    setSaving(true)
    setStatus('')
    setError(false)
    try {
      const { selectedTemplate: nextTemplateID, ...siteSettings } = value
      const res = await fetch(`/api/workspace/${companySlug}/site-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(siteSettings),
      })
      const settingsResult = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(settingsResult.message || '站点设置未保存。')

      if (nextTemplateID !== savedTemplateID) {
        const key = pendingRequestKey.current || globalThis.crypto.randomUUID()
        pendingRequestKey.current = key
        const templateResponse = await fetch(`/api/workspace/${companySlug}/templates`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            operation: 'apply',
            templateId: nextTemplateID ?? null,
            expectedRevision: templateRevision,
            idempotencyKey: key,
          }),
        })
        const templateResult = await templateResponse.json().catch(() => ({}))
        if (!templateResponse.ok) {
          pendingRequestKey.current = null
          setError(true)
          setValue((current) => ({ ...current, selectedTemplate: savedTemplateID }))
          setSavedValue({ ...value, selectedTemplate: savedTemplateID })
          router.refresh()
          setStatus(`站点其他设置已保存，模板没有切换：${templateResult.message || '请刷新后重试。'}`)
          return
        }
        pendingRequestKey.current = null
        setSavedTemplateID(templateResult.selectedTemplateId ?? undefined)
        setTemplateRevision(templateResult.revision)
        setStatus('站点设置已保存，新模板已经应用。原有产品、文章和客户内容都保留在当前公司。')
      } else {
        setStatus('站点信息、语言和全局设置已保存。')
      }
      setSavedValue(value)
      router.refresh()
    } catch (error) {
      setError(true)
      setStatus(error instanceof Error ? error.message : '网络错误，站点设置未保存。')
    } finally {
      setSaving(false)
    }
  }

  const rollback = async (changeId: number) => {
    if (saving || !canManageSite) return
    if (dirty) { setStatus('请先保存或撤销站点修改，再恢复模板版本。'); return }
    if (!window.confirm('将当前公司恢复到这次变更前的模板？产品、文章和其他内容会继续保留。')) return
    setSaving(true)
    setStatus('')
    setError(false)
    try {
      const response = await fetch(`/api/workspace/${companySlug}/templates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'rollback',
          changeId,
          expectedRevision: templateRevision,
          idempotencyKey: globalThis.crypto.randomUUID(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || '恢复失败，请刷新后重试。')
      setValue((current) => ({ ...current, selectedTemplate: result.selectedTemplateId ?? undefined }))
      setSavedTemplateID(result.selectedTemplateId ?? undefined)
      setSavedValue((current) => ({ ...current, selectedTemplate: result.selectedTemplateId ?? undefined }))
      setTemplateRevision(result.revision)
      setStatus('模板已恢复。产品、文章、案例和其他公司内容没有变化。')
      router.refresh()
    } catch (error) {
      setError(true)
      setStatus(error instanceof Error ? error.message : '网络错误，模板未恢复。')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return <section className="workspace-fixed-editor site-manager">
    <header><div><p>独立站 / 站点管理</p><h1>站点管理</h1>
      <span>{canManageSite ? '配置当前公司的网站信息、语言与模板，保存后生效。' : '当前账号可查看站点信息，站点管理员可以修改。'}</span></div>
      <button disabled={saving || !canManageSite} form="site-settings" type="submit"><Save size={17} />
        {saving ? '处理中…' : '保存站点设置'}</button></header>
    {status && <div className={error ? 'site-manager__feedback is-error' : 'site-manager__feedback'} role={error ? 'alert' : 'status'}><span>{status}</span>
      <button aria-label="关闭提示" onClick={() => setStatus('')} type="button"><X size={16} /></button></div>}
    <nav className="site-manager__tabs" aria-label="站点设置分类">
      <button aria-pressed={tab === 'site'} className={tab === 'site' ? 'active' : ''} disabled={saving}
        onClick={() => setTab('site')} type="button">网站信息</button>
      <button aria-pressed={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} disabled={saving}
        onClick={() => setTab('settings')} type="button">品牌与全局设置</button></nav>
    <form id="site-settings" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <fieldset className="site-manager__controls" disabled={saving || !canManageSite}>
      {tab === 'site' ? <>
        <dl className="site-manager__facts">
          <div><dt>当前应用模板</dt><dd>{templateLabel(templates.find((item) => item.id === savedTemplateID)) || templateName}</dd></div>
          <div><dt>主域名</dt><dd>{value.primaryDomain || '暂未绑定'}</dd></div>
          <div><dt>启用语言</dt><dd>{value.enabledLocales.length}<small> / 4 个版本</small></dd></div>
          <div><dt>站点创建时间</dt><dd>{new Date(createdAt).toLocaleDateString('zh-CN')}</dd></div>
        </dl>
        <section className="site-manager__settings-panel"><div className="site-manager__section-heading">
          <h2>基本信息</h2><span>{dirty ? '有未保存修改' : '当前公司的网站设置'}</span></div>
          <div className="site-manager__fields"><label>站点名称<input required onChange={(event) => setValue({ ...value, name: event.target.value })}
            value={value.name} /></label><label>站点状态<select onChange={(event) => setValue({ ...value, status: event.target.value })}
              value={value.status}><option value="building">搭建中</option><option value="published">已发布</option>
              <option value="suspended">已暂停</option></select></label>
            <label>主域名<input onChange={(event) => setValue({ ...value, primaryDomain: event.target.value })}
              placeholder="www.example.com" spellCheck={false} value={value.primaryDomain} /></label>
            <label>临时预览地址<input onChange={(event) => setValue({ ...value, previewDomain: event.target.value })}
              placeholder={`http://localhost:3100/s/${companySlug}/zh`} spellCheck={false} value={value.previewDomain} /></label></div>
          <div className="site-manager__preview-link"><span>本地预览</span><a href={`/s/${companySlug}/${value.defaultLocale}`}
            rel="noopener noreferrer" target="_blank">打开当前网站<ExternalLink size={14} /></a></div>
        </section>
        <section className="site-manager__settings-panel"><div className="site-manager__section-heading">
          <h2>语言版本</h2><span>至少保留一种启用语言</span></div>
          <div className="site-manager__languages">{all.map(([code, label]) => {
            const enabled = value.enabledLocales.includes(code)
            const last = enabled && value.enabledLocales.length === 1
            return <label key={code}><input checked={enabled} disabled={last}
              onChange={(event) => {
                if (!event.target.checked && last) { setStatus('至少保留一种启用语言。'); return }
                setValue({ ...value,
                  enabledLocales: event.target.checked ? [...value.enabledLocales, code] : value.enabledLocales.filter((entry) => entry !== code),
                  defaultLocale: value.defaultLocale === code && !event.target.checked
                    ? value.enabledLocales.find((entry) => entry !== code) || 'zh' : value.defaultLocale,
                })
              }} type="checkbox" /><strong>{label}</strong>
              <span className={enabled ? 'is-enabled' : 'is-disabled'}>{enabled ? '已启用' : '已停用'}</span></label>
          })}</div>
          <label className="site-manager__default-language">默认语言<select onChange={(event) => setValue({ ...value, defaultLocale: event.target.value })}
            value={value.defaultLocale}>{all.filter(([code]) => value.enabledLocales.includes(code))
              .map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        </section>
        <section className="site-manager__template-history" aria-label="模板版本记录">
          <div className="site-manager__history-heading"><div><h2>模板版本记录</h2>
            <p>每次切换都会留下记录，可恢复最近一次变更。</p></div><span>修订 {templateRevision}</span></div>
          {templateHistory.length ? <ol>{templateHistory.map((change) => <li key={change.id}><div>
            <strong>{change.operation === 'rollback' ? '恢复模板' : '应用模板'} · {change.toTemplate}</strong>
            <span>{change.fromTemplate} → {change.toTemplate}</span>
            <small>修订 {change.fromRevision} → {change.toRevision} · {new Date(change.createdAt).toLocaleString('zh-CN')}</small></div>
            {change.canRollback ? <button type="button" disabled={saving} onClick={() => void rollback(change.id)}>恢复到变更前</button>
              : <em>{change.toRevision === templateRevision ? '当前版本' : '历史版本'}</em>}</li>)}</ol>
            : <p className="site-manager__history-empty">尚无切换记录。应用或恢复模板后，记录会显示在这里。</p>}
        </section>
      </> : <>
        <section className="site-manager__settings-panel"><div className="site-manager__section-heading"><h2>品牌信息</h2>
          <span>Logo 与站点图标只用于当前公司</span></div>
          <label>网站显示公司名称<input onChange={(event) => setValue({ ...value, companyName: event.target.value })}
            value={value.companyName} /></label>
          <div className="site-manager__media-row">{(['logo', 'favicon'] as const).map((target) => {
            const label = target === 'logo' ? '网站 Logo' : '站点图标 Favicon'
            const source = value[`${target}URL`]
            return <label className="site-manager__upload-card" key={target}><strong>{label}</strong>
              {source ? <Image alt={label} height={76} src={source} unoptimized width={220} />
                : <div><ImageUp size={24} /><span>点击上传图片</span></div>}
              <small>JPG / PNG / WebP / SVG · 最大500KB</small>
              <input accept="image/jpeg,image/png,image/webp,image/svg+xml" aria-label={`上传${label}`} disabled={saving}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSiteImage(file, target); event.target.value = '' }}
                type="file" /></label>
          })}</div>
        </section>
        <section className="site-manager__settings-panel"><div className="site-manager__section-heading"><h2>搜索引擎设置</h2></div>
          <label>SEO 标题后缀<input onChange={(event) => setValue({ ...value, titleSuffix: event.target.value })}
            value={value.titleSuffix} /></label><label>默认 SEO 描述<textarea
              onChange={(event) => setValue({ ...value, defaultDescription: event.target.value })} value={value.defaultDescription} /></label>
          <label className="site-manager__checkbox"><input checked={value.indexingEnabled}
            onChange={(event) => setValue({ ...value, indexingEnabled: event.target.checked })} type="checkbox" />允许搜索引擎收录</label>
        </section>
        <section className="site-manager__blog-note"><div><h2>博客内容</h2><p>博客文章与分类在内容管理中维护，沿用当前公司的数据。</p></div>
          <a href={`/workspace/${companySlug}/website/content/blog`}>管理博客<ExternalLink size={14} /></a></section>
      </>}
      </fieldset>
    </form>
    <section className="site-manager__library" aria-label="模板库">
      <div className="site-manager__section-heading"><div><h2>模板库</h2><p>每家公司选择一套模板，产品、文章与其他内容继续保留。</p></div>
        <span>{templates.filter((item) => getNewTemplate(item.key) || getLegacyTemplate(item.key)).length} 套可选模板</span></div>
      {value.selectedTemplate !== savedTemplateID && <div className="site-manager__selection-note"><Check size={17} />
        <span>已选择 {displayedTemplate}，点击“保存站点设置”后应用。</span>
        <button disabled={saving} onClick={() => setValue({ ...value, selectedTemplate: savedTemplateID })} type="button">撤销选择</button></div>}
      <div className="site-manager__template-grid">{templates.filter((item) => getNewTemplate(item.key) || getLegacyTemplate(item.key)).map((item) => {
        const definition = getNewTemplate(item.key)
        const legacy = getLegacyTemplate(item.key)
        const selected = value.selectedTemplate === item.id
        const applied = savedTemplateID === item.id
        return <article className={selected ? 'is-selected' : ''} key={item.id}>
          <div className={`site-manager__layout-demo layout-${definition?.tone || legacy?.tone}`} aria-label="布局示意">
            <div className="demo-nav" /><div className="demo-hero" /><div className="demo-content"><i /><i /><i /><i /></div>
            <small>布局示意</small>{applied && <b>当前应用</b>}</div>
          <h3>{legacy?.name || item.name}</h3><p>{legacy?.description || templateDescription(item)}</p>
          <small>{definition ? `参考编号 ${definition.reference}` : '原有模板'} · 版本 {item.version || '1.0.0'}</small>
          <div className="site-manager__template-actions"><a href={`/template-preview/${companySlug}/${item.key}/${value.defaultLocale}`}
            target="_blank" rel="noopener noreferrer">预览模板<ExternalLink size={13} /></a>
            <button type="button" aria-pressed={selected} disabled={saving || !canManageSite} onClick={() => {
              pendingRequestKey.current = null; setValue({ ...value, selectedTemplate: item.id })
            }}>{selected ? applied ? '已应用' : '待保存' : '选择模板'}</button></div>
        </article>
      })}</div>
    </section>
  </section>
}
