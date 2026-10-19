'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Inbox,
  Loader2, Mail, RefreshCw, Save, Search, X,
} from 'lucide-react'
import {
  inquiryDateLabel, inquiryNotificationLabel, inquirySourceURL, inquiryStatuses,
  inquiryStatusLabel, type InquiryDetail, type InquiryNotification, type InquiryRow,
  type InquiryStatus,
} from '@/platform/inquiry/inbox-model'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import './workspace-inquiry-inbox.scss'

type Props = {
  companySlug: string; companyName: string; rows: InquiryRow[]; keyword: string;
  status: InquiryStatus | ''; page: number; totalDocs: number | null;
  totalPages: number; loadError: boolean; canRetryNotification: boolean;
}
type DetailResponse = { lead: InquiryDetail; notification: InquiryNotification; message?: string }
export function WorkspaceInquiryInbox(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState(props.keyword)
  const [statusFilter, setStatusFilter] = useState(props.status)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [openID, setOpenID] = useState<number | null>(null)
  const [detail, setDetail] = useState<InquiryDetail | null>(null)
  const [notification, setNotification] = useState<InquiryNotification | null>(null)
  const [followStatus, setFollowStatus] = useState<InquiryStatus>('new')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [notificationRefreshing, setNotificationRefreshing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState(false)
  const [conflict, setConflict] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const readController = useRef<AbortController | null>(null)
  const readGeneration = useRef(0)
  const notificationController = useRef<AbortController | null>(null)
  const notificationGeneration = useRef(0)
  const writeBusy = useRef(false)
  const base = `/workspace/${props.companySlug}/website/inquiries`
  const endpoint = (id: number) => `/api/workspace/${props.companySlug}/inquiries/${id}`
  const dirty = Boolean(detail && (notes !== (detail.internalNotes || '')
    || followStatus !== detail.status))
  useWorkspaceUnsaved(dirty, saving || retrying)

  useEffect(() => { setSearch(props.keyword); setStatusFilter(props.status) },
    [props.keyword, props.status])
  useEffect(() => () => {
    clearTimeout(searchTimer.current)
    readController.current?.abort()
    readGeneration.current++
    notificationController.current?.abort()
    notificationGeneration.current++
  }, [])

  const href = (page: number, keyword = search, status = statusFilter) => {
    const query = new URLSearchParams({ page: String(page) })
    if (keyword.trim()) query.set('q', keyword.trim())
    if (status) query.set('status', status)
    return `${base}?${query}`
  }
  const filter = (keyword: string, status: InquiryStatus | '') => {
    clearTimeout(searchTimer.current)
    startTransition(() => router.replace(href(1, keyword, status), { scroll: false }))
  }
  const searchChanged = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => filter(value, statusFilter), 350)
  }

  useEffect(() => {
    if (!openID || !dialog.current) return
    const element = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    element.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      if (opener.current?.isConnected) opener.current.focus()
    }
  }, [openID])

  const notificationID = detail?.id
  const refreshNotification = useCallback(async (background = false) => {
    if (!notificationID || writeBusy.current) return
    notificationController.current?.abort()
    const controller = new AbortController()
    notificationController.current = controller
    const generation = ++notificationGeneration.current
    if (!background) setNotificationRefreshing(true)
    try {
      const response = await fetch(
        `/api/workspace/${props.companySlug}/inquiries/${notificationID}/notification`, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        },
      )
      const result = await readWorkspaceResponse<{ notification?: InquiryNotification }>(response)
      if (!response.ok || !result.notification) throw new Error('NOTIFICATION_UNAVAILABLE')
      if (!controller.signal.aborted && generation === notificationGeneration.current) {
        setNotification(result.notification)
      }
    } catch {
      if (!controller.signal.aborted && generation === notificationGeneration.current) {
        setNotification((current) => current ? { ...current, status: 'unavailable' } : current)
      }
    } finally {
      if (!background && generation === notificationGeneration.current) {
        setNotificationRefreshing(false)
      }
    }
  }, [notificationID, props.companySlug])

  useEffect(() => {
    if (!notification?.enabled || retrying
      || !['pending', 'sending', 'retry'].includes(notification.status)) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await refreshNotification(true)
      if (!disposed) timer = setTimeout(() => void poll(), 4000)
    }
    timer = setTimeout(() => void poll(), 4000)
    return () => { disposed = true; clearTimeout(timer); notificationController.current?.abort() }
  }, [notification?.enabled, notification?.status, refreshNotification, retrying])

  const applyDetail = (lead: InquiryDetail) => {
    setDetail(lead)
    setFollowStatus(lead.status)
    setNotes(lead.internalNotes || '')
    setConflict(false)
  }
  const loadDetail = async (id: number) => {
    readController.current?.abort()
    const controller = new AbortController()
    readController.current = controller
    const generation = ++readGeneration.current
    setLoading(true); setFeedback(''); setFeedbackError(false)
    try {
      const response = await fetch(endpoint(id), {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      })
      const result = await readWorkspaceResponse<DetailResponse>(response)
      if (!response.ok) throw new Error(result.message || '询盘暂时无法读取。')
      if (generation !== readGeneration.current || controller.signal.aborted) return
      applyDetail(result.lead)
      setNotification(result.notification)
    } catch (error) {
      if (generation === readGeneration.current && !controller.signal.aborted) {
        setFeedback(workspaceErrorMessage(error, '询盘暂时无法读取，请重新载入。'))
        setFeedbackError(true)
      }
    } finally {
      if (generation === readGeneration.current) setLoading(false)
    }
  }
  const open = (row: InquiryRow) => {
    notificationController.current?.abort(); notificationGeneration.current++
    setNotificationRefreshing(false)
    opener.current = document.activeElement as HTMLElement | null
    setDetail(null); setNotification(null); setConflict(false)
    setOpenID(row.id)
    void loadDetail(row.id)
  }
  const close = () => {
    if (writeBusy.current) return
    readController.current?.abort(); readGeneration.current++
    notificationController.current?.abort(); notificationGeneration.current++
    setOpenID(null); setDetail(null); setNotification(null); setFeedback('')
  }
  const reload = () => {
    if (!openID || writeBusy.current) return
    void loadDetail(openID)
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail || !dirty || writeBusy.current || loading || conflict) return
    if (notes !== (detail.internalNotes || '') && notes.length > 8000) {
      setFeedback('新增备注请控制在 8000 字以内。'); setFeedbackError(true); return
    }
    writeBusy.current = true; setSaving(true); setFeedback(''); setFeedbackError(false)
    try {
      const response = await fetch(endpoint(detail.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: followStatus, expectedUpdatedAt: detail.updatedAt,
          ...(notes !== (detail.internalNotes || '') ? { internalNotes: notes } : {}) }),
        signal: AbortSignal.timeout(20_000),
      })
      const result = await readWorkspaceResponse<{ lead: InquiryDetail; message?: string }>(response)
      if (!response.ok) {
        if (response.status === 409) setConflict(true)
        throw new Error(result.message || '跟进信息保存失败。')
      }
      applyDetail(result.lead)
      setFeedback('跟进信息已保存。')
      router.refresh()
    } catch (error) {
      setFeedback(workspaceErrorMessage(error)); setFeedbackError(true)
    } finally { writeBusy.current = false; setSaving(false) }
  }
  const retryNotification = async () => {
    if (!detail || !notification || writeBusy.current || !props.canRetryNotification) return
    const ambiguous = notification.status === 'ambiguous'
    const question = ambiguous
      ? '上一封通知可能已发出。再次发送可能让公司邮箱收到重复通知，确定安排重试吗？'
      : '将向当前公司保存的邮箱安排一封询盘通知，不会重复创建询盘。确定继续吗？'
    if (!window.confirm(question)) return
    notificationController.current?.abort(); notificationGeneration.current++
    setNotificationRefreshing(false)
    writeBusy.current = true; setRetrying(true); setFeedback(''); setFeedbackError(false)
    try {
      const response = await fetch(`${endpoint(detail.id)}/notification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, acknowledgePossibleDuplicate: ambiguous }),
        signal: AbortSignal.timeout(20_000),
      })
      const result = await readWorkspaceResponse<{
        notification: InquiryNotification; message?: string;
      }>(response)
      if (!response.ok) throw new Error(result.message || '通知暂时无法安排。')
      setNotification(result.notification); setFeedback('通知已安排重试，询盘没有重复创建。')
    } catch (error) {
      setFeedback(workspaceErrorMessage(error)); setFeedbackError(true)
    } finally { writeBusy.current = false; setRetrying(false) }
  }
  const source = inquirySourceURL(detail?.sourcePage)
  const canRetry = notification?.enabled && props.canRetryNotification
    && ['failed', 'disabled', 'ambiguous'].includes(notification.status)

  return <section className="workspace-inquiry" aria-label="询盘收件箱">
    <header className="workspace-inquiry__header">
      <div><h1>询盘收件箱</h1></div>
      <button type="button" disabled={pending} onClick={() => {
        clearTimeout(searchTimer.current)
        startTransition(() => router.refresh())
      }}><RefreshCw size={16} aria-hidden="true" />刷新</button>
    </header>
    <div className="workspace-inquiry__panel" aria-busy={pending}>
      <form className="workspace-inquiry__filters" role="search" onSubmit={(event) => {
        event.preventDefault(); filter(search, statusFilter)
      }}>
        <label className="workspace-inquiry__search">
          <span className="workspace-inquiry__sr">搜索姓名、邮箱、公司或留言</span>
          <Search size={17} aria-hidden="true" />
          <input type="search" value={search} maxLength={120} autoComplete="off"
            placeholder="搜索姓名、邮箱、公司或留言" onChange={(event) => {
              searchChanged(event.target.value)
            }} />
        </label>
        <label><span className="workspace-inquiry__sr">跟进状态</span>
          <select value={statusFilter} onChange={(event) => {
            const status = event.target.value as InquiryStatus | ''
            setStatusFilter(status); filter(search, status)
          }}><option value="">全部跟进状态</option>
            {inquiryStatuses.map((item) => <option key={item.value}
              value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <span role="status">{pending ? '正在读取…'
          : props.totalDocs === null ? '数量暂不可用' : `共 ${props.totalDocs} 条`}</span>
      </form>
      {props.loadError ? <div className="workspace-inquiry__empty" role="alert">
        <AlertTriangle size={28} aria-hidden="true" /><h2>询盘暂时无法读取</h2>
        <p>请稍后刷新；这里没有把读取失败当作零条询盘。</p>
      </div> : props.rows.length === 0 ? <div className="workspace-inquiry__empty">
        <Inbox size={30} aria-hidden="true" />
        <h2>{props.keyword || props.status ? '没有匹配的询盘' : '暂时没有询盘'}</h2>
        <p>{props.keyword || props.status ? '调整关键词或跟进状态后，列表会自动更新。'
          : '访客在客户网站提交留言后，会显示在这里。'}</p>
      </div> : <div className="workspace-inquiry__table-wrap">
        <table role="table"><caption className="workspace-inquiry__sr">当前公司的访客询盘</caption>
          <thead role="rowgroup"><tr role="row">
            <th role="columnheader" scope="col">联系人</th>
            <th role="columnheader" scope="col">公司与国家</th>
            <th role="columnheader" scope="col">留言</th>
            <th role="columnheader" scope="col">跟进状态</th>
            <th role="columnheader" scope="col">收到时间</th>
            <th role="columnheader" scope="col">操作</th></tr></thead>
          <tbody role="rowgroup">{props.rows.map((row) => <tr role="row" key={row.id}>
            <td role="cell" data-label="联系人"><strong>{row.name}</strong>
              <span title={row.email}>{row.email}</span><small>{row.phone || '未留电话'}</small></td>
            <td role="cell" data-label="公司与国家"><strong>{row.company || '未填公司'}</strong>
              <span>{row.country || '未填国家'}</span></td>
            <td role="cell" data-label="留言"><p className="workspace-inquiry__summary"
              title={row.summary}>{row.summary}</p></td>
            <td role="cell" data-label="跟进状态">
              <span className={`workspace-inquiry__badge is-${row.status}`}>
              {inquiryStatusLabel(row.status)}</span></td>
            <td role="cell" data-label="收到时间"><time dateTime={row.createdAt}>
              {inquiryDateLabel(row.createdAt)}</time></td>
            <td role="cell" data-label="操作"><button type="button" onClick={() => open(row)}
              aria-label={`查看 ${row.name} 的询盘`}>查看</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!props.loadError && <footer className="workspace-inquiry__pagination">
        <span>第 {props.page} / {props.totalPages} 页 · 每页 10 条</span>
        <nav aria-label="询盘分页">
          {props.page > 1 ? <Link href={href(props.page - 1, props.keyword, props.status)}>
            <ChevronLeft size={15} aria-hidden="true" />上一页</Link>
            : <button disabled type="button"><ChevronLeft size={15}
              aria-hidden="true" />上一页</button>}
          {props.page < props.totalPages ? <Link
            href={href(props.page + 1, props.keyword, props.status)}>下一页
            <ChevronRight size={15} aria-hidden="true" /></Link>
            : <button disabled type="button">下一页<ChevronRight size={15}
              aria-hidden="true" /></button>}
        </nav>
      </footer>}
    </div>
    {openID && <dialog ref={dialog} className="workspace-inquiry__dialog"
      aria-labelledby="workspace-inquiry-detail-title" onCancel={(event) => {
        event.preventDefault(); close()
      }} onClick={(event) => { if (event.target === dialog.current) close() }}>
      <header><div><p>询盘 #{openID}</p><h2 id="workspace-inquiry-detail-title">询盘详情</h2></div>
        <button type="button" data-dialog-close aria-label="关闭询盘详情"
          disabled={saving || retrying} onClick={close}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="workspace-inquiry__detail-body" aria-busy={loading || saving || retrying}>
        {loading && <p className="workspace-inquiry__loading" role="status">
          <Loader2 size={18} aria-hidden="true" />正在读取询盘…</p>}
        {feedback && <p role={feedbackError ? 'alert' : 'status'}
          className={`workspace-inquiry__feedback${feedbackError ? ' is-error' : ''}`}>
          {feedbackError ? <AlertTriangle size={17} aria-hidden="true" />
            : <CheckCircle2 size={17} aria-hidden="true" />}{feedback}</p>}
        {!loading && !detail && <button type="button" onClick={reload}>重新载入</button>}
        {detail && <>
          <dl className="workspace-inquiry__contact-grid">
            <div><dt>姓名</dt><dd>{detail.name}</dd></div>
            <div><dt>邮箱</dt><dd>{detail.email}</dd></div>
            <div><dt>WhatsApp / 电话</dt><dd>{detail.phone || '—'}</dd></div>
            <div><dt>公司</dt><dd>{detail.company || '—'}</dd></div>
            <div><dt>国家</dt><dd>{detail.country || '—'}</dd></div>
            <div><dt>收到时间（北京时间）</dt><dd>{inquiryDateLabel(detail.createdAt)}</dd></div>
            {detail.address && <div className="is-wide"><dt>访客地址</dt>
              <dd>{detail.address}</dd></div>}
            {detail.product && <div className="is-wide"><dt>意向产品</dt>
              <dd>{detail.product.title}</dd></div>}
            {detail.capacity && <div><dt>填写的容量</dt><dd>{detail.capacity}</dd></div>}
          </dl>
          <section className="workspace-inquiry__message"><h3>访客留言</h3>
            <p>{detail.message}</p></section>
          <dl className="workspace-inquiry__source"><div><dt>来源网址（访客提交）</dt>
            <dd>{source ? <a href={source} target="_blank" rel="noopener noreferrer">
              {source}<ArrowUpRight size={14} aria-hidden="true" /></a>
              : detail.sourcePage || '未记录'}</dd></div>
            {(detail.utmSource || detail.utmCampaign) && <div><dt>推广来源 / 活动</dt>
              <dd>{[detail.utmSource, detail.utmCampaign].filter(Boolean).join(' / ')}</dd></div>}
          </dl>
          {notification && <section className="workspace-inquiry__notification">
            <div><h3><Mail size={17} aria-hidden="true" />邮件通知</h3>
              <p>{inquiryNotificationLabel(notification.status)}</p>
              {notification.status === 'accepted' && <small>邮件服务已接收，不能据此判断已进入收件箱。</small>}
              {notification.status === 'ambiguous' && <small>可能已经发送，请先核对公司邮箱。</small>}
              {!notification.enabled && <small>邮件通知未启用，询盘记录已保留。</small>}
              {notification.status === 'retry' && notification.nextAttemptAt && <small>
                计划重试：{inquiryDateLabel(notification.nextAttemptAt)}</small>}
            </div>
            <div className="workspace-inquiry__notification-actions">
              <button type="button"
                disabled={saving || retrying || loading || notificationRefreshing}
                onClick={() => void refreshNotification()}>
                <RefreshCw size={15} aria-hidden="true" />
                {notificationRefreshing ? '读取中…' : '刷新通知'}</button>
              {canRetry && <button type="button"
                disabled={saving || retrying || loading || notificationRefreshing}
                onClick={() => void retryNotification()}>
                {retrying ? '正在安排…' : '安排重试'}</button>}
            </div>
          </section>}
          <form className="workspace-inquiry__followup" onSubmit={save}>
            <fieldset disabled={saving || retrying || loading}>
              <legend>跟进记录</legend>
              <label><span>跟进状态</span><select value={followStatus}
                onChange={(event) => setFollowStatus(event.target.value as InquiryStatus)}>
                {inquiryStatuses.map((item) => <option key={item.value}
                  value={item.value}>{item.label}</option>)}</select></label>
              <label><span>内部备注</span><textarea value={notes} maxLength={8000} rows={5}
                onChange={(event) => setNotes(event.target.value)} />
                <small>仅后台可见，不修改访客留言。{notes.length} / 8000 字
                  {notes.length > 8000 && '；原有长备注保留，修改后需控制在 8000 字以内。'}
                </small></label>
            </fieldset>
            <footer><button type="button" disabled={saving || retrying || loading}
              onClick={reload}><RefreshCw size={15} aria-hidden="true" />重新载入</button>
              <button type="submit" className="is-primary"
                disabled={!dirty || saving || retrying || loading || conflict}>
                {saving ? <Loader2 className="workspace-inquiry__spinner"
                  size={16} aria-hidden="true" />
                  : <Save size={16} aria-hidden="true" />}{saving ? '保存中…' : '保存跟进信息'}
              </button></footer>
          </form>
        </>}
      </div>
    </dialog>}
  </section>
}
