'use client'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { FileText, FolderOpen, Search, Upload, X, Plus, Download } from 'lucide-react'
import type { WorkspaceCompany } from '@/platform/workspace'
import type {
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeHit,
} from '@/platform/knowledge/types'
import { showWorkspaceError } from '../TransientNotice/WorkspaceFeedback'
import './knowledge-workspace.scss'
const formatBytes = (raw: number) =>
  raw < 1024
    ? `${raw} B`
    : raw < 1024 * 1024
      ? `${(raw / 1024).toFixed(1)} KB`
      : `${(raw / 1024 / 1024).toFixed(1)} MB`
async function readJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || '操作失败，请重试。')
  return result
}
export function KnowledgeWorkspace({
  company,
  initialDocumentID,
}: {
  company: WorkspaceCompany
  initialDocumentID?: string
}) {
  const endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/knowledge`
  const [base, setBase] = useState<KnowledgeBase | null>(null),
    [documents, setDocuments] = useState<KnowledgeDocument[]>([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [tab, setTab] = useState<'files' | 'segments' | 'search'>('files')
  const [selected, setSelected] = useState<KnowledgeDocument | null>(null),
    [chunks, setChunks] = useState<KnowledgeChunk[]>([]),
    [text, setText] = useState(''),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<{ name: string; state: string }[]>([]),
    [question, setQuestion] = useState(''),
    [hits, setHits] = useState<KnowledgeHit[]>([]),
    [searched, setSearched] = useState(false)
  const [name, setName] = useState(`${company.name}知识库`),
    [intro, setIntro] = useState(''),
    [textTitle, setTextTitle] = useState(''),
    [newText, setNewText] = useState('')
  const baseModal = useRef<HTMLDialogElement>(null),
    textModal = useRef<HTMLDialogElement>(null),
    uploadInput = useRef<HTMLInputElement>(null),
    alive = useRef(true)
  const load = useCallback(async () => {
    const result = await readJSON(
      `${endpoint}?q=${encodeURIComponent(query)}&archived=${archived ? 1 : 0}`,
    )
    if (!alive.current) return
    setBase(result.base)
    setDocuments(result.documents)
    setLoading(false)
  }, [endpoint, query, archived])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => {
      void load().catch((e) => {
        if (alive.current) {
          showWorkspaceError(e.message)
          setLoading(false)
        }
      })
    }, 180)
    return () => clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return
    const timer = setInterval(() => void load().catch(() => {}), 2500)
    return () => clearInterval(timer)
  }, [documents, load])
  useEffect(() => {
    if (!initialDocumentID) return
    void readJSON(`${endpoint}/${encodeURIComponent(initialDocumentID)}`)
      .then((result) => {
        if (!alive.current) return
        setSelected(result.document)
        setText(result.document.text_content)
        setChunks(result.chunks)
        setTab('segments')
      })
      .catch((e) => {
        if (alive.current) showWorkspaceError(e.message)
      })
  }, [initialDocumentID, endpoint])
  const json = (body: unknown, method = 'POST') => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  async function action(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      showWorkspaceError(e instanceof Error ? e.message : '操作失败，请重试。')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  async function detail(doc: KnowledgeDocument) {
    await action(async () => {
      const result = await readJSON(`${endpoint}/${doc.id}`)
      if (!alive.current) return
      setSelected(result.document)
      setText(result.document.text_content)
      setChunks(result.chunks)
      setEditing(false)
      setTab('segments')
    })
  }
  async function upload(files: File[]) {
    if (!files.length || busy) return
    setBusy(true)
    setUploading(files.map((f) => ({ name: f.name, state: '等待上传' })))
    for (const [index, file] of files.entries()) {
      if (!alive.current) break
      setUploading((items) =>
        items.map((item, i) => (i === index ? { ...item, state: '解析中…' } : item)),
      )
      try {
        const form = new FormData()
        form.append('file', file)
        const result = await readJSON(endpoint, { method: 'POST', body: form })
        if (!alive.current) break
        setUploading((items) =>
          items.map((item, i) =>
            i === index
              ? {
                  ...item,
                  state: result.duplicate ? '已存在' : `已入库 · ${result.document.chunks}个分段`,
                }
              : item,
          ),
        )
      } catch (e) {
        if (!alive.current) break
        setUploading((items) =>
          items.map((item, i) =>
            i === index ? { ...item, state: e instanceof Error ? e.message : '上传失败' } : item,
          ),
        )
      }
    }
    if (alive.current) {
      await load().catch((e) => showWorkspaceError(e.message))
      setBusy(false)
      setNotice('上传完成')
    }
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (base) void upload(Array.from(event.dataTransfer.files))
  }
  const visibleDocuments = documents.filter(
    (d) => !query || `${d.title} ${d.filename}`.toLowerCase().includes(query.toLowerCase()),
  )
  const openBase = () => {
    setName(base?.name || `${company.name}知识库`)
    setIntro(base?.intro || '')
    baseModal.current?.showModal()
  }
  return (
    <section className="knowledge-workspace">
      <header className="knowledge-workspace__header">
        <div>
          <h1>企业知识库</h1>
          <p>管理企业资料，为文章创作提供依据。</p>
        </div>
        <div className="knowledge-workspace__actions">
          {base ? (
            <>
              <button type="button" onClick={openBase}>
                编辑知识库
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={busy}
                onClick={() => uploadInput.current?.click()}
              >
                <Upload size={16} />
                上传文件
              </button>
            </>
          ) : (
            <button type="button" className="is-primary" onClick={openBase}>
              <Plus size={16} />
              创建知识库
            </button>
          )}
        </div>
      </header>
      <input
        type="file"
        accept=".docx,.txt,.md,.xlsx,.csv"
        multiple
        hidden
        ref={uploadInput}
        aria-label="选择电脑上的企业资料"
        onChange={(event) => {
          void upload(Array.from(event.target.files || []))
          event.target.value = ''
        }}
      />
      {notice && (
        <div role="status" className="knowledge-workspace__notice">
          {notice}
        </div>
      )}
      {loading ? (
        <div className="knowledge-workspace__empty" role="status">
          正在读取知识库…
        </div>
      ) : !base ? (
        <div className="knowledge-workspace__empty">
          <FolderOpen size={40} />
          <h2>建立当前公司的知识库</h2>
          <p>上传企业介绍、产品资料、证书、案例与服务说明。</p>
          <button type="button" className="is-primary" onClick={openBase}>
            创建知识库
          </button>
        </div>
      ) : (
        <>
          <div className="knowledge-workspace__overview">
            <div className="knowledge-workspace__base-icon">
              <FolderOpen size={26} />
            </div>
            <div>
              <h2>{base.name}</h2>
              <p>{base.intro || '企业介绍、产品、资质、案例和服务资料'}</p>
              <small>
                {base.documents}个文件 <span>·</span> {base.chunks}个分段 <span>·</span>{' '}
                {formatBytes(Number(base.bytes))}
              </small>
            </div>
            <label className="knowledge-workspace__switch">
              <input
                type="checkbox"
                checked={base.enabled}
                disabled={busy}
                onChange={(event) =>
                  void action(async () => {
                    await readJSON(
                      endpoint,
                      json(
                        {
                          name: base.name,
                          intro: base.intro,
                          version: base.version,
                          enabled: event.target.checked,
                        },
                        'PUT',
                      ),
                    )
                    await load()
                    setNotice('已保存')
                  })
                }
              />
              {base.enabled ? '已开启' : '已停用'}
            </label>
          </div>
          <nav className="knowledge-workspace__tabs" aria-label="知识库功能">
            {[
              ['files', '文件管理'],
              ['segments', '分段管理'],
              ['search', '检索测试'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-current={tab === value ? 'page' : undefined}
                className={tab === value ? 'is-active' : ''}
                onClick={() => {
                  setTab(value as typeof tab)
                  setEditing(false)
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'files' && (
            <>
              <div className="knowledge-workspace__toolbar">
                <label className="knowledge-workspace__search">
                  <Search size={16} />
                  <input
                    aria-label="搜索资料文件"
                    placeholder="搜索文件名称"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="knowledge-workspace__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setTextTitle('')
                      setNewText('')
                      textModal.current?.showModal()
                    }}
                  >
                    <Plus size={15} />
                    添加文本
                  </button>
                  <button type="button" onClick={() => setArchived((v) => !v)}>
                    {archived ? '返回文件列表' : '已移除文件'}
                  </button>
                </div>
              </div>
              {!archived && (
                <div
                  className={`knowledge-workspace__drop ${dragging ? 'is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={drop}
                >
                  <Upload size={24} />
                  <div>
                    <button
                      type="button"
                      className="is-link"
                      disabled={busy}
                      onClick={() => uploadInput.current?.click()}
                    >
                      选择电脑文件
                    </button>
                    ，或拖拽文件到这里<p>DOCX / TXT / Markdown / XLSX / CSV</p>
                  </div>
                </div>
              )}
              {!!uploading.length && (
                <ul className="knowledge-workspace__progress" aria-live="polite">
                  {uploading.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <FileText size={15} />
                      <span>{file.name}</span>
                      <small>{file.state}</small>
                    </li>
                  ))}
                </ul>
              )}
              <div className="knowledge-workspace__table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>文件名称</th>
                      <th>大小</th>
                      <th>分段</th>
                      <th>状态</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDocuments.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className="knowledge-workspace__filename">
                            <FileText size={18} />
                            <button
                              type="button"
                              className="is-link"
                              onClick={() => void detail(doc)}
                            >
                              {doc.filename}
                            </button>
                          </div>
                          {doc.error && (
                            <small className="knowledge-workspace__file-error">{doc.error}</small>
                          )}
                        </td>
                        <td>{formatBytes(doc.bytes)}</td>
                        <td>{doc.chunks}</td>
                        <td>
                          <span
                            className={`knowledge-workspace__state ${doc.status === 'failed' ? 'is-error' : ''}`}
                          >
                            {doc.status === 'processing'
                              ? '解析中'
                              : doc.status === 'failed'
                                ? '解析失败'
                                : doc.enabled
                                  ? '可用'
                                  : '已停用'}
                          </span>
                        </td>
                        <td>
                          {new Date(doc.updated_at).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td>
                          <div className="knowledge-workspace__actions">
                            {archived ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void action(async () => {
                                    await readJSON(
                                      `${endpoint}/${doc.id}`,
                                      json({ version: doc.version, archived: false }, 'PATCH'),
                                    )
                                    await load()
                                    setNotice('已恢复')
                                  })
                                }
                              >
                                恢复
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="is-link"
                                  disabled={busy}
                                  onClick={() => void detail(doc)}
                                >
                                  查看分段
                                </button>
                                {doc.status === 'failed' ? (
                                  <button
                                    type="button"
                                    className="is-link"
                                    disabled={busy}
                                    onClick={() =>
                                      void action(async () => {
                                        await readJSON(
                                          `${endpoint}/${doc.id}`,
                                          json({ action: 'retry' }, 'PATCH'),
                                        )
                                        await load()
                                      })
                                    }
                                  >
                                    重新解析
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="is-link"
                                    disabled={busy}
                                    onClick={() =>
                                      void action(async () => {
                                        await readJSON(
                                          `${endpoint}/${doc.id}`,
                                          json(
                                            { version: doc.version, enabled: !doc.enabled },
                                            'PATCH',
                                          ),
                                        )
                                        await load()
                                        setNotice('已保存')
                                      })
                                    }
                                  >
                                    {doc.enabled ? '停用' : '启用'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="is-link"
                                  disabled={busy}
                                  onClick={() =>
                                    void action(async () => {
                                      await readJSON(
                                        `${endpoint}/${doc.id}`,
                                        json({ version: doc.version, archived: true }, 'PATCH'),
                                      )
                                      await load()
                                      setNotice('已移除，可恢复')
                                    })
                                  }
                                >
                                  移除
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!visibleDocuments.length && (
                      <tr>
                        <td colSpan={6} className="knowledge-workspace__empty">
                          {archived ? '暂无已移除文件' : '暂无资料，请上传文件或添加文本。'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'segments' && (
            <div className="knowledge-workspace__segments">
              <aside>
                <label className="knowledge-workspace__search">
                  <Search size={16} />
                  <input
                    aria-label="筛选分段文件"
                    placeholder="搜索文件"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                {visibleDocuments
                  .filter((d) => d.status === 'ready')
                  .map((doc) => (
                    <button
                      type="button"
                      key={doc.id}
                      className={selected?.id === doc.id ? 'is-selected' : ''}
                      onClick={() => void detail(doc)}
                    >
                      <FileText size={16} />
                      <span>{doc.filename}</span>
                      <small>{doc.chunks}</small>
                    </button>
                  ))}
              </aside>
              <div className="knowledge-workspace__segment-content">
                {!selected ? (
                  <div className="knowledge-workspace__empty">选择左侧文件查看分段</div>
                ) : (
                  <>
                    <header>
                      <div>
                        <h2>{selected.filename}</h2>
                        <p>
                          {chunks.length}个分段 · 文本版本 {selected.version}
                        </p>
                      </div>
                      <div className="knowledge-workspace__actions">
                        <a href={`${endpoint}/${selected.id}?download=1`}>
                          <Download size={15} />
                          原文件
                        </a>
                        <button type="button" onClick={() => setEditing((v) => !v)}>
                          {editing ? '取消编辑' : '编辑内容'}
                        </button>
                      </div>
                    </header>
                    {editing ? (
                      <>
                        <textarea
                          aria-label="资料全文"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          rows={22}
                        />
                        <button
                          type="button"
                          className="is-primary"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await readJSON(
                                `${endpoint}/${selected.id}`,
                                json(
                                  { action: 'content', version: selected.version, text },
                                  'PATCH',
                                ),
                              )
                              const result = await readJSON(`${endpoint}/${selected.id}`)
                              setSelected(result.document)
                              setChunks(result.chunks)
                              setText(result.document.text_content)
                              setEditing(false)
                              await load()
                              setNotice('已保存')
                            })
                          }
                        >
                          保存并更新分段
                        </button>
                      </>
                    ) : (
                      chunks.map((chunk) => (
                        <article className="knowledge-workspace__chunk" key={chunk.id}>
                          <header>
                            <strong>分段 {chunk.ordinal + 1}</strong>
                            <small>{chunk.content.length}字符</small>
                          </header>
                          <h3>{chunk.heading}</h3>
                          <p>{chunk.content}</p>
                        </article>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {tab === 'search' && (
            <div className="knowledge-workspace__retrieval">
              <h2>用一个问题检查知识库</h2>
              <p>查看文章创作时能找到哪些企业原文。</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void action(async () => {
                    const result = await readJSON(
                      endpoint,
                      json({ action: 'search', query: question }),
                    )
                    setHits(result.hits)
                    setSearched(true)
                  })
                }}
              >
                <input
                  aria-label="知识库检索问题"
                  placeholder="例如：高强度螺栓的起订量和交货周期是多少？"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button type="submit" className="is-primary" disabled={busy || !question.trim()}>
                  {busy ? '检索中…' : '检索'}
                </button>
              </form>
              {searched && !hits.length && (
                <div className="knowledge-workspace__empty">
                  没有命中相关资料，可以换一个问题或补充资料。
                </div>
              )}
              {hits.map((hit, index) => (
                <article className="knowledge-workspace__hit" key={hit.id}>
                  <header>
                    <strong>
                      {index + 1}. {hit.filename}
                    </strong>
                    <small>分段 {hit.ordinal + 1}</small>
                  </header>
                  <h3>{hit.heading}</h3>
                  {hit.reason && <p className="knowledge-workspace__hit-reason">{hit.reason}</p>}
                  <p>{hit.content}</p>
                  <button
                    type="button"
                    className="is-link"
                    onClick={() => {
                      const doc = documents.find((d) => d.id === hit.document_id)
                      if (doc) void detail(doc)
                    }}
                  >
                    查看原文 →
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <dialog ref={baseModal} className="knowledge-workspace__modal">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void action(async () => {
              await readJSON(
                endpoint,
                json(
                  { name, intro, enabled: base?.enabled ?? true, version: base?.version },
                  'PUT',
                ),
              )
              baseModal.current?.close()
              await load()
              setNotice('已保存')
            })
          }}
        >
          <header>
            <h2>{base ? '编辑知识库' : '创建知识库'}</h2>
            <button
              type="button"
              aria-label="关闭知识库设置"
              onClick={() => baseModal.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          <label>
            知识库名称
            <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            知识库介绍
            <textarea
              rows={3}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="用于哪些产品、业务或文章"
            />
          </label>
          <footer>
            <button type="button" onClick={() => baseModal.current?.close()}>
              取消
            </button>
            <button type="submit" className="is-primary" disabled={busy}>
              保存
            </button>
          </footer>
        </form>
      </dialog>
      <dialog
        ref={textModal}
        className="knowledge-workspace__modal knowledge-workspace__modal--wide"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void action(async () => {
              await readJSON(endpoint, json({ action: 'text', title: textTitle, text: newText }))
              textModal.current?.close()
              await load()
              setNotice('已入库')
            })
          }}
        >
          <header>
            <h2>添加文本资料</h2>
            <button
              type="button"
              aria-label="关闭添加文本"
              onClick={() => textModal.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          <label>
            资料标题
            <input
              autoFocus
              required
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
            />
          </label>
          <label>
            资料内容
            <textarea
              required
              rows={14}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="粘贴企业介绍、产品规格、资质、案例或服务说明"
            />
          </label>
          <footer>
            <button type="button" onClick={() => textModal.current?.close()}>
              取消
            </button>
            <button type="submit" className="is-primary" disabled={busy}>
              保存入库
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  )
}
