'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import type { WorkspaceCompany } from '@/platform/workspace'
import type { DetectionJob, DetectionRun } from '@/platform/geo/detection'
import './geo-detection.scss'

type Config = { id: string; brand: string; core: string; version: number }
type Detail = { run: DetectionRun; jobs: DetectionJob[] }
const date = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
async function read(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || '暂时无法保存，请重试。')
  return body
}

export function GeoDetection({ company }: { company: WorkspaceCompany }) {
  const base = `/api/workspace/${encodeURIComponent(company.slug)}/geo/detection`
  const [configs, setConfigs] = useState<Config[]>([])
  const [configID, setConfigID] = useState('')
  const [runs, setRuns] = useState<DetectionRun[]>([])
  const [total, setTotal] = useState(0),
    [page, setPage] = useState(1)
  const [name, setName] = useState(`${company.name} · 存储验收`)
  const [questions, setQuestions] = useState('哪些厂家提供六角头螺栓？\n高强度螺栓供应商如何选择？')
  const [queryType, setQueryType] = useState('discovery')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [jobID, setJobID] = useState<string | null>(null)
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const creation = useRef<{ body: string; requestID: string } | null>(null)
  const fixtures = useRef(new Map<string, string>())
  const detailRequest = useRef(0)
  const selectedJob = detail?.jobs.find((job) => job.id === jobID)
  const config = configs.find((item) => item.id === configID)

  const refresh = async () => {
    const result = await read(`${base}?page=${page}`)
    setRuns(result.items)
    setTotal(result.total)
    setConfigs(result.configs)
    setConfigID((current) =>
      result.configs.some((item: Config) => item.id === current)
        ? current
        : result.configs[0]?.id || '',
    )
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    void read(`${base}?page=${page}`)
      .then((result) => {
        if (!active) return
        setRuns(result.items)
        setTotal(result.total)
        setConfigs(result.configs)
        setConfigID((current) => current || result.configs[0]?.id || '')
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [base, page])

  useEffect(() => {
    if (selectedJob && !dialog.current?.open) dialog.current?.showModal()
    if (!selectedJob && dialog.current?.open) dialog.current.close()
  }, [selectedJob])

  const openRun = async (id: string) => {
    const sequence = ++detailRequest.current
    setError('')
    try {
      const result = await read(`${base}?runID=${encodeURIComponent(id)}`)
      if (sequence === detailRequest.current) {
        setDetail(result)
        setJobID(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败。')
    }
  }
  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!config || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        action: 'create',
        name,
        optimizationID: config.id,
        optimizationVersion: config.version,
        questions: questions
          .split(/\r?\n/u)
          .map((question) => question.trim())
          .filter(Boolean)
          .map((question) => ({ question, queryType, language: 'zh' })),
      }
      const signature = JSON.stringify(body)
      if (creation.current?.body !== signature)
        creation.current = { body: signature, requestID: crypto.randomUUID() }
      const result = await read(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestID: creation.current.requestID }),
      })
      creation.current = null
      if (page !== 1) setPage(1)
      await refresh()
      await openRun(result.id)
      setNotice('任务和问题快照已保存。尚未调用任何AI平台。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务保存失败，输入已保留。')
    } finally {
      setBusy(false)
    }
  }
  const saveFixture = async (job: DetectionJob) => {
    if (!detail || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    if (!fixtures.current.has(job.id)) fixtures.current.set(job.id, crypto.randomUUID())
    try {
      await read(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_fixture',
          jobID: job.id,
          requestID: fixtures.current.get(job.id),
        }),
      })
      const result = await read(`${base}?runID=${detail.run.id}`)
      setDetail(result)
      await refresh()
      setNotice('本地验收证据已保存，可以查看原文、示例引用和下载文件。该记录不计入GEO报表。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '证据保存失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="geo-detection" aria-labelledby="geo-detection-title">
      <header className="geo-detection__heading">
        <div>
          <h1 id="geo-detection-title">检测任务与证据</h1>
          <p>{company.name}</p>
        </div>
        <Link href={`/workspace/${company.slug}/geo/visibility`}>返回 GEO 报表</Link>
      </header>
      <div className="geo-detection__notice">
        <strong>第一步 · 本地存储验收</strong>
        <p>
          本步验证任务保存、问题快照和证据查阅，不调用AI平台。
          验收样本均明确标记，不作为真实收录或计入GEO效果。
        </p>
      </div>
      {error && (
        <p className="geo-detection__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="geo-detection__success" role="status">
          {notice}
        </p>
      )}
      <form className="geo-detection__panel" onSubmit={create}>
        <h2>创建本地验收任务</h2>
        <div className="geo-detection__fields">
          <label>
            任务名称
            <input
              value={name}
              maxLength={100}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            优化词配置
            <select value={configID} required onChange={(event) => setConfigID(event.target.value)}>
              {!configs.length && <option value="">暂无配置</option>}
              {configs.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.brand} · {item.core} · 版本 {item.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            问题类型
            <select value={queryType} onChange={(e) => setQueryType(e.target.value)}>
              <option value="discovery">非品牌发现</option>
              <option value="brand_self">品牌自查</option>
            </select>
          </label>
        </div>
        <label>
          待检测问题（中文，每行一个，最多20个）
          <textarea
            value={questions}
            rows={4}
            required
            onChange={(event) => setQuestions(event.target.value)}
          />
        </label>
        <p className="geo-detection__muted">
          任务会保留当前配置和问题原文，后续修改配置不会改变已保存的快照。
        </p>
        <button type="submit" className="is-primary" disabled={busy || loading || !config}>
          {busy ? '正在保存…' : '保存验收任务'}
        </button>
        {!loading && !configs.length && <p>请先在 GEO 优化词中保存当前公司的配置。</p>}
      </form>
      <section className="geo-detection__panel" aria-labelledby="geo-detection-runs">
        <div className="geo-detection__section-heading">
          <h2 id="geo-detection-runs">
            已保存任务 <small>共 {total} 个</small>
          </h2>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => {
              setError('')
              void refresh().catch((e) => setError(e.message))
            }}
          >
            刷新
          </button>
        </div>
        {loading ? (
          <p role="status">正在读取任务…</p>
        ) : !runs.length ? (
          <p>还没有本地验收任务。</p>
        ) : (
          <div
            className="geo-detection__table-scroll"
            tabIndex={0}
            role="region"
            aria-label="检测任务表格"
          >
            <table>
              <thead>
                <tr>
                  <th>任务名称</th>
                  <th>配置版本</th>
                  <th>问题数</th>
                  <th>证据已保存</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      {run.name}
                      <span className="geo-detection__tag">本地验收</span>
                    </td>
                    <td>
                      {run.brand} · v{run.optimizationVersion}
                    </td>
                    <td>{run.total}</td>
                    <td>
                      {run.saved} / {run.total}
                    </td>
                    <td>{date(run.createdAt)}</td>
                    <td>
                      <button type="button" onClick={() => void openRun(run.id)}>
                        查看任务
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="geo-detection__pagination" aria-label="任务分页">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            第 {page} / {Math.max(1, Math.ceil(total / 20))} 页
          </span>
          <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
            下一页
          </button>
        </nav>
      </section>
      {detail && (
        <section className="geo-detection__panel" aria-labelledby="geo-detection-detail">
          <h2 id="geo-detection-detail">{detail.run.name}</h2>
          <p className="geo-detection__muted">
            任务编号：{detail.run.id} · 配置版本 {detail.run.optimizationVersion}
          </p>
          <ol className="geo-detection__jobs">
            {detail.jobs.map((job) => (
              <li key={job.id}>
                <div>
                  <strong>{job.question.question}</strong>
                  <p>
                    {job.question.queryType === 'discovery' ? '非品牌发现' : '品牌自查'} · 中文 ·{' '}
                    {job.state === 'evidence_saved'
                      ? '已保存本地验收证据'
                      : '待保存证据，未执行检测'}
                  </p>
                </div>
                {job.attempt ? (
                  <button onClick={() => setJobID(job.id)}>查看证据</button>
                ) : (
                  <button disabled={busy} onClick={() => void saveFixture(job)}>
                    保存本地验收样本
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <dialog
        ref={dialog}
        className="geo-detection__dialog"
        aria-labelledby="geo-evidence-title"
        onCancel={() => setJobID(null)}
        onClose={() => setJobID(null)}
      >
        {selectedJob?.attempt && (
          <>
            <header>
              <div>
                <h2 id="geo-evidence-title">原始证据</h2>
                <span className="geo-detection__tag">本地样本 · 非真实AI回答</span>
              </div>
              <button autoFocus aria-label="关闭证据详情" onClick={() => setJobID(null)}>
                关闭
              </button>
            </header>
            <div className="geo-detection__evidence-body">
              <h3>检测问题</h3>
              <p>{selectedJob.question.question}</p>
              <p>保存时间：{date(selectedJob.attempt.createdAt)}</p>
              <h3>保存的原始回答</h3>
              <pre>{selectedJob.attempt.rawAnswer}</pre>
              <h3>示例引用及对应原文</h3>
              <p className="geo-detection__muted">以下为存储验收构造的引用，不代表AI实际引用。</p>
              {selectedJob.attempt.citations.map((citation) => (
                <div className="geo-detection__citation" key={citation.id}>
                  <strong>{citation.title}</strong>
                  <p>
                    <code>{citation.url}</code>
                  </p>
                  <blockquote>{citation.quotedSegment}</blockquote>
                  <small>
                    原始响应位置：{citation.providerPointer} · 原文位置 {citation.start}–
                    {citation.end}（UTF-16）
                  </small>
                </div>
              ))}
              <h3>私有证据文件</h3>
              <p>下载时会重新校验文件摘要，文件只在当前公司权限内提供。</p>
              {selectedJob.attempt.artifacts.map((artifact) => (
                <div className="geo-detection__artifact" key={artifact.id}>
                  <strong>{artifact.kind === 'request' ? '原始请求 JSON' : '原始响应 JSON'}</strong>
                  <p>{artifact.byteLength} 字节</p>
                  <code>SHA-256：{artifact.sha256}</code>
                  <a href={`${base}/evidence/${artifact.id}`} download>
                    下载{artifact.kind === 'request' ? '请求' : '响应'}文件
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </dialog>
    </section>
  )
}
