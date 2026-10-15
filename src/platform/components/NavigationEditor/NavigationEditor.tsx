'use client'

import { Languages, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import { useContentTranslation } from '../WorkspaceTranslations/useContentTranslation'
import { translationViewLabel } from '@/platform/product-translation/job-view'
import { isDefaultNavigation, type NavigationItem, type NavigationValue } from '@/platform/navigation-model'
import './navigation-editor.scss'

const editable = (value: NavigationValue) => JSON.stringify({ footerIntro: value.footerIntro,
  quickLinks: value.quickLinks, items: value.items.map(({ modifiedAt: _time, translationKey: _key, ...item }) => item) })
const time = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)) : '—'
const newID = () => `nav-${crypto.randomUUID()}`

type PreviousNavigation = Omit<NavigationValue, 'items'> & { items: Array<Omit<NavigationItem, 'sortOrder'> & { sortOrder?: number }> }

export function NavigationEditor({ companySlug, initial }: { companySlug: string; companyID?: number; initial: NavigationValue | PreviousNavigation[] }) {
  const { canManageSite } = useWorkspacePermissions()
  const [starting] = useState<NavigationValue>(() => {
    if (!Array.isArray(initial)) return initial
    const chinese = initial.find((item) => item.localeCode === 'zh') || { localeCode: 'zh', footerIntro: '', items: [], quickLinks: [] }
    return { ...chinese, items: chinese.items.map((item) => ({ ...item, id: item.id || newID(), sortOrder: item.sortOrder ?? 0 })) }
  })
  const [value, setValue] = useState(starting)
  const [saved, setSaved] = useState(starting)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState({ label: '', href: '', sortOrder: 0 })
  const dialog = useRef<HTMLDialogElement>(null)
  const latest = useRef(value)
  latest.current = value
  const revision = useRef(starting.updatedAt)
  const inFlight = useRef(false)
  const dirty = editable(value) !== editable(saved)
  useWorkspaceUnsaved(dirty, saving)
  const ids = saved.items.map((item) => Number(item.translationKey)).filter((id) => Number.isSafeInteger(id) && id > 0)
  const translation = useContentTranslation(companySlug, 'navigation-items', ids, editable(saved))
  const eligible = ids.filter((id) => !translation.locked(id) && translation.views[id]?.canTranslate)
  const current = value.items.find((item) => item.id === editing)

  const update = (patch: Partial<NavigationValue>) => { setError(''); setValue((old) => ({ ...old, ...patch })) }
  const updateItem = (id: string | null | undefined, patch: Partial<NavigationItem>) => {
    setError(''); setValue((old) => ({ ...old, items: old.items.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  }
  const persist = async () => {
    if (inFlight.current || !canManageSite) return
    const submitted = latest.current
    if (submitted.items.some((item) => !item.label.trim()) || submitted.quickLinks.some((item) => !item.label.trim())
      || submitted.items.some((item) => item.children.some((child) => !child.label.trim()))) { setError('栏目名称不能为空，请补充名称。'); return }
    inFlight.current = true; setSaving(true); setError('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/navigation`, { method: 'PATCH',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...submitted, localeCode: 'zh', updatedAt: revision.current }) })
      const result = await response.json().catch(() => ({})) as { message?: string; navigation?: NavigationValue }
      if (!response.ok || !result.navigation) throw new Error(result.message || '保存失败，修改已保留，请重试。')
      const next = result.navigation
      revision.current = next.updatedAt
      setSaved(next)
      setValue((old) => editable(old) === editable(submitted) ? next : { ...old, updatedAt: next.updatedAt,
        items: old.items.map((item) => { const server = next.items.find((entry) => entry.id === item.id)
          return server ? { ...item, translationKey: server.translationKey, modifiedAt: server.modifiedAt } : item }) })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，修改已保留，请重试。') }
    finally { inFlight.current = false; setSaving(false) }
  }
  useEffect(() => {
    if (!dirty || saving || error || !canManageSite) return
    const timer = setTimeout(() => void persist(), 700)
    return () => clearTimeout(timer)
    // Saves are serialized; the next draft is submitted after the current save completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, value, saving, error, canManageSite, companySlug])
  useEffect(() => {
    if (editing || adding) dialog.current?.showModal()
    else dialog.current?.close()
  }, [editing, adding])
  const close = () => { setEditing(null); setAdding(false) }
  const remove = (item: NavigationItem) => {
    if (isDefaultNavigation(item.href) || translation.locked(Number(item.translationKey))) return
    if (!window.confirm(`删除导航“${item.label}”？`)) return
    update({ items: value.items.filter((entry) => entry.id !== item.id) })
    setSelected((old) => old.filter((id) => id !== item.translationKey))
  }

  return <section className="nav-editor">
    <header className="nav-editor__heading"><h1>网站导航</h1></header>
    <div className="nav-editor__panel">
      <div className="nav-editor__toolbar">
        <span role="status">{saving ? '保存中…' : dirty ? '待保存' : ''}</span>
        <button className="nav-editor__primary" disabled={!canManageSite || dirty || saving || !translation.ready || translation.submitting || !selected.some((id) => eligible.includes(id))}
          onClick={() => { void translation.translate(selected); setSelected([]) }} type="button"><Languages size={19} />翻译</button>
        <button className="nav-editor__primary" disabled={!canManageSite || saving} onClick={() => { setNewItem({ label: '', href: '', sortOrder: 0 }); setAdding(true) }} type="button"><Plus size={19} />添加</button>
      </div>
      {(error || translation.error) && <p className="nav-editor__error" role="alert">{error || translation.error}
        {error && <button onClick={() => { setError(''); void persist() }} type="button">重新保存</button>}</p>}
      <div className="nav-editor__table-wrap"><table><thead><tr>
        <th><input type="checkbox" aria-label="选择可翻译的全部栏目" checked={eligible.length > 0 && eligible.every((id) => selected.includes(id))}
          disabled={!canManageSite || !eligible.length || dirty || saving} onChange={(event) => setSelected(event.target.checked ? eligible : [])} /></th>
        <th scope="col">排序</th><th scope="col">目录名称</th><th scope="col">类型</th><th scope="col">更新时间</th><th scope="col">翻译状态</th><th scope="col">操作</th>
      </tr></thead><tbody>{value.items.map((item) => {
        const key = Number(item.translationKey)
        const locked = translation.locked(key)
        return <tr key={item.id}><td><input type="checkbox" aria-label={`选择${item.label}`} checked={selected.includes(key)}
          disabled={!canManageSite || !eligible.includes(key) || dirty || saving} onChange={(event) => setSelected((old) => event.target.checked ? [...old, key] : old.filter((id) => id !== key))} /></td>
          <td><input className="nav-editor__inline nav-editor__order" type="number" aria-label={`${item.label}网站排序`} title="数字越大，网站导航越靠前；后台列表位置不变。" value={item.sortOrder}
            disabled={!canManageSite || locked} onChange={(event) => updateItem(item.id, { sortOrder: Number(event.target.value) || 0 })} /></td>
          <td><input className="nav-editor__inline nav-editor__name" aria-label={`${item.label}中文名称`} maxLength={80} required value={item.label}
            disabled={!canManageSite || locked} onChange={(event) => updateItem(item.id, { label: event.target.value })} /></td>
          <td>默认</td><td className="nav-editor__time">{time(item.modifiedAt || saved.updatedAt)}</td>
          <td><span className="nav-editor__status" data-state={locked ? 'running' : translation.views[key]?.status || 'pending'}><i aria-hidden="true" />{translationViewLabel(translation.views[key])}</span></td>
          <td><div className="nav-editor__actions"><button type="button" disabled={!canManageSite || locked} onClick={() => setEditing(item.id || null)}>编辑</button>
            <button type="button" disabled={!canManageSite || locked || isDefaultNavigation(item.href)} onClick={() => remove(item)}>删除</button></div></td>
        </tr>
      })}</tbody></table></div>
      <details className="nav-editor__more"><summary>更多设置</summary>
        <fieldset disabled={!canManageSite}><label>页脚简介<textarea value={value.footerIntro} onChange={(event) => update({ footerIntro: event.target.value })} /></label>
          <div className="nav-editor__more-heading"><h2>页脚快捷链接</h2><button type="button" onClick={() => update({ quickLinks: [...value.quickLinks, { id: newID(), label: '', href: '' }] })}><Plus size={16} />添加链接</button></div>
          {value.quickLinks.map((item, index) => <div className="nav-editor__link-fields" key={item.id || index}>
            <label>名称<input aria-label={`快捷链接${index + 1}名称`} value={item.label} onChange={(event) => update({ quickLinks: value.quickLinks.map((entry, at) => at === index ? { ...entry, label: event.target.value } : entry) })} /></label>
            <label>链接（选填）<input aria-label={`快捷链接${index + 1}地址`} value={item.href} onChange={(event) => update({ quickLinks: value.quickLinks.map((entry, at) => at === index ? { ...entry, href: event.target.value } : entry) })} /></label>
            <button type="button" onClick={() => update({ quickLinks: value.quickLinks.filter((_, at) => at !== index) })}>删除</button>
          </div>)}
        </fieldset>
      </details>
    </div>
    {(adding || current) && <dialog className="nav-editor__dialog" ref={dialog} onCancel={(event) => { event.preventDefault(); close() }} aria-labelledby="nav-dialog-title">
      <header><h2 id="nav-dialog-title">{adding ? '添加栏目' : '编辑栏目'}</h2><button type="button" aria-label="关闭" onClick={close}><X size={20} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (adding) update({ items: [...value.items, { ...newItem, id: newID(), children: [] }] }); close() }}>
        <fieldset disabled={!canManageSite || Boolean(current && translation.locked(Number(current.translationKey)))}>
          <label>中文名称<input autoFocus required maxLength={80} value={adding ? newItem.label : current?.label || ''}
            onChange={(event) => adding ? setNewItem({ ...newItem, label: event.target.value }) : updateItem(current?.id, { label: event.target.value })} /></label>
          <label>排序<input type="number" value={adding ? newItem.sortOrder : current?.sortOrder || 0}
            onChange={(event) => adding ? setNewItem({ ...newItem, sortOrder: Number(event.target.value) || 0 }) : updateItem(current?.id, { sortOrder: Number(event.target.value) || 0 })} /></label>
          {(adding || current && !isDefaultNavigation(current.href)) && <label>链接地址（选填）<input spellCheck={false} placeholder="/products 或 https://example.com" value={adding ? newItem.href : current?.href || ''}
            onChange={(event) => adding ? setNewItem({ ...newItem, href: event.target.value }) : updateItem(current?.id, { href: event.target.value })} /></label>}
          {current && <details><summary>二级栏目</summary>
            {current.children.map((child, index) => <div className="nav-editor__link-fields" key={child.id || index}>
              <label>中文名称<input value={child.label} onChange={(event) => updateItem(current.id, { children: current.children.map((entry, at) => at === index ? { ...entry, label: event.target.value } : entry) })} /></label>
              <label>链接（选填）<input value={child.href} onChange={(event) => updateItem(current.id, { children: current.children.map((entry, at) => at === index ? { ...entry, href: event.target.value } : entry) })} /></label>
              <button type="button" onClick={() => updateItem(current.id, { children: current.children.filter((_, at) => at !== index) })}>删除</button>
            </div>)}
            <button type="button" onClick={() => updateItem(current.id, { children: [...current.children, { id: newID(), label: '', href: '' }] })}><Plus size={16} />添加二级栏目</button>
          </details>}
        </fieldset><footer><button className="nav-editor__primary" type="submit">{adding ? '添加' : '关闭'}</button></footer>
      </form>
    </dialog>}
  </section>
}
