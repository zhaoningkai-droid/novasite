'use client'

import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './navigation-editor.scss'

type Child = { href: string; label: string }
type Item = Child & { children: Child[] }
type Nav = { footerIntro: string; items: Item[]; localeCode: string; quickLinks: Child[] }
const locales = [['zh', '简体中文'], ['en', '英语'], ['ru', '俄语'], ['id', '印尼语']] as const
const empty = (localeCode: string): Nav => ({ footerIntro: '', items: [], localeCode, quickLinks: [] })
const validHref = (href: string) => {
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return true
  try { return ['https:', 'http:'].includes(new URL(href).protocol) } catch { return false }
}
const ordered = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const next = [...items]
  const target = index + direction
  if (target < 0 || target >= items.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function NavigationEditor({ companySlug, initial }: { companySlug: string; initial: Nav[] }) {
  const { canManageSite } = useWorkspacePermissions()
  const [localeCode, setLocaleCode] = useState('zh')
  const [drafts, setDrafts] = useState<Record<string, Nav>>(() => Object.fromEntries(
    locales.map(([code]) => [code, initial.find((item) => item.localeCode === code) || empty(code)]),
  ))
  const [saved, setSaved] = useState(drafts)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const value = drafts[localeCode]
  const dirtyLocales = locales.filter(([code]) => JSON.stringify(drafts[code]) !== JSON.stringify(saved[code]))
  useWorkspaceUnsaved(dirtyLocales.length > 0, saving)
  const update = (patch: Partial<Nav>) => setDrafts((current) => ({
    ...current, [localeCode]: { ...current[localeCode], ...patch },
  }))
  const updateItem = (index: number, patch: Partial<Item>) => update({
    items: value.items.map((item, current) => current === index ? { ...item, ...patch } : item),
  })
  const removeItem = (index: number) => {
    if (!window.confirm(`移除“${value.items[index].label || '未命名菜单'}”及其二级菜单？保存后生效，不会删除内容。`)) return
    update({ items: value.items.filter((_, current) => current !== index) })
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || !canManageSite) return
    const links = [...value.items.flatMap((item) => [item, ...item.children]), ...value.quickLinks]
    if (links.some((item) => !item.label.trim() || !validHref(item.href.trim()))) {
      setError(true)
      setStatus('每个菜单都需要名称和有效链接。站内链接以 / 开头，站外链接使用 http:// 或 https://。')
      return
    }
    setSaving(true); setStatus(''); setError(false)
    const submitted = { ...value, localeCode }
    try {
      const response = await fetch(`/api/workspace/${companySlug}/navigation`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitted),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || '导航没有保存，请重试。')
      setSaved((current) => ({ ...current, [localeCode]: submitted }))
      setStatus(`${locales.find(([code]) => code === localeCode)?.[1]}导航已保存。`)
    } catch (reason) {
      setError(true)
      setStatus(reason instanceof Error ? reason.message : '网络连接失败，修改已保留在页面中。')
    } finally { setSaving(false) }
  }
  return <section className="workspace-fixed-editor nav-editor">
    <header><div><p>网站配置 / 网站导航</p><h1>网站导航</h1>
      <span>{canManageSite ? '安排顶部菜单与页脚链接；切换语言会保留当前页面的草稿。' : '当前账号可查看导航，站点管理员可以修改。'}</span></div>
      <button disabled={saving || !canManageSite} form="navigation-settings" type="submit"><Save size={17} aria-hidden="true" />
        {saving ? '保存中…' : '保存当前语言'}</button></header>
    {status && <p className={error ? 'nav-editor__feedback is-error' : 'nav-editor__feedback'}
      role={error ? 'alert' : 'status'}>{status}</p>}
    <nav aria-label="导航语言" className="nav-editor__tabs">{locales.map(([code, label]) =>
      <button aria-pressed={localeCode === code} className={localeCode === code ? 'active' : ''}
        disabled={saving} key={code} onClick={() => { setLocaleCode(code); setStatus('') }} type="button">
        {label}{dirtyLocales.some(([dirty]) => dirty === code) && <i aria-label="有未保存修改" />}
      </button>)}</nav>
    <div className="nav-editor__summary"><span>{value.items.length} 个顶部菜单 · {value.quickLinks.length} 个页脚链接</span>
      <small>{dirtyLocales.length ? `待保存：${dirtyLocales.map(([, label]) => label).join('、')}` : '当前页面没有未保存修改'}</small></div>
    <form id="navigation-settings" onSubmit={(event) => void save(event)}>
      <fieldset disabled={saving || !canManageSite} className="nav-editor__controls">
        <section className="nav-editor__section"><div className="nav-editor__section-heading">
          <div><h2>顶部菜单</h2><p>按列表顺序展示，菜单支持一级和二级。</p></div>
          <button className="nav-editor__secondary" onClick={() => update({
            items: [...value.items, { label: '', href: '/', children: [] }],
          })} type="button"><Plus size={16} />添加菜单</button></div>
          {!value.items.length && <div className="nav-editor__empty">还没有顶部菜单，点击“添加菜单”开始配置。</div>}
          {value.items.map((item, index) => <article className="nav-editor__menu" key={index}>
            <div className="nav-editor__menu-heading"><strong><b>{String(index + 1).padStart(2, '0')}</b>
              {item.label || '新菜单'}</strong><div className="nav-editor__actions">
              <button aria-label={`菜单 ${index + 1} 上移`} disabled={index === 0}
                onClick={() => update({ items: ordered(value.items, index, -1) })} type="button"><ArrowUp size={16} /></button>
              <button aria-label={`菜单 ${index + 1} 下移`} disabled={index === value.items.length - 1}
                onClick={() => update({ items: ordered(value.items, index, 1) })} type="button"><ArrowDown size={16} /></button>
              <button aria-label={`删除菜单 ${index + 1}`} className="is-danger"
                onClick={() => removeItem(index)} type="button"><Trash2 size={16} /></button>
            </div></div>
            <div className="nav-editor__fields"><label>菜单名称 <span className="nav-editor__required">*</span>
              <input maxLength={80} onChange={(event) => updateItem(index, { label: event.target.value })}
                required value={item.label} /></label><label>链接地址 <span className="nav-editor__required">*</span>
              <input onChange={(event) => updateItem(index, { href: event.target.value })}
                placeholder="/products 或 https://example.com" required spellCheck={false} value={item.href} /></label></div>
            <details open={item.children.length > 0}><summary>二级菜单 <span>{item.children.length} 项</span></summary>
              {item.children.map((child, childIndex) => <div className="nav-editor__line" key={childIndex}>
                <label>二级名称<input aria-label={`菜单 ${index + 1} 二级名称 ${childIndex + 1}`}
                  onChange={(event) => updateItem(index, { children: item.children.map((entry, current) =>
                    current === childIndex ? { ...entry, label: event.target.value } : entry) })}
                  required value={child.label} /></label>
                <label>二级链接<input aria-label={`菜单 ${index + 1} 二级链接 ${childIndex + 1}`}
                  onChange={(event) => updateItem(index, { children: item.children.map((entry, current) =>
                    current === childIndex ? { ...entry, href: event.target.value } : entry) })}
                  placeholder="/products" required spellCheck={false} value={child.href} /></label>
                <button aria-label={`移除二级菜单 ${childIndex + 1}`} className="is-danger" onClick={() =>
                  updateItem(index, { children: item.children.filter((_, current) => current !== childIndex) })}
                  type="button"><Trash2 size={16} /></button></div>)}
              <button className="nav-editor__text-button" onClick={() => updateItem(index, {
                children: [...item.children, { label: '', href: '/' }],
              })} type="button"><Plus size={15} />添加二级菜单</button>
            </details>
          </article>)}
        </section>
        <section className="nav-editor__section"><div className="nav-editor__section-heading">
          <div><h2>页脚快速导航</h2><p>帮助访客在页面底部找到关键内容。</p></div>
          <button className="nav-editor__secondary" onClick={() => update({
            quickLinks: [...value.quickLinks, { label: '', href: '/' }],
          })} type="button"><Plus size={16} />添加链接</button></div>
          <label>页脚公司简介<textarea onChange={(event) => update({ footerIntro: event.target.value })}
            value={value.footerIntro} /></label>
          {value.quickLinks.map((item, index) => <div className="nav-editor__line" key={index}>
            <label>链接名称<input aria-label={`页脚名称 ${index + 1}`} required value={item.label}
              onChange={(event) => update({ quickLinks: value.quickLinks.map((entry, current) =>
                current === index ? { ...entry, label: event.target.value } : entry) })} /></label>
            <label>链接地址<input aria-label={`页脚链接 ${index + 1}`} required spellCheck={false}
              placeholder="/contact" value={item.href} onChange={(event) => update({
                quickLinks: value.quickLinks.map((entry, current) =>
                  current === index ? { ...entry, href: event.target.value } : entry),
              })} /></label><button aria-label={`移除页脚链接 ${index + 1}`} className="is-danger"
              onClick={() => update({ quickLinks: value.quickLinks.filter((_, current) => current !== index) })}
              type="button"><Trash2 size={16} /></button></div>)}
        </section>
      </fieldset>
      <div className="nav-editor__save-bar"><span>保存只更新当前语言</span>
        <a href={`/s/${companySlug}/${localeCode}`} rel="noopener noreferrer" target="_blank">
          查看网站<ExternalLink size={14} /></a></div>
    </form>
  </section>
}
