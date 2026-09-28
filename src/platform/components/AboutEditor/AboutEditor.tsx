'use client'

import Image from 'next/image'
import { ArrowDown, ArrowUp, Building2, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ContentCover, ContentCoverUploader } from '../ContentCoverUploader/ContentCoverUploader'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './about-editor.scss'

type Module = { description: string; id?: string; image?: ContentCover; sortOrder: number; title: string }
type Values = { intro: string; modules: Module[]; title: string }
const clone = (value: Values): Values => ({ ...value, modules: value.modules.map((item) => ({ ...item })) })

export function AboutEditor({ companySlug, initial }: { companySlug: string; initial: Values }) {
  const { canManageSite } = useWorkspacePermissions()
  const [saved, setSaved] = useState<Values>(() => clone(initial))
  const [draft, setDraft] = useState<Values>(() => clone(initial))
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const busy = saving || uploading
  const dialog = useRef<HTMLDialogElement>(null)
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved)
  useWorkspaceUnsaved(dirty, busy)
  const modules = useMemo(() => [...saved.modules].sort((a, b) => a.sortOrder - b.sortOrder), [saved.modules])
  useEffect(() => { if (editing && !dialog.current?.open) dialog.current?.showModal() }, [editing])
  const open = () => { setDraft(clone(saved)); setStatus(''); setEditing(true) }
  const close = () => {
    if (busy || !canManageSite) return
    if (dirty && !window.confirm('放弃关于我们的未保存修改？已保存的内容会保留。')) return
    setDraft(clone(saved)); setEditing(false)
  }
  const updateModule = (index: number, patch: Partial<Module>) => setDraft((current) => ({
    ...current, modules: current.modules.map((item, at) => at === index ? { ...item, ...patch } : item),
  }))
  const moveModule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.modules.length) return
    const next = [...draft.modules]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft((current) => ({ ...current, modules: next.map((item, at) => ({ ...item, sortOrder: at + 1 })) }))
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canManageSite) return
    if (draft.modules.some((item) => !item.title.trim() || !item.description.trim())) {
      setError(true); setStatus('请填写每个模块的名称与描述，或移除空白模块。'); return
    }
    setSaving(true); setStatus(''); setError(false)
    const submitted = clone(draft)
    try {
      const response = await fetch(`/api/workspace/${companySlug}/about`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...submitted, modules: submitted.modules.map((item) => ({ ...item, image: item.image?.id })) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || '关于我们没有保存，请重试。')
      const persisted = data.saved ? data.saved as Values : submitted
      setSaved(persisted); setDraft(clone(persisted)); setEditing(false)
      setStatus(data.message || '关于我们已保存。')
    } catch (reason) {
      setError(true)
      setStatus(reason instanceof Error ? reason.message : '网络连接失败，修改已保留在编辑窗口中。')
    } finally { setSaving(false) }
  }
  return <section className="workspace-fixed-editor about-manager">
    <header><div><p>网站配置 / 关于我们</p><h1>关于我们</h1>
      <span>{canManageSite ? '维护企业简介与图文模块，按顺序展示在客户网站中。' : '当前账号可查看企业介绍，站点管理员可以修改。'}</span></div>
      <button disabled={!canManageSite} onClick={open} type="button"><Pencil size={17} aria-hidden="true" />编辑内容</button></header>
    {status && !editing && <p className="about-manager__status" role={error ? 'alert' : 'status'}>{status}</p>}
    <section className="about-manager__panel">
      <div className="about-manager__toolbar"><div><h2>{saved.title || '企业简介'}</h2>
        <p>{saved.intro || '暂未填写页面简介，可在编辑内容中补充。'}</p></div>
        <span>{modules.length} 个图文模块</span></div>
      {modules.length ? <div className="about-manager__rows">{modules.map((item, index) =>
        <article key={item.id || index}><div className="about-manager__image">
          {item.image?.thumbnailURL || item.image?.url ? <Image unoptimized alt={item.title} width={160} height={120}
            src={item.image.thumbnailURL || item.image.url || ''} /> : <Building2 size={26} aria-label="暂无图片" />}
        </div><div className="about-manager__copy"><div><small>模块 {String(index + 1).padStart(2, '0')}</small>
          <span className={item.title.trim() && item.description.trim() ? 'is-complete' : ''}>
            {item.title.trim() && item.description.trim() ? '中文内容完整' : '中文待补全'}</span></div>
          <h3>{item.title || `模块 ${index + 1}`}</h3><p>{item.description || '暂未填写模块描述。'}</p>
        </div></article>)}</div> : <div className="about-manager__empty"><Building2 size={32} />
        <h3>还没有图文模块</h3><p>已有企业简介会继续保留，编辑后可添加图片和介绍。</p>
        <button disabled={!canManageSite} onClick={open} type="button">添加图文模块</button></div>}
    </section>
    {editing && <dialog aria-labelledby="about-editor-title" className="about-manager__dialog" ref={dialog}
      onCancel={(event) => { event.preventDefault(); close() }}>
      <form onSubmit={(event) => void save(event)}>
        <header><div><p>中文内容</p><h2 id="about-editor-title">编辑关于我们</h2></div>
          <button aria-label="关闭编辑" disabled={busy} onClick={close} type="button"><X size={21} /></button></header>
        <fieldset disabled={busy} className="about-manager__drawer-body">
          <div className="about-manager__page-fields"><label>页面标题<input autoFocus
            onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} /></label>
            <label>页面简介<textarea onChange={(event) => setDraft({ ...draft, intro: event.target.value })}
              value={draft.intro} /></label></div>
          <div className="about-manager__module-heading"><h3>图文模块</h3><button onClick={() => setDraft({
            ...draft, modules: [...draft.modules, { description: '', sortOrder: draft.modules.length + 1, title: '' }],
          })} type="button"><Plus size={16} />添加模块</button></div>
          {draft.modules.map((item, index) => <section className="about-manager__module" key={item.id || index}>
            <div className="about-manager__module-heading"><strong>模块 {index + 1}</strong>
              <div className="about-manager__actions"><button aria-label={`模块 ${index + 1} 上移`} disabled={index === 0}
                onClick={() => moveModule(index, -1)} type="button"><ArrowUp size={16} /></button>
                <button aria-label={`模块 ${index + 1} 下移`} disabled={index === draft.modules.length - 1}
                  onClick={() => moveModule(index, 1)} type="button"><ArrowDown size={16} /></button>
                <button aria-label={`移除模块 ${index + 1}`} className="is-danger" onClick={() => {
                  if (window.confirm(`移除“${item.title || `模块 ${index + 1}`}”？保存后生效。`)) {
                    setDraft({ ...draft, modules: draft.modules.filter((_, at) => at !== index) })
                  }
                }} type="button"><Trash2 size={16} /></button></div></div>
            <label>模块名称 <span>*</span><input maxLength={120} required
              onChange={(event) => updateModule(index, { title: event.target.value })} value={item.title} /></label>
            <ContentCoverUploader companySlug={companySlug} label={`模块 ${index + 1} 图片`}
              disabled={busy} onBusyChange={setUploading}
              onChange={(image) => updateModule(index, { image })} value={item.image} />
            <label>模块描述 <span>*</span><textarea required
              onChange={(event) => updateModule(index, { description: event.target.value })} value={item.description} /></label>
            <label className="about-manager__order">显示排序<input min="0" type="number" value={item.sortOrder}
              onChange={(event) => updateModule(index, { sortOrder: Number(event.target.value) || 0 })} /></label>
          </section>)}
          {status && <p className={error ? 'about-manager__status is-error' : 'about-manager__status'}
            role={error ? 'alert' : 'status'}>{status}</p>}
        </fieldset>
        <footer><span>{dirty ? '有未保存修改' : '尚未修改内容'}</span><button className="about-manager__cancel"
          disabled={busy} onClick={close} type="button">取消</button><button className="about-manager__save"
          disabled={busy} type="submit"><Save size={16} />{uploading ? '上传中…' : saving ? '保存中…' : '保存内容'}</button></footer>
      </form>
    </dialog>}
  </section>
}
