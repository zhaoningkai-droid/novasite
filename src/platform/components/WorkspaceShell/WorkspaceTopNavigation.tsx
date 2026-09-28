'use client'

import { Bell, Check, Layers3, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const navigation = [
  '首页', '社媒营销', '独立站', 'GEO优化', '广告投放',
  '客户管理', '客户挖掘', '自动化营销', '企业知识库',
]

export function WorkspaceTopNavigation() {
  const [notice, setNotice] = useState('')
  const [notifications, setNotifications] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!notifications) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setNotifications(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNotifications(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
    }
  }, [notifications])
  return <>
    <nav aria-label="平台主导航" className="workspace-top-navigation">
      {navigation.map((item) => item === '独立站'
        ? <span aria-current="page" className="workspace-top-navigation__item is-active" key={item}>
          <Layers3 size={15} aria-hidden="true" />{item}</span>
        : <button className="workspace-top-navigation__item" key={item}
          onClick={() => setNotice(`${item}暂未接入，当前仍在独立站工作台。`)} type="button">
          {item}</button>)}
    </nav>
    <div className="workspace-top-navigation__utilities" ref={root}>
      <button aria-label="查看通知" aria-expanded={notifications}
        className="workspace-top-navigation__notification" ref={trigger}
        onClick={() => setNotifications((value) => !value)} type="button">
        <Bell aria-hidden="true" size={18} />
      </button>
      {notifications && <section aria-label="通知中心" className="workspace-top-navigation__notifications">
        <header><strong>通知中心</strong><button aria-label="关闭通知中心"
          onClick={() => { setNotifications(false); trigger.current?.focus() }} type="button">
          <X size={16} /></button></header>
        <div><Check size={22} aria-hidden="true" /><strong>暂无通知</strong>
          <p>当前没有待处理的系统消息。</p></div>
      </section>}
      {notice && <div className="workspace-top-navigation__notice" role="status">
        <span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}
          type="button"><X size={16} /></button></div>}
    </div>
  </>
}
