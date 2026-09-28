'use client'

import { CircleHelp, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './faq-manager.scss'

type Item = { answer: string; enabled: boolean; id: number; question: string; sortOrder: number }
type Draft = Omit<Item, 'id'> & { id?: number }
const blank = (sortOrder: number): Draft => ({ answer: '', enabled: true, question: '', sortOrder })

export function FAQManager({ companySlug, initial }: { companySlug: string; initial: Item[] }) {
  const { canEditContent, canManageSite } = useWorkspacePermissions()
  const [items, setItems] = useState(initial)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const dirty = Boolean(editing && JSON.stringify(editing) !== JSON.stringify(baseline))
  const busy = saving || removing !== null
  useWorkspaceUnsaved(dirty, busy)
  useEffect(() => { if (editing && !dialog.current?.open) dialog.current?.showModal() }, [editing])
  const rows = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .filter((item) => (!query.trim() || `${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()))
      && (filter === 'all' || item.enabled === (filter === 'enabled'))), [items, query, filter])
  const open = (draft: Draft) => { setEditing({ ...draft }); setBaseline({ ...draft }); setStatus('') }
  const close = () => {
    if (busy) return
    if (dirty && !window.confirm('放弃这条问题的未保存修改？')) return
    setEditing(null); setBaseline(null)
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || busy || !canEditContent) return
    if (!editing.question.trim() || !editing.answer.trim()) {
      setError(true); setStatus('请填写问题和答案。'); return
    }
    setSaving(true); setStatus(''); setError(false)
    const submitted = { ...editing, question: editing.question.trim(), answer: editing.answer.trim() }
    try {
      const response = await fetch(`/api/workspace/${companySlug}/faqs`, {
        method: submitted.id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitted),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || '常见问题没有保存，请重试。')
      const id = submitted.id || data.item?.id
      if (!id) throw new Error('服务器没有返回新问题，请刷新后查看。')
      setItems((current) => submitted.id ? current.map((item) =>
        item.id === submitted.id ? { ...submitted, id } : item) : [...current, { ...submitted, id }])
      setEditing(null); setBaseline(null); setStatus(data.message || '常见问题已保存。')
    } catch (reason) {
      setError(true)
      setStatus(reason instanceof Error ? reason.message : '网络连接失败，修改已保留在编辑窗口中。')
    } finally { setSaving(false) }
  }
  const remove = async (item: Item) => {
    if (busy || !canManageSite || !window.confirm(`删除“${item.question}”？这条问题会从客户网站移除。`)) return
    setRemoving(item.id); setStatus(''); setError(false)
    try {
      const response = await fetch(`/api/workspace/${companySlug}/faqs?id=${item.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || '删除未完成，请重试。')
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      setStatus(data.message || '问题已删除。')
    } catch (reason) {
      setError(true); setStatus(reason instanceof Error ? reason.message : '网络连接失败，问题没有删除。')
    } finally { setRemoving(null) }
  }
  return <section className="workspace-fixed-editor faq-manager">
    <header><div><p>网站配置 / 常见问题</p><h1>常见问题</h1>
      <span>统一维护问题与答案，保存后同步客户网站的常见问题区域。</span></div>
      <button disabled={busy || !canEditContent} onClick={() => open(blank(Math.max(0, ...items.map((item) => item.sortOrder)) + 1))}
        type="button"><Plus size={17} />添加问题</button></header>
    {status && !editing && <p className={error ? 'faq-manager__feedback is-error' : 'faq-manager__feedback'}
      role={error ? 'alert' : 'status'}>{status}</p>}
    <section className="faq-manager__panel"><div className="faq-manager__toolbar">
      <label className="faq-manager__search"><Search size={17} aria-hidden="true" />
        <input aria-label="搜索问题和答案" onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索问题或答案" type="search" value={query} /></label>
      <select aria-label="筛选显示状态" onChange={(event) => setFilter(event.target.value)} value={filter}>
        <option value="all">全部状态</option><option value="enabled">前台显示</option><option value="hidden">前台隐藏</option>
      </select><small>共 {items.length} 条 · 当前 {rows.length} 条</small></div>
      {rows.length ? <div className="faq-manager__table-wrap"><table><thead><tr><th scope="col">排序</th>
        <th scope="col">问题与答案</th><th scope="col">前台状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}><td>{item.sortOrder}</td><td>
          <strong>{item.question}</strong><details><summary>{item.answer.slice(0, 90)}{item.answer.length > 90 ? '…' : ''}</summary>
            <p>{item.answer}</p></details></td><td><span className={item.enabled ? 'faq-manager__badge' : 'faq-manager__badge is-hidden'}>
              {item.enabled ? '显示中' : '已隐藏'}</span></td><td><div className="faq-manager__actions">
                <button disabled={busy || !canEditContent} onClick={() => open(item)} type="button"><Pencil size={14} />编辑</button>
                <button className="is-danger" disabled={busy || !canManageSite} onClick={() => void remove(item)} type="button">
                  <Trash2 size={14} />{removing === item.id ? '删除中…' : '删除'}</button></div></td></tr>)}</tbody></table></div>
        : <div className="faq-manager__empty"><CircleHelp size={32} /><h2>{items.length ? '没有找到匹配问题' : '还没有常见问题'}</h2>
          <p>{items.length ? '试着更换关键词或显示状态。' : '添加访客常问的问题，减少反复解释。'}</p></div>}
    </section>
    {editing && <dialog aria-labelledby="faq-dialog-title" className="faq-manager__dialog" ref={dialog}
      onCancel={(event) => { event.preventDefault(); close() }}><form onSubmit={(event) => void save(event)}>
      <header><h2 id="faq-dialog-title">{editing.id ? '编辑问题' : '添加问题'}</h2>
        <button aria-label="关闭编辑" disabled={saving} onClick={close} type="button"><X size={20} /></button></header>
      <fieldset disabled={saving}><label>问题 <b>*</b><input autoFocus required
        onChange={(event) => setEditing({ ...editing, question: event.target.value })} value={editing.question} /></label>
        <label>答案 <b>*</b><textarea required onChange={(event) => setEditing({ ...editing, answer: event.target.value })}
          value={editing.answer} /></label><div className="faq-manager__options"><label>显示排序
            <input min="0" onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) || 0 })}
              type="number" value={editing.sortOrder} /></label><label className="faq-manager__check">
              <input checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
                type="checkbox" />在客户网站显示</label></div>
        {status && <p className={error ? 'faq-manager__feedback is-error' : 'faq-manager__feedback'}
          role={error ? 'alert' : 'status'}>{status}</p>}</fieldset>
      <footer><button className="faq-manager__cancel" disabled={saving} onClick={close} type="button">取消</button>
        <button disabled={saving} type="submit"><Save size={16} />{saving ? '保存中…' : '保存问题'}</button></footer>
    </form></dialog>}
  </section>
}
