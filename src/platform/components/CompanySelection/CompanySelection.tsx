'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { WorkspaceCompany } from '@/platform/workspace'

import './company-selection.scss'

type TemplateOption = { id: number; key: string; name: string; version?: string }
type Props = { companies: WorkspaceCompany[]; initialCompanyID?: number; templates?: TemplateOption[] }
type CreateForm = { name: string; slug: string; selectedTemplate: string }

const statusLabel = (status: WorkspaceCompany['status']) => {
  if (status === 'published') return '已发布'
  if (status === 'suspended') return '已暂停'
  return '搭建中'
}

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))

const setSelectedCompanyCookie = (companyID: number) => {
  document.cookie = `payload-tenant=${encodeURIComponent(String(companyID))}; Max-Age=31536000; Path=/; SameSite=Lax`
}

const templateLabel = (template: TemplateOption) => {
  if (template.key === 'power-engineering-v1') return `工业深色模板（${template.version || '1.0.0'}）`
  if (template.key === 'precision-light-v1') return `明亮技术模板（${template.version || '1.0.0'}）`
  return `${template.name}${template.version ? `（${template.version}）` : ''}`
}

const normalizeSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 56)

const fallbackSlug = () => `company-${Date.now().toString(36)}`

export function CompanySelection({ companies, initialCompanyID, templates = [] }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedCompanyID, setSelectedCompanyID] = useState(initialCompanyID)
  const [items, setItems] = useState(companies)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState<CreateForm>({ name: '', slug: '', selectedTemplate: templates[0]?.id ? String(templates[0].id) : '' })
  const visibleCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalizedQuery) return items
    return items.filter((company) => `${company.name} ${company.slug} ${company.primaryDomain || ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  }, [items, query])

  const chooseCompany = (companyID: number) => {
    setSelectedCompanyCookie(companyID)
    setSelectedCompanyID(companyID)
  }

  const updateName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug: current.slug || normalizeSlug(name) || fallbackSlug(),
    }))
  }

  const createCompany = async () => {
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
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.message || '创建失败，请检查后重试。')
        return
      }
      setItems((current) => [data.company, ...current])
      setSelectedCompanyCookie(data.company.id)
      setSelectedCompanyID(data.company.id)
      router.push(`/workspace/${data.company.slug}/website/analytics`)
    } catch {
      setCreateError('网络错误，创建失败。')
    } finally {
      setCreating(false)
    }
  }

  return <main className="company-selection"><section className="company-selection__panel" aria-labelledby="company-selection-title">
    <div className="company-selection__heading"><div><p className="company-selection__eyebrow">独立站管理</p><h1 id="company-selection-title">选择公司</h1><p>请选择本次需要管理的客户公司。各公司的产品、内容、询盘和网站设置彼此独立。</p></div><div className="company-selection__heading-actions"><button className="company-selection__create-open" onClick={() => setShowCreate(true)} type="button">＋ 创建公司</button><div className="company-selection__step" aria-label="当前步骤">1 / 2　选择公司</div></div></div>
    <label className="company-selection__search" htmlFor="company-search"><span>搜索公司</span><input id="company-search" onChange={(event) => setQuery(event.target.value)} placeholder="请输入公司名称或站点标识" type="search" value={query} /></label>
    {visibleCompanies.length > 0 ? <div className="company-selection__table-wrap"><table><thead><tr><th>公司名称</th><th>站点标识</th><th>网站状态</th><th>主域名</th><th>最近更新</th><th aria-label="操作">操作</th></tr></thead><tbody>{visibleCompanies.map((company) => {
      const selected = selectedCompanyID === company.id
      return <tr className={selected ? 'company-selection__row--selected' : undefined} key={company.id}><td><strong>{company.name}</strong>{selected && <span className="company-selection__selected">当前已选</span>}</td><td>{company.slug}</td><td><span className={`company-selection__status company-selection__status--${company.status}`}>{statusLabel(company.status)}</span></td><td>{company.primaryDomain || '暂未绑定'}</td><td>{formatDate(company.updatedAt)}</td><td><div className="company-selection__actions">{selected ? <Link className="company-selection__enter" href={`/workspace/${company.slug}/website/analytics`}>进入工作台</Link> : <button className="company-selection__button" onClick={() => chooseCompany(company.id)} type="button">选择公司</button>}</div></td></tr>
    })}</tbody></table></div> : <div className="company-selection__empty"><h2>未找到匹配的公司</h2><p>请调整搜索内容后重试。</p></div>}
    <p className="company-selection__notice">选择会保存为当前工作公司。下一步将进入该公司的专属工作台。</p>
    {showCreate && <div className="company-selection__modal" role="dialog" aria-modal="true" aria-labelledby="create-company-title">
      <div className="company-selection__modal-card">
        <button className="company-selection__modal-close" onClick={() => setShowCreate(false)} type="button" aria-label="关闭">×</button>
        <h2 id="create-company-title">创建客户公司</h2>
        <p>新公司会自动拥有独立的数据空间，并生成本地预览地址。不会影响已有客户站点。</p>
        <label><span>公司名称</span><input autoFocus onChange={(event) => updateName(event.target.value)} placeholder="例如：华南精密五金有限公司" value={form.name} /></label>
        <label><span>站点标识</span><input onChange={(event) => setForm({ ...form, slug: normalizeSlug(event.target.value) })} placeholder="例如：huanan-fasteners" value={form.slug} /><small>只能使用小写字母、数字和中横线，用于生成 /s/站点标识/zh 预览地址。</small></label>
        <label><span>默认模板</span><select onChange={(event) => setForm({ ...form, selectedTemplate: event.target.value })} value={form.selectedTemplate}><option value="">默认工业模板</option>{templates.map((template) => <option key={template.id} value={template.id}>{templateLabel(template)}</option>)}</select></label>
        {createError && <p className="company-selection__error">{createError}</p>}
        <div className="company-selection__modal-actions"><button className="company-selection__enter" onClick={() => setShowCreate(false)} type="button">取消</button><button className="company-selection__button" disabled={creating} onClick={() => void createCompany()} type="button">{creating ? '创建中…' : '创建并进入工作台'}</button></div>
      </div>
    </div>}
  </section></main>
}
