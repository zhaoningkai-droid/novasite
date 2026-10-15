'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, Check, Globe2, Plus, Search, X } from 'lucide-react'

import type { WorkspaceCompany } from '@/platform/workspace'
import { WorkspaceTopNavigation } from '@/platform/components/WorkspaceShell/WorkspaceTopNavigation'
import { getLegacyTemplate } from '@/platform/legacy-template-catalog'

import './company-selection.scss'

type TemplateOption = { id: number; key: string; name: string; version?: string }
type Props = {
  canCreateCompanies?: boolean
  companies: WorkspaceCompany[]
  initialCompanyID?: number
  templates?: TemplateOption[]
}
type CreateForm = { name: string; slug: string; selectedTemplate: string }

const statusLabel = (status: WorkspaceCompany['status']) => {
  if (status === 'published') return '网站已发布'
  if (status === 'suspended') return '网站已暂停'
  return '网站搭建中'
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '更新时间未知'
    : `更新于 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)}`
}

const setSelectedCompanyCookie = (companyID: number) => {
  document.cookie = `payload-tenant=${encodeURIComponent(String(companyID))}; Max-Age=31536000; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
}

const templateLabel = (template?: TemplateOption) => {
  if (!template) return '默认 · 深蓝工业经典'
  const legacy = getLegacyTemplate(template.key)
  if (legacy) return legacy.name
  return template.name
}

const normalizeSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 56)

const candidateSlug = (name: string) => {
  const ascii = normalizeSlug(name)
  if (ascii) return ascii
  const codePoints = Array.from(name.trim(), (character) => character.codePointAt(0)?.toString(36) || '')
    .filter(Boolean)
    .join('-')
    .slice(0, 46)
  return codePoints ? `company-${codePoints}` : ''
}

export function CompanySelection({ companies, initialCompanyID, templates = [], canCreateCompanies = false }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const activeCompanyID = initialCompanyID
  const [enteringCompanyID, setEnteringCompanyID] = useState<number | null>(null)
  const [items, setItems] = useState(companies)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<CreateForm>({ name: '', slug: '', selectedTemplate: '' })
  const templateByID = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates])
  const visibleCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalizedQuery) return items
    return items.filter((company) => {
      const template = templateByID.get(company.selectedTemplateID || -1)
      return `${company.name} ${company.slug} ${company.primaryDomain || ''} ${templateLabel(template)}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalizedQuery)
    })
  }, [items, query, templateByID])

  const closeCreate = useCallback(() => {
    if (creating) return
    setShowCreate(false)
    requestAnimationFrame(() => createButtonRef.current?.focus())
  }, [creating])

  useEffect(() => {
    if (!showCreate) return
    nameInputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) {
        closeCreate()
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeCreate, creating, showCreate])

  const enterCompany = (company: WorkspaceCompany) => {
    if (enteringCompanyID !== null) return
    setEnteringCompanyID(company.id)
    setSelectedCompanyCookie(company.id)
    router.push(`/workspace/${company.slug}/website/analytics`)
  }

  const updateName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug: slugManuallyEdited ? current.slug : candidateSlug(name),
    }))
  }

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (creating) return
    setCreateError('')
    setCreating(true)
    try {
      const res = await fetch('/api/workspace/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          selectedTemplate: form.selectedTemplate ? Number(form.selectedTemplate) : undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCreateError(data?.message || '服务器暂时无法创建公司，已保留填写内容，请稍后重试。')
        return
      }
      if (!data?.company) {
        setCreateError('服务器返回内容异常，已保留填写内容，请刷新公司列表后重试。')
        return
      }
      setItems((current) => [data.company, ...current])
      setSelectedCompanyCookie(data.company.id)
      router.push(`/workspace/${data.company.slug}/website/analytics`)
    } catch {
      setCreateError('网络连接暂时不可用，已保留填写内容，请重试。')
    } finally {
      setCreating(false)
    }
  }

  return <main className="company-selection">
    <header className="company-selection__topbar">
      <Link className="company-selection__brand" href="/workspace/companies" aria-label="NovaSite 公司列表">
        <span className="company-selection__brand-mark"><Globe2 size={19} aria-hidden="true" /></span>
        <span><strong>NovaSite</strong><small>独立站管理后台</small></span>
      </Link>
      <div className="company-selection__topbar-tools">
        <span className="company-selection__secure"><Check size={15} aria-hidden="true" />仅显示你有权限管理的公司</span>
        <WorkspaceTopNavigation />
      </div>
    </header>
    <section className="company-selection__content" aria-labelledby="company-selection-title">
      <div className="company-selection__heading">
        <div>
          <p className="company-selection__eyebrow">客户工作空间</p>
          <h1 id="company-selection-title">选择要管理的公司</h1>
          <p>每家公司的网站内容和设置彼此独立。选择后直接进入对应工作台。</p>
        </div>
        {canCreateCompanies && <button className="company-selection__create-open" onClick={() => setShowCreate(true)} ref={createButtonRef} type="button">
          <Plus size={17} aria-hidden="true" />创建公司
        </button>}
      </div>

      <div className="company-selection__toolbar">
        <label className="company-selection__search" htmlFor="company-search">
          <Search size={17} aria-hidden="true" />
          <input id="company-search" onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司名称、标识或域名" type="search" value={query} />
          {query && <button aria-label="清空搜索" onClick={() => setQuery('')} type="button"><X size={15} /></button>}
        </label>
        <span className="company-selection__count">{query ? `找到 ${visibleCompanies.length} 家` : `共 ${items.length} 家公司`}</span>
      </div>

      {visibleCompanies.length > 0 ? <div className="company-selection__grid">
        {visibleCompanies.map((company) => {
          const selected = activeCompanyID === company.id
          const template = templateByID.get(company.selectedTemplateID || -1)
          const entering = enteringCompanyID === company.id
          return <article className={`company-selection__card${selected ? ' is-current' : ''}`} key={company.id}>
            <div className="company-selection__card-top">
              <span className="company-selection__avatar" aria-hidden="true">{company.name.slice(0, 1).toUpperCase()}</span>
              <span className={`company-selection__status company-selection__status--${company.status}`}>{statusLabel(company.status)}</span>
              {selected && <span className="company-selection__current"><Check size={13} aria-hidden="true" />当前公司</span>}
            </div>
            <h2 title={company.name}>{company.name}</h2>
            <p className="company-selection__slug">/{company.slug}</p>
            <div className="company-selection__details">
              <span><Globe2 size={15} aria-hidden="true" />{company.primaryDomain || '尚未绑定域名'}</span>
              <span><Building2 size={15} aria-hidden="true" />{templateLabel(template)}</span>
            </div>
            <footer>
              <span>{formatDate(company.updatedAt)}</span>
              <button className="company-selection__enter" disabled={enteringCompanyID !== null} onClick={() => enterCompany(company)} type="button">
                {entering ? '正在进入…' : '进入管理'}{!entering && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </footer>
          </article>
        })}
      </div> : <div className="company-selection__empty">
        <span><Search size={21} aria-hidden="true" /></span>
        <h2>{query ? '没有找到匹配的公司' : '还没有可管理的公司'}</h2>
        <p>{query ? '检查公司名称、站点标识或域名后重试。' : '有权限的管理员可以创建公司，之后在这里进入管理。'}</p>
        {query && <button onClick={() => setQuery('')} type="button">清空搜索</button>}
      </div>}
    </section>

    {showCreate && canCreateCompanies && <div className="company-selection__overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate() }}>
      <section className="company-selection__dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-company-title">
        <header>
          <span className="company-selection__dialog-icon"><Building2 size={20} aria-hidden="true" /></span>
          <button className="company-selection__close" onClick={closeCreate} type="button" aria-label="关闭" disabled={creating}><X size={18} /></button>
          <h2 id="create-company-title">创建客户公司</h2>
          <p>公司创建后会拥有独立的数据空间和网站预览地址。</p>
        </header>
        <form onSubmit={(event) => void createCompany(event)}>
          <label><span>公司名称 <em>*</em></span><input autoComplete="organization" autoFocus maxLength={120} onChange={(event) => updateName(event.target.value)} placeholder="例如：华南精密五金有限公司" ref={nameInputRef} required value={form.name} /></label>
          <label><span>站点标识 <em>*</em></span><input autoCapitalize="none" autoComplete="off" maxLength={56} onChange={(event) => { setSlugManuallyEdited(true); setForm({ ...form, slug: normalizeSlug(event.target.value) }) }} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="例如：huanan-fasteners" required value={form.slug} /><small>用于生成网站预览地址，只能使用小写字母、数字和中横线。</small></label>
          <label><span>默认网站模板</span><select onChange={(event) => setForm({ ...form, selectedTemplate: event.target.value })} value={form.selectedTemplate}>
            <option value="">默认 · 深蓝工业经典</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{templateLabel(template)}{template.version ? ` · ${template.version}` : ''}</option>)}
          </select><small>创建后仍可在模板库中预览和更换。</small></label>
          {createError && <p className="company-selection__error" role="alert">{createError}</p>}
          <footer><button className="company-selection__cancel" disabled={creating} onClick={closeCreate} type="button">取消</button><button className="company-selection__submit" disabled={creating || !form.name.trim() || !form.slug} type="submit">{creating ? '正在创建…' : '创建并进入'}{!creating && <ArrowRight size={16} />}</button></footer>
        </form>
      </section>
    </div>}
  </main>
}
