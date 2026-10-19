'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { GeoKeyword } from '@/platform/geo/keywords'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import {
  allowWorkspaceNavigation,
  useWorkspaceUnsaved,
} from '../WorkspaceEditor/useWorkspaceUnsaved'
import './geo-workspace.scss'

type KeywordConfig = {
  id: string
  tenantID: number
  brand: string
  aliases: string
  core: string
  terms: string
  website: string
  blog: string
  termLinks: { term: string; website: string; blog: string }[]
  updated: string
  version?: number
}
const cabinetTerms = [
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
]
const termsOf = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
const isWebUrl = (value: string) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}
const alignTermLinks = (
  terms: string[],
  current: KeywordConfig['termLinks'] = [],
): KeywordConfig['termLinks'] =>
  terms.map((term) => {
    const old = current.find((item) => item.term === term)
    return { term, website: old?.website || '', blog: old?.blog || '' }
  })
const initialWebsite = (domain?: string | null) => {
  if (!domain) return ''
  const value = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  return isWebUrl(value) ? value : ''
}
function ConfigField({
  label,
  name,
  children,
  required = false,
}: {
  label: string
  name?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <div className="geo-workspace__field">
      <label htmlFor={name}>
        {required && <span aria-hidden="true">*</span>}
        {label}
      </label>
      <div>{children}</div>
    </div>
  )
}

const configFrom = (item: GeoKeyword): KeywordConfig => ({
  ...item,
  aliases: item.aliases.join(' / '),
  terms: item.terms.join('\n'),
  termLinks: alignTermLinks(item.terms, item.termLinks || []),
  updated: new Date(item.updatedAt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  }),
})
export function GeoKeywords({
  company,
  recordId,
}: {
  company: WorkspaceCompany
  recordId?: string
}) {
  const router = useRouter()
  const base = `/workspace/${encodeURIComponent(company.slug)}/geo/keywords`
  const endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo/keywords`
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [conflict, setConflict] = useState(false)
  const saveAbort = useRef<AbortController | null>(null)
  const active = useRef(true)
  const [configs, setConfigs] = useState<KeywordConfig[]>([])
  const [adding, setAdding] = useState(false)
  const [brand, setBrand] = useState('')
  const [core, setCore] = useState('')
  const [draft, setDraft] = useState<KeywordConfig | null>(null)
  const [baseline, setBaseline] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const draftID = draft?.id
  const changed = !!draft && JSON.stringify(draft) !== baseline
  useWorkspaceUnsaved(
    changed || (!!draft && !draft.version) || (adding && !!(brand || core)),
    saving,
  )
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      saveAbort.current?.abort()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const url = recordId ? `${endpoint}/${recordId}` : `${endpoint}?page=${page}`
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        const result = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(result.message || 'GEO配置读取失败。')
        if (recordId) {
          const next = configFrom(result.item)
          setDraft(next)
          setBaseline(JSON.stringify(next))
          setConflict(false)
        } else {
          setConfigs(result.items.map(configFrom))
          setTotal(result.total)
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'GEO配置读取失败，请稍后重试。')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    const timer = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [company.id, endpoint, page, recordId, reload])

  useEffect(() => {
    if (adding) dialog.current?.showModal()
  }, [adding])
  useEffect(() => {
    if (draftID) formHeading.current?.focus()
  }, [draftID])
  const patch = (value: Partial<KeywordConfig>) => {
    setDraft((old) => old && { ...old, ...value })
    setError('')
    setNotice('')
  }
  const patchTerms = (value: string) => {
    const nextTerms = termsOf(value)
    patch({
      terms: value,
      termLinks: (draft?.termLinks || []).filter((link) => nextTerms.includes(link.term)),
    })
  }
  const closeAdd = () => {
    setAdding(false)
    setError('')
    addButton.current?.focus()
  }
  const startAdd = () => {
    setBrand('')
    setCore('')
    setError('')
    setNotice('')
    setAdding(true)
  }
  const addConfig = (event: FormEvent) => {
    event.preventDefault()
    if (!brand.trim() || !core.trim()) {
      setError('请填写品牌词和一个核心词。')
      return
    }
    const next: KeywordConfig = {
      id: crypto.randomUUID(),
      tenantID: company.id,
      brand: brand.trim(),
      core: core.trim(),
      aliases: '',
      terms: core.trim() === '配电柜' ? cabinetTerms.join('\n') : '',
      website: initialWebsite(company.primaryDomain),
      blog: '',
      termLinks: [],
      updated: '',
    }
    setDraft(next)
    setBaseline(JSON.stringify(next))
    setAdding(false)
    setError('')
  }
  const cancelEdit = () => {
    setDraft(null)
    setError('')
    setNotice('')
    setConflict(false)
    if (recordId) {
      allowWorkspaceNavigation()
      router.push(base)
    }
  }
  const saveDraft = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || draft.tenantID !== company.id || saving) return
    const terms = termsOf(draft.terms)
    if (!draft.brand.trim() || !draft.core.trim()) {
      setError('请填写品牌词和一个核心词。')
      return
    }
    if (terms.length !== 10 || new Set(terms).size !== 10) {
      setError('请填写10个不重复的细分词，每行一个。')
      return
    }
    if (terms.includes(draft.core.trim())) {
      setError('细分词不能与核心词相同。')
      return
    }
    if (!isWebUrl(draft.website.trim())) {
      setError('请填写有效的官网网址。')
      return
    }
    if (draft.blog.trim() && !isWebUrl(draft.blog.trim())) {
      setError('请填写有效的Blog链接。')
      return
    }
    const controller = new AbortController()
    saveAbort.current = controller
    setSaving(true)
    setError('')
    setNotice('')
    setConflict(false)
    try {
      const response = await fetch(draft.version ? `${endpoint}/${draft.id}` : endpoint, {
        method: draft.version ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          brand: draft.brand,
          aliases: draft.aliases,
          core: draft.core,
          terms,
          website: draft.website,
          blog: draft.blog,
          termLinks: draft.termLinks,
          ...(draft.version ? { version: draft.version } : { requestId: draft.id }),
        }),
      })
      const result = await response.json()
      if (!active.current || controller.signal.aborted) return
      if (!response.ok) {
        setConflict(result.code === 'VERSION_CONFLICT')
        throw new Error(result.message || '配置保存失败，当前输入已保留。')
      }
      const next = configFrom(result.item)
      if (recordId) {
        setDraft(next)
        setBaseline(JSON.stringify(next))
      } else {
        setDraft(null)
        setPage(1)
        setReload((n) => n + 1)
      }
      setNotice('GEO优化词已保存。')
    } catch (cause) {
      if (active.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '配置保存失败，当前输入已保留。')
    } finally {
      if (active.current) setSaving(false)
    }
  }
  const visible = configs.filter((item) => item.tenantID === company.id)

  return (
    <section className="geo-workspace" aria-label="当前客户GEO优化词">
      <header className="geo-workspace__heading">
        <div>
          {(draft || recordId) && (
            <button
              type="button"
              className="geo-workspace__back"
              aria-label="返回优化词"
              onClick={cancelEdit}
              disabled={saving}
            >
              ‹
            </button>
          )}
          <h1 ref={formHeading} tabIndex={-1}>
            {draft || recordId ? 'GEO优化词配置' : 'GEO优化词'}
          </h1>
        </div>
        {!draft && !recordId && (
          <button
            className="geo-workspace__button is-primary"
            onClick={startAdd}
            ref={addButton}
            type="button"
          >
            添加
          </button>
        )}
      </header>

      {notice && (
        <p className="geo-workspace__notice" role="status">
          {notice}
        </p>
      )}
      {error && !adding && (
        <div className="geo-workspace__error" role="alert">
          {error}
          {conflict && (
            <button
              type="button"
              className="geo-workspace__link"
              onClick={() => {
                  setReload((n) => n + 1)
              }}
            >
              读取最新版本
            </button>
          )}
          {!draft && (
            <button
              type="button"
              className="geo-workspace__link"
              onClick={() => setReload((n) => n + 1)}
            >
              重新读取
            </button>
          )}
        </div>
      )}
      {loading && (
        <p className="geo-workspace__hint" role="status">
          正在读取GEO配置…
        </p>
      )}
      {recordId && !draft ? null : !draft ? (
        <div className="geo-workspace__panel geo-keywords__list">
          {visible.map((config) => (
            <article className="geo-keywords__card" key={config.id}>
              <header>
                <div className="geo-keywords__status">
                  <span aria-hidden="true" />
                  已配置
                </div>
              </header>
              <dl>
                <div>
                  <dt>品牌词</dt>
                  <dd>{config.brand}</dd>
                </div>
                <div>
                  <dt>核心词</dt>
                  <dd>{config.core}</dd>
                </div>
                <div>
                  <dt>细分词</dt>
                  <dd title={termsOf(config.terms).join(' / ')}>
                    {termsOf(config.terms).join(' / ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>网址链接</dt>
                  <dd>
                    <a href={config.website} target="_blank" rel="noopener noreferrer">
                      {config.website}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Blog链接</dt>
                  <dd>
                    {config.blog ? (
                      <a href={config.blog} target="_blank" rel="noopener noreferrer">
                        {config.blog}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              <footer>
                <span>更新时间　{config.updated || '—'}</span>
                <Link
                  className="geo-workspace__button geo-keywords__view"
                  href={`${base}/${config.id}`}
                >
                  查看
                </Link>
              </footer>
            </article>
          ))}
          {!visible.length && !loading && !error && (
            <div className="geo-workspace__empty">
              <strong>当前客户尚未配置GEO优化词</strong>
              <p>添加品牌词与核心词，建立该客户的优化词配置。</p>
              <button type="button" className="geo-workspace__button is-primary" onClick={startAdd}>
                添加
              </button>
            </div>
          )}
          {total > 20 && (
            <div className="geo-workspace__pager">
              <span>
                共 {total} 条，第 {page} / {Math.max(1, Math.ceil(total / 20))} 页
              </span>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={loading || page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                上一页
              </button>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={loading || page * 20 >= total}
                onClick={() => setPage((n) => n + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      ) : (
        <form
          className="geo-workspace__panel geo-workspace__form"
          onSubmit={(event) => void saveDraft(event)}
        >
          <fieldset disabled={saving}>
            <ConfigField label="品牌词" name="geo-brand" required>
              <input
                id="geo-brand"
                required
                maxLength={50}
                value={draft.brand}
                disabled={!!draft.version}
                onChange={(event) => patch({ brand: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="比对标识" name="geo-aliases">
              <input
                id="geo-aliases"
                value={draft.aliases}
                placeholder="公司全称 / 英文名 / 其他品牌写法"
                aria-describedby="geo-aliases-hint"
                disabled={!!draft.version}
                onChange={(event) => patch({ aliases: event.target.value })}
              />
              <p className="geo-keywords__alias-warning" id="geo-aliases-hint">
                当前填写的对比标识会用于将来查询推荐结果时匹配公司名称使用，请谨慎填写。
              </p>
            </ConfigField>
            <ConfigField label="核心词" name="geo-core" required>
              <input
                id="geo-core"
                required
                maxLength={50}
                value={draft.core}
                disabled={!!draft.version}
                onChange={(event) => patch({ core: event.target.value })}
              />
            </ConfigField>
            <ConfigField label="细分词" name="geo-terms" required>
              <div className="geo-workspace__terms">
                <header>
                  <strong>细分词（{termsOf(draft.terms).length} / 10）</strong>
                  <button
                    type="button"
                    className="geo-workspace__link"
                    disabled={!!draft.version}
                    onClick={() => patch({ terms: '' })}
                  >
                    清空
                  </button>
                </header>
                <textarea
                  id="geo-terms"
                  required
                  rows={10}
                  value={draft.terms}
                  placeholder="每行一个细分词，共10个"
                  disabled={!!draft.version}
                  onChange={(event) => patchTerms(event.target.value)}
                />
              </div>
            </ConfigField>
            <ConfigField label="网址链接" name="geo-website" required>
              <input
                id="geo-website"
                required
                type="url"
                value={draft.website}
                placeholder="https://www.company.com/"
                onChange={(event) =>
                  patch({
                    website: event.target.value,
                    ...(event.target.value !== draft.website ? { termLinks: [] } : {}),
                  })
                }
              />
            </ConfigField>
            <ConfigField label="Blog链接" name="geo-blog">
              <input
                id="geo-blog"
                type="url"
                value={draft.blog}
                placeholder="https://blog.company.com/"
                onChange={(event) =>
                  patch({
                    blog: event.target.value,
                    ...(event.target.value !== draft.blog ? { termLinks: [] } : {}),
                  })
                }
              />
            </ConfigField>
            <footer>
              {draft.version && <span className="geo-workspace__hint">版本 {draft.version}</span>}
              <button className="geo-workspace__button" onClick={cancelEdit} type="button">
                取消
              </button>
              <button className="geo-workspace__button is-primary" type="submit">
                {saving ? '保存中…' : '保存配置'}
              </button>
            </footer>
          </fieldset>
        </form>
      )}
      {adding && (
        <dialog
          ref={dialog}
          className="geo-workspace__dialog"
          aria-labelledby="geo-add-heading"
          onCancel={(event) => {
            event.preventDefault()
            closeAdd()
          }}
        >
          <header>
            <h2 id="geo-add-heading">添加GEO优化词</h2>
            <button type="button" onClick={closeAdd} aria-label="关闭添加弹窗">
              ×
            </button>
          </header>
          <form onSubmit={addConfig}>
            <label htmlFor="geo-add-brand">品牌词</label>
            <div className="geo-workspace__counter">
              <input
                id="geo-add-brand"
                required
                autoFocus
                maxLength={50}
                value={brand}
                placeholder="请填写公司简称"
                onChange={(event) => setBrand(event.target.value)}
              />
              <span>{brand.length} / 50</span>
            </div>
            <label htmlFor="geo-add-core">核心词</label>
            <div className="geo-workspace__counter">
              <input
                id="geo-add-core"
                required
                maxLength={50}
                value={core}
                placeholder="请输入一个核心词"
                onChange={(event) => setCore(event.target.value)}
              />
              <span>{core.length} / 50</span>
            </div>
            {error && (
              <p className="geo-workspace__error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button className="geo-workspace__button" onClick={closeAdd} type="button">
                取消
              </button>
              <button className="geo-workspace__button is-primary" type="submit">
                确定
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  )
}
