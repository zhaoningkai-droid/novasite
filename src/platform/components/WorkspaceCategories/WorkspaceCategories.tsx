'use client'

import { FolderTree, Languages, Plus, Search, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './workspace-categories.scss'

export type CategoryKind = 'cases' | 'news' | 'posts' | 'products'
export type WorkspaceCategory = { childCount: number; contentCount: number; id: number; level: number; name: string; parentID: number | null; slug: string; sortOrder: number; translationComplete: boolean; updatedAt: string }
type Props = { categories: Record<CategoryKind, WorkspaceCategory[]>; companyName: string; endpoint: string }
const definitions = {
  products: { empty: '还没有产品分类。', label: '产品分类', plural: '产品数量' },
  news: { empty: '还没有文章分类。', label: '文章分类', plural: '文章数量' },
  cases: { empty: '还没有案例分类。', label: '案例分类', plural: '案例数量' },
  posts: { empty: '还没有博客分类。', label: '博客分类', plural: '博客数量' },
}
const tabs: CategoryKind[] = ['products', 'news', 'cases', 'posts']
const locales = [{ code: 'zh', label: '简体中文' }, { code: 'en', label: '英语' }, { code: 'ru', label: '俄语' }, { code: 'id', label: '印尼语' }] as const
const blank = { id: 0, name: '', parentID: null as number | null, slug: '', sortOrder: 0 }
function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}
const recountChildren = (rows: WorkspaceCategory[]) => rows.map((row) => ({
  ...row, childCount: rows.filter((child) => child.parentID === row.id).length,
})).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))

export function WorkspaceCategories({ categories, companyName, endpoint }: Props) {
  const { canEditContent, canManageSite } = useWorkspacePermissions()
  const [data, setData] = useState(categories)
  const [kind, setKind] = useState<CategoryKind>('products')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<typeof blank | null>(null)
  const [editBaseline, setEditBaseline] = useState<typeof blank | null>(null)
  const [translating, setTranslating] = useState<WorkspaceCategory | null>(null)
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translationBaseline, setTranslationBaseline] = useState<Record<string, string>>({})
  const [loadingTranslations, setLoadingTranslations] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const translationRequest = useRef<AbortController | null>(null)
  const busy = saving || removing !== null
  const dirty = Boolean(editing && JSON.stringify(editing) !== JSON.stringify(editBaseline))
    || Boolean(translating && JSON.stringify(translations) !== JSON.stringify(translationBaseline))
  useWorkspaceUnsaved(dirty, busy)
  useEffect(() => { if ((editing || translating) && !dialog.current?.open) dialog.current?.showModal() }, [editing, translating])
  useEffect(() => () => translationRequest.current?.abort(), [])
  const allRows = data[kind]
  const rows = useMemo(() => allRows.filter((row) => !query.trim()
    || `${row.name} ${row.slug}`.toLowerCase().includes(query.trim().toLowerCase())), [allRows, query])
  const parents = allRows.filter((item) => item.level === 1 && item.id !== editing?.id)
  const hasChildren = Boolean(editing?.id && allRows.find((item) => item.id === editing.id)?.childCount)
  const definition = definitions[kind]
  const notify = (message: string, failed = false) => { setFeedback(message); setError(failed) }
  const close = () => {
    if (busy) return
    if (dirty && !window.confirm('放弃分类的未保存修改？')) return
    setEditing(null); setTranslating(null); setFeedback('')
  }
  const open = (draft: typeof blank) => { setEditBaseline({ ...draft }); setEditing({ ...draft }); setFeedback('') }
  const request = async (url: string, method: 'DELETE' | 'PATCH' | 'POST', body?: unknown) => {
    const response = await fetch(url, { body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined, method })
    const result = await response.json().catch(() => ({})) as { category?: WorkspaceCategory; message?: string }
    if (!response.ok) throw new Error(result.message || '操作未完成，请重试。')
    return result
  }
  const updateRow = (row: WorkspaceCategory, type = kind) => setData((current) => ({
    ...current, [type]: recountChildren(current[type].some((item) => item.id === row.id)
      ? current[type].map((item) => item.id === row.id ? row : item) : [...current[type], row]),
  }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || busy || !canEditContent) return
    if (!editing.name.trim() || !editing.slug.trim()) { notify('请填写分类名称和地址标识。', true); return }
    setSaving(true); setFeedback('')
    try {
      const result = await request(editing.id ? `${endpoint}/${kind}/${editing.id}` : `${endpoint}/${kind}`,
        editing.id ? 'PATCH' : 'POST', { ...editing, sortOrder: Number(editing.sortOrder) || 0 })
      if (!result.category) throw new Error('保存后未收到分类数据，请刷新后查看。')
      updateRow(result.category); setEditing(null); notify(result.message || '分类已保存。')
    } catch (reason) { notify(reason instanceof Error ? reason.message : '分类未保存，修改已保留。', true) }
    finally { setSaving(false) }
  }
  const remove = async (row: WorkspaceCategory) => {
    if (busy || !canManageSite || !window.confirm(`删除“${row.name}”？有关联内容或二级分类时会被拦截，不会连带删除内容。`)) return
    setRemoving(row.id); setFeedback('')
    try {
      const result = await request(`${endpoint}/${kind}/${row.id}`, 'DELETE')
      setData((current) => ({ ...current, [kind]: recountChildren(current[kind].filter((item) => item.id !== row.id)) }))
      notify(result.message || '分类已删除。')
    } catch (reason) { notify(reason instanceof Error ? reason.message : '分类没有删除，请重试。', true) }
    finally { setRemoving(null) }
  }
  const openTranslations = async (row: WorkspaceCategory) => {
    if (busy || loadingTranslations) return
    translationRequest.current?.abort()
    const controller = new AbortController()
    translationRequest.current = controller
    setLoadingTranslations(true); setFeedback('')
    try {
      const response = await fetch(`${endpoint}/${kind}/${row.id}`, { signal: controller.signal })
      const result = await response.json() as { translations?: Record<string, string>; message?: string }
      if (!response.ok) throw new Error(result.message || '无法读取四语内容。')
      if (controller.signal.aborted) return
      setTranslations(result.translations || {}); setTranslationBaseline(result.translations || {})
      setTranslating(row)
    } catch (reason) {
      if (!controller.signal.aborted) notify(reason instanceof Error ? reason.message : '无法读取四语内容。', true)
    } finally { if (!controller.signal.aborted) setLoadingTranslations(false) }
  }
  const saveTranslations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!translating || busy || !canEditContent) return
    const changed = locales.filter((locale) => (translations[locale.code] || '') !== (translationBaseline[locale.code] || ''))
    if (changed.some((locale) => !translations[locale.code]?.trim())) {
      notify('已维护的语言名称不能清空；暂未维护的语言可以保持空白。', true); return
    }
    if (!changed.length) { setTranslating(null); notify('分类名称没有修改。'); return }
    setSaving(true); setFeedback('')
    const completed: string[] = []
    try {
      for (const locale of changed) {
        const result = await request(`${endpoint}/${kind}/${translating.id}`, 'PATCH', {
          locale: locale.code, name: translations[locale.code],
        })
        if (result.category) updateRow(result.category)
        completed.push(locale.label)
        setTranslationBaseline((current) => ({ ...current, [locale.code]: translations[locale.code] }))
      }
      setTranslating(null); notify(`已保存：${completed.join('、')}。其他语言没有覆盖。`)
    } catch (reason) {
      notify(`${completed.length ? `${completed.join('、')}已保存；` : ''}${reason instanceof Error ? reason.message : '保存未完成。'}未完成的修改已保留。`, true)
    } finally { setSaving(false) }
  }
  const feedbackNode = feedback && <p className={error ? 'workspace-categories__feedback is-error' : 'workspace-categories__feedback'}
    role={error ? 'alert' : 'status'}>{feedback}</p>
  return <section className="workspace-categories" aria-label="分类管理">
    <header><div><p>网站配置 / 分类管理</p><h1>分类管理</h1>
      <span>为 {companyName} 整理内容分类；支持两级，分类删除不会连带删除内容。</span></div>
      <button className="workspace-categories__primary" disabled={busy || loadingTranslations || !canEditContent}
        onClick={() => open({ ...blank })} type="button"><Plus size={17} />新增分类</button></header>
    <nav aria-label="分类类型">{tabs.map((item) => <button aria-pressed={kind === item}
      className={kind === item ? 'workspace-categories__tab is-active' : 'workspace-categories__tab'}
      disabled={busy} key={item} onClick={() => {
        translationRequest.current?.abort(); setLoadingTranslations(false); setKind(item); setQuery(''); setFeedback('')
      }} type="button">{definitions[item].label}<small>{data[item].length}</small></button>)}</nav>
    {!editing && !translating && feedbackNode}
    <section className="workspace-categories__panel"><div className="workspace-categories__toolbar">
      <label><Search size={17} aria-hidden="true" /><input aria-label="搜索分类" onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索分类名称或地址标识" type="search" value={query} /></label>
      <span>共 {allRows.length} 个分类 · 当前 {rows.length} 个</span></div>
      <div className="workspace-categories__table-wrap">{rows.length ? <table><thead><tr>
        <th scope="col">分类名称</th><th scope="col">级别</th><th scope="col">{definition.plural}</th>
        <th scope="col">排序</th><th scope="col">更新时间</th><th scope="col">语言维护</th><th scope="col">操作</th>
      </tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong className={row.level === 2 ? 'is-child' : ''}>
        {row.level === 2 && <FolderTree size={14} />}{row.name}</strong><small>{row.slug}</small></td>
        <td>{row.level === 2 ? '二级' : '一级'}</td><td>{row.contentCount}</td><td>{row.sortOrder}</td><td>{formatTime(row.updatedAt)}</td>
        <td><span className={row.translationComplete ? 'workspace-categories__state is-complete' : 'workspace-categories__state'}>
          {row.translationComplete ? '四语完整' : '待补全'}</span></td><td><div className="workspace-categories__actions">
          {row.level === 1 && <button disabled={busy || loadingTranslations || !canEditContent} onClick={() => open({ ...blank, parentID: row.id })}
            type="button">添加二级</button>}<button disabled={busy || loadingTranslations || !canEditContent} onClick={() => void openTranslations(row)}
              type="button"><Languages size={13} />语言</button><button disabled={busy || loadingTranslations || !canEditContent}
                onClick={() => open({ id: row.id, name: row.name, parentID: row.parentID, slug: row.slug, sortOrder: row.sortOrder })}
                type="button">编辑</button><button className="is-danger" disabled={busy || loadingTranslations || !canManageSite}
                  onClick={() => void remove(row)} type="button">{removing === row.id ? '删除中…' : '删除'}</button>
        </div></td></tr>)}</tbody></table> : <div className="workspace-categories__empty"><FolderTree size={32} />
          <h2>{query ? '没有找到匹配分类' : '还没有分类'}</h2><p>{query ? '换个关键词试试。' : definition.empty}</p></div>}</div>
    </section>
    {(editing || translating) && <dialog aria-labelledby="category-dialog-title" className="workspace-categories__dialog"
      ref={dialog} onCancel={(event) => { event.preventDefault(); close() }}>
      <form onSubmit={(event) => void (editing ? submit(event) : saveTranslations(event))}>
        <header><h2 id="category-dialog-title">{editing ? editing.id ? '编辑分类' : editing.parentID ? '新增二级分类' : '新增分类' : '维护分类语言'}</h2>
          <button aria-label="关闭编辑" disabled={busy} onClick={close} type="button"><X size={20} /></button></header>
        <fieldset disabled={busy}>{editing ? <>
          <label>分类名称 <b>*</b><input autoFocus maxLength={80} required value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
          <label>分类地址标识 <b>*</b><input maxLength={100} required spellCheck={false} value={editing.slug}
            onChange={(event) => setEditing({ ...editing, slug: event.target.value })} placeholder="例如 fastener-guides" />
            <small>用于网站链接，建议使用英文、数字与连字符</small></label>
          <label>上级分类<select disabled={hasChildren} value={editing.parentID || ''}
            onChange={(event) => setEditing({ ...editing, parentID: event.target.value ? Number(event.target.value) : null })}>
            <option value="">无上级（一级分类）</option>{parents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            {hasChildren && <small>此分类包含二级分类，不能移动到其他分类下。</small>}</label>
          <label>显示排序<input min="0" type="number" value={editing.sortOrder}
            onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) || 0 })} /></label>
        </> : <><p className="workspace-categories__language-hint">编辑当前分类的名称。只保存有修改的语言，不会自动翻译。</p>
          {locales.map((locale, index) => <label key={locale.code}>{locale.label}{locale.code === 'zh' && <b>*</b>}
            <input aria-label={`${locale.label}分类名称`} autoFocus={index === 0} maxLength={80}
              onChange={(event) => setTranslations((current) => ({ ...current, [locale.code]: event.target.value }))}
              required={locale.code === 'zh'} value={translations[locale.code] || ''} /></label>)}</>}{feedbackNode}</fieldset>
        <footer><button disabled={busy} onClick={close} type="button">取消</button>
          <button className="workspace-categories__primary" disabled={busy} type="submit">{saving ? '保存中…' : '保存'}</button></footer>
      </form>
    </dialog>}
  </section>
}
