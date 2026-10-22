'use client'
import Link from 'next/link'
import { Copy, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import type { GeoArticleListItem, GeoArticleUseFilter } from '@/platform/geo/article-store'
import { cleanGeoArticleHTML, escapeGeoHTML, type GeoArticle } from '@/platform/geo/articles'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { GeoRichTextToolbar } from './GeoRichTextToolbar'
import './geo-workspace.scss'
import './geo-published-preview.scss'
import { KnowledgeEvidence } from '../KnowledgeWorkspace/KnowledgeEvidence'
const formValue = (item: Pick<GeoArticle, 'title' | 'summary' | 'html'>) => ({
  title: item.title,
  summary: item.summary,
  html: item.html,
})
export function GeoArticles({
  company,
  recordId,
  taskFilter,
}: {
  company: WorkspaceCompany
  recordId?: string
  taskFilter?: string
}) {
  const base = `/workspace/${encodeURIComponent(company.slug)}/geo/articles`,
    endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo/articles`
  const [article, setArticle] = useState<GeoArticle | null>(null),
    [form, setForm] = useState({ title: '', summary: '', html: '' }),
    [baseline, setBaseline] = useState('')
  const [items, setItems] = useState<GeoArticleListItem[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [q, setQ] = useState('')
  const [taskName, setTaskName] = useState(''),
    [use, setUse] = useState<GeoArticleUseFilter>('all')
  const [previewArticle, setPreviewArticle] = useState<GeoArticle | null>(null),
    [previewLoading, setPreviewLoading] = useState(false),
    [copied, setCopied] = useState(false)
  const previewDialog = useRef<HTMLDialogElement | null>(null),
    previewRequest = useRef<AbortController | null>(null),
    previewContent = useRef<HTMLElement | null>(null)
  const [revisions, setRevisions] = useState<{ version: number; created_at: string }[]>([])
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [reload, setReload] = useState(0)
  const [editorKey, setEditorKey] = useState(0)
  const editor = useRef<HTMLDivElement | null>(null),
    selection = useRef<Range | null>(null),
    active = useRef(true),
    locked = useRef(false),
    mutation = useRef<AbortController | null>(null)
  const pendingHTML = useRef('')
  const dirty = !!article && JSON.stringify(form) !== baseline
  useWorkspaceUnsaved(dirty, busy)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      mutation.current?.abort()
      previewRequest.current?.abort()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = setTimeout(
      async () => {
        try {
          const response = await fetch(
              recordId
                ? `${endpoint}/${recordId}`
                : `${endpoint}?q=${encodeURIComponent(q)}&taskName=${encodeURIComponent(taskName)}&use=${use}&page=${page}&pageSize=${pageSize}${taskFilter ? `&taskID=${encodeURIComponent(taskFilter)}` : ''}`,
              { signal: controller.signal, cache: 'no-store' },
            ),
            r = await response.json()
          if (!response.ok) throw new Error(r.message || '文章读取失败。')
          if (controller.signal.aborted) return
          if (recordId) {
            pendingHTML.current = r.item.html
            setArticle(r.item)
            setForm(formValue(r.item))
            setBaseline(JSON.stringify(formValue(r.item)))
            setRevisions(r.revisions)
            setEditorKey((n) => n + 1)
          } else {
            setItems(r.items)
            setTotal(r.total)
          }
        } catch (e) {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取失败。')
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      },
      q || taskName ? 200 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [endpoint, page, pageSize, q, recordId, reload, taskFilter, taskName, use])
  const openPreview = async (id: string) => {
    previewRequest.current?.abort()
    const controller = new AbortController()
    previewRequest.current = controller
    setPreviewArticle(null)
    setCopied(false)
    setPreviewLoading(true)
    setError('')
    previewDialog.current?.showModal()
    try {
      const response = await fetch(`${endpoint}/${id}`, {
          cache: 'no-store',
          signal: controller.signal,
        }),
        result = await response.json()
      if (!response.ok) throw new Error(result.message || '文章读取失败。')
      if (!controller.signal.aborted) setPreviewArticle(result.item)
    } catch (cause) {
      if (!controller.signal.aborted) {
        previewDialog.current?.close()
        setError(cause instanceof Error ? cause.message : '读取失败。')
      }
    } finally {
      if (!controller.signal.aborted) setPreviewLoading(false)
    }
  }
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copyPreview = async () => {
    if (!previewArticle || !previewContent.current) return
    try {
      await navigator.clipboard.writeText(
        `${previewArticle.title}\n\n${previewContent.current.innerText}`,
      )
      setCopied(true)
    } catch {
      setError('复制失败，请重试。')
    }
  }
  useEffect(() => {
    if (editor.current && !loading) editor.current.innerHTML = pendingHTML.current
  }, [editorKey, loading]) // set only after explicit load/save/restore
  useEffect(() => {
    const remember = () => {
      const s = window.getSelection()
      if (
        s?.rangeCount &&
        editor.current?.contains(s.anchorNode) &&
        editor.current.contains(s.focusNode)
      )
        selection.current = s.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])
  const change = (value: Partial<typeof form>) => {
    setForm((old) => ({ ...old, ...value }))
    setNotice('')
  }
  const format = (command: string, value?: string) => {
    if (!editor.current || busy) return
    editor.current.focus()
    const s = window.getSelection(),
      range = selection.current
    if (range && editor.current.contains(range.commonAncestorContainer)) {
      s?.removeAllRanges()
      s?.addRange(range)
    }
    document.execCommand(command, false, value)
    change({ html: editor.current.innerHTML })
  }
  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!article) return
    e.preventDefault()
    const html =
      e.clipboardData.getData('text/html') ||
      `<p>${escapeGeoHTML(e.clipboardData.getData('text/plain')).replace(/\n/gu, '<br>')}</p>`
    format(
      'insertHTML',
      cleanGeoArticleHTML(
        html,
        article.context.sources,
        article.context.materialGroup.images,
        article.context.publicationLinks,
      ).html,
    )
  }
  const save = async (e: FormEvent, ready: boolean) => {
    e.preventDefault()
    if (!article || locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      const response = await fetch(`${endpoint}/${article.id}`, {
        method: 'PATCH',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          html: editor.current?.innerHTML || form.html,
          version: article.version,
          ready,
        }),
      })
      const r = await response.json()
      if (!response.ok) throw new Error(r.message || '保存失败，输入已保留。')
      if (!active.current || controller.signal.aborted) return
      pendingHTML.current = r.item.html
      setArticle(r.item)
      setForm(formValue(r.item))
      setBaseline(JSON.stringify(formValue(r.item)))
      setRevisions(r.revisions)
      setEditorKey((n) => n + 1)
      setNotice(r.message)
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '保存失败，输入已保留。')
    } finally {
      locked.current = false
      if (active.current) setBusy(false)
    }
  }
  const restore = async (version: number) => {
    if (
      !article ||
      locked.current ||
      !window.confirm(
        `将修订${version}的正文填入当前编辑器，保存后产生新修订；不会覆盖历史记录。是否继续？`,
      )
    )
      return
    locked.current = true
    setBusy(true)
    setError('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      const response = await fetch(`${endpoint}/${article.id}?version=${version}`, {
          signal: controller.signal,
          cache: 'no-store',
        }),
        r = await response.json()
      if (!response.ok) throw new Error(r.message || '历史修订读取失败。')
      if (active.current && !controller.signal.aborted) {
        pendingHTML.current = r.item.html
        change(formValue(r.item))
        setEditorKey((n) => n + 1)
        setNotice('历史正文已填入，请核对后保存为新修订。')
      }
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '读取失败。')
    } finally {
      locked.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <section className="geo-workspace geo-records-page">
      <header className="geo-workspace__heading">
        <div>
          <Link
            className="geo-workspace__back"
            aria-label={recordId ? '返回创作记录' : '返回文章创作'}
            href={recordId ? base : `/workspace/${company.slug}/geo/creation`}
          >
            ‹
          </Link>
          <h1>{recordId ? '文章编辑' : '创作记录'}</h1>
        </div>
        {!recordId && taskFilter && <Link href={base}>查看全部创作记录</Link>}
        {article && (
          <button
            type="button"
            disabled={busy}
            className="geo-workspace__button"
            onClick={() => {
              setReload((n) => n + 1)
            }}
          >
            读取最新版本
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="geo-workspace__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="geo-workspace__notice">
          {notice}
        </p>
      )}
      {loading && recordId ? (
        <p role="status">正在读取…</p>
      ) : article ? (
        <form
          className="geo-workspace__panel geo-workspace__form geo-article"
          onSubmit={(e) => void save(e, true)}
        >
          <fieldset disabled={busy}>
            <p className="geo-workspace__hint">
              {article.task_id
                ? `问题：${article.context.question.original}　任务修订：${article.task_version}`
                : `直接创作 · 主题：${article.context.question.original}`}
              　方向：{article.context.direction}　文章修订：{article.version}　已保存状态：
              {article.status === 'ready' ? '可发布' : '待编辑'}
              {dirty ? ' · 有未保存修改' : ''}
            </p>
            <div className="geo-workspace__field">
              <label htmlFor="article-title">文章标题</label>
              <input
                id="article-title"
                required
                maxLength={180}
                value={form.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </div>
            <div className="geo-workspace__field">
              <label htmlFor="article-summary">摘要</label>
              <textarea
                id="article-summary"
                maxLength={1600}
                rows={3}
                value={form.summary}
                onChange={(e) => change({ summary: e.target.value })}
              />
            </div>
            <GeoRichTextToolbar
              editorRef={editor}
              disabled={busy}
              onChange={(html) => change({ html })}
              sources={
                article.context.writingMode
                  ? []
                  : article.context.sources.map((source) => ({
                      url: source.url,
                      title: source.title,
                    }))
              }
              images={article.context.materialGroup.images.map((image) => ({
                url: image.url,
                alt: image.alt,
                label: image.alt || image.filename,
              }))}
            />
            <div
              ref={editor}
              role="textbox"
              aria-label="文章正文"
              aria-multiline
              contentEditable={!busy}
              suppressContentEditableWarning
              className="geo-article__body"
              dir="auto"
              onInput={() => change({ html: editor.current?.innerHTML || '' })}
              onPaste={paste}
              onDrop={(e) => e.preventDefault()}
            />
            {!!article.validation.length && (
              <div className="geo-workspace__error">
                <strong>当前修订待处理</strong>
                <ul>
                  {article.validation.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {!!article.review_note && (
              <p className="geo-workspace__hint">当前修订核查说明：{article.review_note}</p>
            )}
            <KnowledgeEvidence context={article.context} companySlug={company.slug} />
            {!article.context.writingMode && (
              <details>
                <summary>来源依据</summary>
                {article.context.sources.map((s) => (
                  <article key={s.url} className="geo-article__source">
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                    <p>{s.excerpt}</p>
                    <small>
                      {s.checked_at
                        ? `检查时间：${new Date(s.checked_at).toLocaleString()}`
                        : '待重新核查'}
                    </small>
                  </article>
                ))}
              </details>
            )}
            <details>
              <summary>文章历史修订</summary>
              <div className="geo-article__history">
                {revisions.map((revision) => (
                  <div key={revision.version}>
                    <span>
                      修订 {revision.version} · {new Date(revision.created_at).toLocaleString()}
                    </span>
                    {revision.version !== article.version && (
                      <button
                        className="geo-workspace__link"
                        type="button"
                        onClick={() => void restore(revision.version)}
                      >
                        填入此版本正文
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </fieldset>
          <footer>
            {article.status === 'ready' && !dirty && (
              <Link
                className="geo-workspace__button"
                href={`/workspace/${company.slug}/geo/publish?articleID=${article.id}`}
              >
                选择发布目标
              </Link>
            )}
            <button type="submit" className="geo-workspace__button is-primary" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </footer>
        </form>
      ) : (
        !recordId && (
          <div className="geo-workspace__panel geo-records">
            <div className="geo-workspace__toolbar geo-records__filters">
              <label className="geo-records__search">
                <input
                  aria-label="搜索文章标题"
                  placeholder="请输入文章标题"
                  value={q}
                  maxLength={100}
                  onChange={(event) => {
                    setQ(event.target.value)
                    setPage(1)
                  }}
                />
                <Search size={16} aria-hidden="true" />
              </label>
              <label className="geo-records__search">
                <input
                  aria-label="搜索创作任务名称"
                  placeholder="请输入创作任务名称"
                  value={taskName}
                  maxLength={100}
                  onChange={(event) => {
                    setTaskName(event.target.value)
                    setPage(1)
                  }}
                />
                <Search size={16} aria-hidden="true" />
              </label>
              <select
                aria-label="发布状态"
                value={use}
                onChange={(event) => {
                  setUse(event.target.value as GeoArticleUseFilter)
                  setPage(1)
                }}
              >
                <option value="all">请选择状态</option>
                <option value="unused">未发布</option>
                <option value="published">已发布</option>
                <option value="occupied">已占用</option>
              </select>
            </div>
            {loading && <p role="status">正在读取…</p>}

            <div
              className="geo-workspace__table-scroll"
              role="region"
              aria-label="创作记录列表，可横向滚动查看全部字段"
              tabIndex={0}
            >
              <table className="geo-records__table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>问题</th>
                    <th>创作方向</th>
                    <th>文章标题</th>
                    <th>是否发布过</th>
                    <th>生成来源</th>
                    <th>生成时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>
                        <span className="geo-records__cell-text" title={item.question}>
                          {item.question}
                        </span>
                      </td>
                      <td>
                        <span className="geo-records__cell-text" title={item.direction}>
                          {item.direction}
                        </span>
                      </td>
                      <td>
                        <span className="geo-records__cell-text" title={item.title}>
                          {item.title}
                        </span>
                      </td>
                      <td>
                        <span className={`geo-records__status is-${item.publication_status}`}>
                          {
                            { unused: '未发布', occupied: '已占用', published: '已发布' }[
                              item.publication_status
                            ]
                          }
                        </span>
                      </td>
                      <td>
                        {item.task_id ? (
                          <Link
                            className="geo-records__cell-text"
                            title={item.task_name}
                            href={`/workspace/${company.slug}/geo/creation/${item.task_id}`}
                          >
                            {item.task_name}
                          </Link>
                        ) : (
                          <span className="geo-records__cell-text">
                            {item.task_name || '直接创作'}
                          </span>
                        )}
                      </td>
                      <td>
                        <time dateTime={item.created_at}>
                          {new Date(item.created_at).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </time>
                      </td>
                      <td>
                        <div className="geo-creation__row-actions geo-records__actions">
                          <button
                            type="button"
                            className="geo-workspace__link"
                            onClick={() => void openPreview(item.id)}
                          >
                            查看
                          </button>
                          <Link href={`${base}/${item.id}`}>修改</Link>
                          {item.status === 'ready' &&
                          item.locale === company.defaultLocale &&
                          item.publication_status === 'unused' ? (
                            <Link
                              href={`/workspace/${company.slug}/geo/publish?articleID=${item.id}`}
                            >
                              发布
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className="geo-workspace__link"
                              disabled
                              title={
                                item.status !== 'ready'
                                  ? '请先修改文章并完成来源核查'
                                  : item.locale !== company.defaultLocale
                                    ? '本站当前只发布默认语言文章'
                                    : '这篇文章已发布或已有发布请求'
                              }
                            >
                              发布
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !items.length && (
              <div className="geo-workspace__empty">
                <strong>暂无创作记录</strong>
              </div>
            )}
            <div className="geo-workspace__pager">
              <label>
                每页
                <select
                  aria-label="创作记录每页条数"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                条
              </label>
              <span>共 {total} 条</span>
              <button
                className="geo-workspace__button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                上一页
              </button>
              <span>
                {page} / {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <button
                className="geo-workspace__button"
                disabled={page * pageSize >= total}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
              <label>
                前往
                <input
                  aria-label="前往创作记录页码"
                  type="number"
                  min={1}
                  max={Math.max(1, Math.ceil(total / pageSize))}
                  value={page}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    const pageCount = Math.max(1, Math.ceil(total / pageSize))
                    if (Number.isSafeInteger(value) && value >= 1 && value <= pageCount)
                      setPage(value)
                  }}
                />
                页
              </label>
            </div>
          </div>
        )
      )}
      <dialog
        ref={previewDialog}
        className="geo-published-preview geo-records__drawer"
        aria-labelledby="geo-creation-preview-title"
        onClose={() => previewRequest.current?.abort()}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="geo-published-preview__surface">
          <header className="geo-published-preview__header">
            <h2 id="geo-creation-preview-title">查看文章</h2>
            <button
              type="button"
              aria-label="关闭查看文章"
              onClick={() => previewDialog.current?.close()}
            >
              <X size={22} />
            </button>
          </header>
          <div className="geo-published-preview__body">
            {previewLoading ? (
              <p role="status">正在读取文章…</p>
            ) : (
              previewArticle && (
                <>
                  <div className="geo-published-preview__title">
                    <h2>{previewArticle.title}</h2>
                    <button type="button" onClick={() => void copyPreview()}>
                      <Copy size={16} /> {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                  <article
                    ref={previewContent}
                    className="geo-published-preview__content"
                    dir="auto"
                    dangerouslySetInnerHTML={{
                      __html: cleanGeoArticleHTML(
                        previewArticle.html,
                        previewArticle.context.sources,
                        previewArticle.context.materialGroup.images,
                        previewArticle.context.publicationLinks,
                      ).html,
                    }}
                  />
                  <KnowledgeEvidence context={previewArticle.context} companySlug={company.slug} />
                </>
              )
            )}
          </div>
          {previewArticle && (
            <footer className="geo-records__drawer-count">
              <strong>
                {previewArticle.html.replace(/<[^>]*>/gu, '').replace(/\s/gu, '').length}
              </strong>{' '}
              字
            </footer>
          )}
        </div>
      </dialog>
    </section>
  )
}
