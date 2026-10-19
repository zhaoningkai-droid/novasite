'use client'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import { localeOptions } from '@/platform/site-locales'
import { geoAliasMatches, normalizeGeoText, type GeoKeyword } from '@/platform/geo/keywords'
import type { GeoObservation, GeoTrackedQuestion } from '@/platform/geo/visibility'
import './geo-workspace.scss'

type QuestionSet = { version: number; questions: GeoTrackedQuestion[]; updatedAt: string | null }
type ConfigList = {
  id: string
  brand: string
  core: string
  terms: string[]
  aliases: string[]
  version: number
}
type SourcePage = {
  url: string
  kind: 'site' | 'blog'
  title: string
  excerpt: string
  terms: string[]
  status: 'available' | 'pending' | 'invalid'
  reason: string
  checked_at: string | null
}
type SampleForm = {
  platform: string
  model: string
  browsingMode: 'connected' | 'disconnected' | 'unknown'
  language: string
  region: string
  outcome: 'answered' | 'failed'
  rawAnswer: string
  groundingQueries: string
  citationURLs: string
  recommendationContext: string
  failureMessage: string
}
const blankSample = (language = 'zh'): SampleForm => ({
  platform: 'ChatGPT',
  model: '',
  browsingMode: 'connected',
  language,
  region: 'GLOBAL',
  outcome: 'answered',
  rawAnswer: '',
  groundingQueries: '',
  citationURLs: '',
  recommendationContext: 'not_applicable',
  failureMessage: '',
})
const queryTypeLabel: Record<string, string> = { brand_self: '品牌自查', discovery: '非品牌发现' }
const resultLabel: Record<string, string> = {
  detected: '已提及公司',
  not_mentioned: '答案未提及',
  failed: '检测失败',
}
const contextLabel: Record<string, string> = {
  recommended: '正向推荐',
  mentioned: '中性提及',
  not_recommended: '负向评价',
  unclear: '语境不明确',
  not_applicable: '未命中公司名称',
}
const displayTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const readJSON = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { cache: 'no-store', ...init }),
    body = await response.json()
  if (!response.ok) throw new Error(body.message || '操作失败，请重试。')
  return body
}

export function GeoVisibility({ company }: { company: WorkspaceCompany }) {
  const base = `/api/workspace/${encodeURIComponent(company.slug)}/geo`
  const [configs, setConfigs] = useState<ConfigList[]>([]),
    [configID, setConfigID] = useState('')
  const [config, setConfig] = useState<Pick<
    GeoKeyword,
    'id' | 'brand' | 'aliases' | 'core' | 'terms' | 'version'
  > | null>(null)
  const [questionSet, setQuestionSet] = useState<QuestionSet>({
    version: 0,
    questions: [],
    updatedAt: null,
  })
  const [observations, setObservations] = useState<GeoObservation[]>([])
  const [sourcePages, setSourcePages] = useState<SourcePage[]>([])
  const [question, setQuestion] = useState(''),
    [queryType, setQueryType] = useState<'brand_self' | 'discovery'>('discovery')
  const [language, setLanguage] = useState('zh'),
    [sampleQuestion, setSampleQuestion] = useState<GeoTrackedQuestion | null>(null)
  const [sample, setSample] = useState<SampleForm>(blankSample()),
    [sampleRequestID, setSampleRequestID] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const questionInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void (async () => {
      const first = await readJSON(`${base}/keywords?page=1`)
      const pages = Math.ceil(first.total / first.pageSize)
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          readJSON(`${base}/keywords?page=${index + 2}`),
        ),
      )
      return [...first.items, ...rest.flatMap((result) => result.items)]
    })()
      .then((items) => {
        if (!active) return
        setConfigs(items as ConfigList[])
        setConfigID((current) =>
          current && items.some((item: ConfigList) => item.id === current)
            ? current
            : items[0]?.id || '',
        )
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
  }, [base])

  useEffect(() => {
    if (!configID) {
      setConfig(null)
      setObservations([])
      setSourcePages([])
      setQuestionSet({ version: 0, questions: [], updatedAt: null })
      return
    }
    let active = true
    setLoading(true)
    setError('')
    void readJSON(`${base}/visibility?optimizationID=${encodeURIComponent(configID)}`)
      .then((result) => {
        if (!active) return
        setConfig(result.config)
        setQuestionSet(result.questionSet)
        setObservations(result.observations)
        setSourcePages(result.sourcePages || [])
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
  }, [base, configID])

  useEffect(() => {
    if (sampleQuestion && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal()
  }, [sampleQuestion])

  const activeQuestions = questionSet.questions
  const byQuestion = useMemo(() => {
    const groups = new Map<string, GeoObservation[]>()
    for (const item of observations)
      groups.set(item.questionID, [...(groups.get(item.questionID) || []), item])
    return groups
  }, [observations])
  const metricsFor = (queryType: GeoTrackedQuestion['queryType']) => {
    const scopedQuestions = activeQuestions.filter((item) => item.queryType === queryType)
    const ids = new Set(scopedQuestions.map((item) => item.id))
    const samples = observations.filter(
      (item) => ids.has(item.questionID) && item.resultState !== 'failed',
    )
    const detected = samples.filter((item) => item.resultState === 'detected').length
    const citations = samples.filter((item) =>
      item.citations.some((citation) => citation.status === 'known_available'),
    ).length
    const covered = new Set(samples.map((item) => item.questionID)).size
    return {
      questionCount: scopedQuestions.length,
      sampleCount: samples.length,
      detected,
      citations,
      covered,
      coverage: samples.length && scopedQuestions.length ? covered / scopedQuestions.length : null,
      mention: samples.length ? detected / samples.length : null,
      citation: samples.length ? citations / samples.length : null,
    }
  }
  const trendFor = (queryType: GeoTrackedQuestion['queryType']) => {
    const ids = new Set(
      activeQuestions.filter((item) => item.queryType === queryType).map((item) => item.id),
    )
    const groups = new Map<string, GeoObservation[]>()
    for (const item of observations.filter((row) => ids.has(row.questionID))) {
      const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
        new Date(item.sampledAt),
      )
      const key = `${day}\t${item.platform}`
      groups.set(key, [...(groups.get(key) || []), item])
    }
    return [...groups.entries()]
      .map(([key, rows]) => {
        const [day, ...platformParts] = key.split('\t'),
          platform = platformParts.join('\t')
        const valid = rows.filter((item) => item.resultState !== 'failed')
        const detected = valid.filter((item) => item.resultState === 'detected').length
        const citations = valid.filter((item) =>
          item.citations.some((citation) => citation.status === 'known_available'),
        ).length
        return {
          day,
          platform,
          valid: valid.length,
          detected,
          citations,
          failed: rows.length - valid.length,
          mentionRate: valid.length ? detected / valid.length : null,
          citationRate: valid.length ? citations / valid.length : null,
        }
      })
      .sort((a, b) => b.day.localeCompare(a.day) || a.platform.localeCompare(b.platform))
  }
  const brandMetrics = metricsFor('brand_self'),
    discoveryMetrics = metricsFor('discovery')
  const failedCount = observations.filter((item) => item.resultState === 'failed').length
  const groundingCandidates = useMemo(() => {
    const tracked = new Set(activeQuestions.map((item) => normalizeGeoText(item.question)))
    const seen = new Set<string>()
    return observations
      .flatMap((item) => item.groundingQueries.map((text) => ({ text, language: item.language })))
      .filter((item) => {
        const key = `${item.language}:${normalizeGeoText(item.text)}`
        if (!item.text || tracked.has(normalizeGeoText(item.text)) || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 20)
  }, [activeQuestions, observations])
  const termSourceReview =
    config?.terms.map((term) => {
      const related = sourcePages.filter((page) => page.terms.includes(term))
      const available = related
        .filter((page) => page.status === 'available')
        .sort((a, b) => b.excerpt.length - a.excerpt.length)[0]
      return { term, related, available, thin: !!available && available.excerpt.length < 300 }
    }) || []

  const saveQuestions = async (next: GeoTrackedQuestion[]) => {
    if (!configID) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await readJSON(`${base}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_questions',
          optimizationID: configID,
          version: questionSet.version,
          questions: next,
        }),
      })
      setQuestionSet(result.questionSet)
      setNotice(result.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : '问题集保存失败。')
    } finally {
      setBusy(false)
    }
  }
  const addQuestion = (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim()) return
    void saveQuestions([
      ...activeQuestions,
      { id: crypto.randomUUID(), queryType, question: question.trim(), language },
    ])
    setQuestion('')
  }
  const seedQuestions = () => {
    if (!config || activeQuestions.length) return
    const discoveryQuestionFrames = [
      (term: string) => `准备采购${term}，有哪些厂家值得进一步了解？`,
      (term: string) => `项目需要${term}，选择厂家时应该比较哪些实际因素？`,
      (term: string) => `找${term}供应商时，怎样判断产品和项目需求是否匹配？`,
      (term: string) => `采购${term}之前，哪些产品和服务信息值得先问清？`,
      (term: string) => `不同厂家的${term}怎么比较，采购前先看哪些信息？`,
      (term: string) => `第一次采购${term}，怎样筛选合适的供货厂家？`,
      (term: string) => `哪些厂家生产${term}？联系前最好核实什么？`,
      (term: string) => `为项目选${term}，怎么比较厂家的交付和售后服务？`,
      (term: string) => `需要定制${term}时，找厂家要先确认哪些事项？`,
      (term: string) => `做${term}采购方案时，怎样找到适合项目的产品和供应商？`,
    ]
    const proposed: GeoTrackedQuestion[] = [
      {
        id: crypto.randomUUID(),
        queryType: 'brand_self',
        question: `想了解${config.brand}的${config.core}产品，应该先看哪些信息？`,
        language: 'zh',
      },
      ...config.terms.map((term, index) => ({
        id: crypto.randomUUID(),
        queryType: 'discovery' as const,
        question: discoveryQuestionFrames[index % discoveryQuestionFrames.length](term),
        language: 'zh',
      })),
    ]
    void saveQuestions(proposed)
  }
  const openSample = (item: GeoTrackedQuestion) => {
    setSampleQuestion(item)
    setSample(blankSample(item.language))
    setSampleRequestID(crypto.randomUUID())
    setError('')
  }
  const closeSample = () => {
    setSampleQuestion(null)
    if (dialogRef.current?.open) dialogRef.current.close()
  }
  const submitSample = async (event: FormEvent) => {
    event.preventDefault()
    if (!config || !sampleQuestion) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await readJSON(`${base}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          optimizationID: config.id,
          requestID: sampleRequestID,
          questionID: sampleQuestion.id,
          optimizationVersion: config.version,
          questionSetVersion: questionSet.version,
          ...sample,
        }),
      })
      setObservations((current) =>
        result.replayed ? current : [result.observation, ...current].slice(0, 100),
      )
      setNotice(result.message)
      closeSample()
    } catch (e) {
      setError(e instanceof Error ? e.message : '采样记录失败；输入已保留。')
    } finally {
      setBusy(false)
    }
  }
  const currentAnswerMatches =
    config && sample.rawAnswer
      ? geoAliasMatches(sample.rawAnswer, { brand: config.brand, aliases: config.aliases })
      : []
  const rate = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

  return (
    <section className="geo-workspace geo-visibility" aria-labelledby="geo-visibility-title">
      <header className="geo-workspace__heading">
        <div>
          <h1 id="geo-visibility-title">GEO报表</h1>
          <p>按真实搜索问题查看公司提及与引用证据，并保留每次采样记录。</p>
        </div>
      </header>
      {error && (
        <p className="geo-workspace__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="geo-workspace__notice" role="status">
          {notice}
        </p>
      )}
      <div className="geo-visibility__notice">
        <strong>当前为人工采样</strong>
        <span>
          系统不会自动向AI平台发起查询。请在目标平台按问题实际搜索，再粘贴原始答案；“答案未提及”只表示这次已完成的采样中没有匹配品牌词。
        </span>
      </div>

      {configs.length > 0 && (
        <div className="geo-visibility__toolbar">
          <label>
            优化词配置
            <select value={configID} onChange={(event) => setConfigID(event.target.value)}>
              {configs.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.brand} · {item.core}
                </option>
              ))}
            </select>
          </label>
          {config && (
            <span>
              配置版本 {config.version} · 问题集版本 {questionSet.version || '尚未建立'}
            </span>
          )}
        </div>
      )}
      {config && (
        <p className="geo-visibility__match-rule">
          公司名称匹配依据：<strong>{config.brand}</strong>
          {config.aliases.length ? `、${config.aliases.join('、')}` : '（未配置比对标识）'}
        </p>
      )}

      {loading && <p role="status">正在读取GEO追踪数据…</p>}
      {!loading && !configs.length && (
        <div className="geo-workspace__empty">
          <strong>当前客户还没有GEO优化词</strong>
          <p>先在“GEO优化词”中保存品牌词、核心词和细分词，再为该配置建立问题集。</p>
        </div>
      )}
      {config && (
        <>
          <div className="geo-visibility__metric-groups">
            {(
              [
                { type: 'brand_self', label: '品牌自查', metrics: brandMetrics },
                { type: 'discovery', label: '非品牌发现', metrics: discoveryMetrics },
              ] as const
            ).map(({ type, label, metrics }) => (
              <section key={type} aria-label={`${label}统计`}>
                <h2>
                  {label}{' '}
                  <small>
                    {metrics.questionCount}个问题 · {metrics.sampleCount}条有效样本
                  </small>
                </h2>
                <div className="geo-visibility__metrics">
                  <article>
                    <span>问题覆盖率</span>
                    <strong>{rate(metrics.coverage)}</strong>
                    <small>
                      {metrics.covered} / {metrics.questionCount}个问题已采样
                    </small>
                  </article>
                  <article>
                    <span>公司提及率</span>
                    <strong>{rate(metrics.mention)}</strong>
                    <small>
                      {metrics.detected} / {metrics.sampleCount}条回答命中比对标识
                    </small>
                  </article>
                  <article>
                    <span>有效引用率</span>
                    <strong>{rate(metrics.citation)}</strong>
                    <small>
                      {metrics.citations} / {metrics.sampleCount}条回答命中已核验来源页
                    </small>
                  </article>
                </div>
                <details className="geo-visibility__trend">
                  <summary>查看近期按日趋势（按平台拆分）</summary>
                  {trendFor(type).length ? (
                    <div className="geo-workspace__table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>日期（北京时间）</th>
                            <th>平台</th>
                            <th>有效回答</th>
                            <th>公司提及</th>
                            <th>提及率</th>
                            <th>有效引用</th>
                            <th>引用率</th>
                            <th>失败</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trendFor(type).map((row) => (
                            <tr key={`${row.day}:${row.platform}`}>
                              <td>{row.day}</td>
                              <td>{row.platform}</td>
                              <td>{row.valid}</td>
                              <td>{row.detected}</td>
                              <td>{rate(row.mentionRate)}</td>
                              <td>{row.citations}</td>
                              <td>{rate(row.citationRate)}</td>
                              <td>{row.failed}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>
                      暂无有效采样，趋势显示“—”。最近100条历史记录内的同一天、同平台采样会合并统计。
                    </p>
                  )}
                </details>
              </section>
            ))}
          </div>
          <p className="geo-visibility__failure-total">
            检测失败：{failedCount}
            条。失败记录保留原因，不计入提及率和引用率；不同平台的样本会在每题历史中分别标注。
          </p>
          <p className="geo-visibility__method">
            统计口径：品牌自查与非品牌发现分开统计；有效回答仅含已完成采样，问题覆盖率按当前问题集中的问题数计算。未采样显示“未检测”，失败记录保留原因但不当作未提及。有效引用指匹配采样时优化词版本下状态为“可访问”的来源页；外链不做远程抓取，统一显示未核验。单次命中不代表稳定排名，前后差异也不单独证明发布带来的因果效果。
          </p>

          <section
            className="geo-workspace__panel geo-visibility__gaps"
            aria-labelledby="geo-source-gaps-title"
          >
            <header className="geo-visibility__section-heading">
              <div>
                <h2 id="geo-source-gaps-title">细分词来源页检查</h2>
                <p>按当前版本的官网 / Blog 扫描结果检查每个细分词是否有可引用独立页面。</p>
              </div>
              <a
                className="geo-workspace__button"
                href={`/workspace/${encodeURIComponent(company.slug)}/geo/keywords/${encodeURIComponent(config.id)}`}
              >
                检查或更新来源页
              </a>
            </header>
            <div className="geo-workspace__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>细分词</th>
                    <th>来源页</th>
                    <th>检查结果</th>
                    <th>建议</th>
                  </tr>
                </thead>
                <tbody>
                  {termSourceReview.map(({ term, related, available, thin }) => (
                    <tr key={term}>
                      <td>{term}</td>
                      <td>
                        {available ? (
                          <>
                            <strong>{available.title || available.url}</strong>
                            <br />
                            <small>{available.url}</small>
                          </>
                        ) : related.length ? (
                          related.map((page) => (
                            <span key={page.url}>
                              {page.title || page.url}
                              <br />
                              <small>{page.reason || page.status}</small>
                              <br />
                            </span>
                          ))
                        ) : (
                          '未发现匹配页面'
                        )}
                      </td>
                      <td>
                        {available
                          ? thin
                            ? `可访问，正文约${available.excerpt.length}字`
                            : '可访问且主题匹配'
                          : related.length
                            ? '待检查 / 暂不可引用'
                            : '缺少独立来源页'}
                      </td>
                      <td>
                        {available && !thin
                          ? '保留并继续采样'
                          : thin
                            ? '启发式长度提醒（少于300字符，不代表内容质量结论）'
                            : '先在客户网站补充对应产品 / 文章页，再重新检查来源'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="geo-visibility__gap-links">
              检查结论是辅助线索，不自动改动客户网站。可到{' '}
              <a href={`/workspace/${encodeURIComponent(company.slug)}/website/content`}>
                网站内容管理
              </a>{' '}
              补充页面，或到{' '}
              <a href={`/workspace/${encodeURIComponent(company.slug)}/geo/creation`}>文章创作</a>{' '}
              建立后续内容任务。
            </p>
          </section>

          {!!groundingCandidates.length && (
            <section
              className="geo-workspace__panel geo-visibility__candidates"
              aria-labelledby="geo-grounding-candidates-title"
            >
              <header className="geo-visibility__section-heading">
                <div>
                  <h2 id="geo-grounding-candidates-title">内部检索词线索</h2>
                  <p>
                    这些是采样答案中记录的引擎内部检索词，不等同于用户完整问题；点击只会填入问题编辑框，不会自动加入问题集。
                  </p>
                </div>
              </header>
              <div className="geo-visibility__candidate-list">
                {groundingCandidates.map((candidate) => (
                  <button
                    key={`${candidate.language}:${candidate.text}`}
                    type="button"
                    onClick={() => {
                      setQuestion(candidate.text)
                      setQueryType('discovery')
                      setLanguage(candidate.language)
                      questionInputRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      })
                      questionInputRef.current?.focus()
                    }}
                  >
                    {candidate.text}
                    <small>{candidate.language.toUpperCase()} · 作为非品牌发现问题草稿</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section
            className="geo-workspace__panel geo-visibility__questions"
            aria-labelledby="geo-question-set-title"
          >
            <header className="geo-visibility__section-heading">
              <div>
                <h2 id="geo-question-set-title">固定问题集</h2>
                <p>品牌自查和非品牌发现分开统计；修改后版本递增，历史采样保留原问题。</p>
              </div>
              {!activeQuestions.length && (
                <button className="geo-workspace__button" disabled={busy} onClick={seedQuestions}>
                  从核心词和10个细分词生成11条问题建议
                </button>
              )}
            </header>
            <form className="geo-visibility__question-form" onSubmit={addQuestion}>
              <label>
                问题类型
                <select
                  value={queryType}
                  onChange={(event) =>
                    setQueryType(event.target.value as 'brand_self' | 'discovery')
                  }
                >
                  <option value="brand_self">品牌自查</option>
                  <option value="discovery">非品牌发现</option>
                </select>
              </label>
              <label>
                语言
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {localeOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="geo-visibility__question-input">
                问题
                <input
                  ref={questionInputRef}
                  value={question}
                  maxLength={500}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="例如：采购低压成套配电柜时，怎样比较不同厂家的产品？"
                />
              </label>
              <button
                className="geo-workspace__button is-primary"
                disabled={busy || !question.trim()}
              >
                添加问题
              </button>
            </form>
            {!activeQuestions.length && (
              <div className="geo-workspace__empty">
                <strong>问题集尚未建立</strong>
                <p>
                  可以逐条添加要追踪的真实提问，或从已保存的核心词和细分词生成可编辑的问题建议。
                </p>
              </div>
            )}
            {!!activeQuestions.length && (
              <div className="geo-workspace__table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>监测问题</th>
                      <th>类型 / 语言</th>
                      <th>有效样本</th>
                      <th>提及率</th>
                      <th>引用率</th>
                      <th>最近采样</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeQuestions.map((item) => {
                      const rows = byQuestion.get(item.id) || [],
                        valid = rows.filter((row) => row.resultState !== 'failed')
                      const mentions = valid.filter((row) => row.resultState === 'detected').length
                      const citations = valid.filter((row) =>
                        row.citations.some((citation) => citation.status === 'known_available'),
                      ).length
                      const platforms = [...new Set(valid.map((row) => row.platform))].map(
                        (platform) => {
                          const samples = valid.filter((row) => row.platform === platform)
                          return {
                            platform,
                            samples,
                            mentions: samples.filter((row) => row.resultState === 'detected')
                              .length,
                            citations: samples.filter((row) =>
                              row.citations.some(
                                (citation) => citation.status === 'known_available',
                              ),
                            ).length,
                          }
                        },
                      )
                      return (
                        <tr key={item.id}>
                          <td>
                            {item.question}
                            <br />
                            <small>
                              {rows.length
                                ? `${rows.filter((row) => row.resultState === 'failed').length} 次失败记录`
                                : '未检测'}
                            </small>
                            {!!platforms.length && (
                              <details className="geo-visibility__platform-breakdown">
                                <summary>按平台拆分</summary>
                                {platforms.map((platform) => (
                                  <p key={platform.platform}>
                                    {platform.platform}：提及 {platform.mentions}/
                                    {platform.samples.length} · 已核验引用 {platform.citations}/
                                    {platform.samples.length}
                                  </p>
                                ))}
                              </details>
                            )}
                          </td>
                          <td>
                            {queryTypeLabel[item.queryType]}
                            <br />
                            <small>{item.language.toUpperCase()}</small>
                          </td>
                          <td>{valid.length}</td>
                          <td>
                            {valid.length
                              ? `${rate(mentions / valid.length)} (${mentions}/${valid.length})`
                              : '—'}
                          </td>
                          <td>
                            {valid.length
                              ? `${rate(citations / valid.length)} (${citations}/${valid.length})`
                              : '—'}
                          </td>
                          <td>{rows[0] ? displayTime(rows[0].sampledAt) : '未检测'}</td>
                          <td>
                            <button
                              className="geo-workspace__link"
                              disabled={busy}
                              onClick={() => openSample(item)}
                            >
                              记录采样
                            </button>
                            <button
                              className="geo-workspace__link is-danger"
                              disabled={busy}
                              onClick={() =>
                                void saveQuestions(
                                  activeQuestions.filter(
                                    (questionItem) => questionItem.id !== item.id,
                                  ),
                                )
                              }
                            >
                              移除
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="geo-visibility__footer">
              <span>
                {questionSet.updatedAt
                  ? `问题集更新于 ${displayTime(questionSet.updatedAt)}`
                  : '尚未保存问题集'}
              </span>
              {!!activeQuestions.length && (
                <button className="geo-workspace__button is-primary" disabled>
                  修改问题将自动生成新版本
                </button>
              )}
            </footer>
          </section>

          <section
            className="geo-workspace__panel geo-visibility__history"
            aria-labelledby="geo-observation-title"
          >
            <header className="geo-visibility__section-heading">
              <div>
                <h2 id="geo-observation-title">采样与历史证据</h2>
                <p>最多展示最近100条记录；每次回答作为一条独立采样保留。</p>
              </div>
            </header>
            {!observations.length && (
              <div className="geo-workspace__empty">
                <strong>暂无采样记录</strong>
                <p>在问题行点击“记录采样”，把目标平台的真实答案和引用链接保存下来。</p>
              </div>
            )}
            {observations.map((item) => (
              <article className="geo-visibility__observation" key={item.id}>
                <header>
                  <div>
                    <strong>{item.question}</strong>
                    <p>
                      {queryTypeLabel[item.queryType]} · {item.platform}
                      {item.model ? ` / ${item.model}` : ''} · {item.language.toUpperCase()} /{' '}
                      {item.region} · {displayTime(item.sampledAt)}
                    </p>
                  </div>
                  <span
                    className={`geo-visibility__state geo-visibility__state--${item.resultState}`}
                  >
                    {resultLabel[item.resultState]}
                  </span>
                </header>
                <p className="geo-visibility__observation-meta">
                  {item.method === 'manual' ? '人工录入' : item.method} ·{' '}
                  {item.browsingMode === 'connected'
                    ? '联网'
                    : item.browsingMode === 'disconnected'
                      ? '未联网'
                      : '联网状态未知'}{' '}
                  · 优化词 v{item.optimizationVersion} / 问题集 v{item.questionSetVersion}
                </p>
                {item.resultState === 'failed' ? (
                  <p className="geo-visibility__failure">失败原因：{item.failureMessage}</p>
                ) : (
                  <details>
                    <summary>查看原始答案、检索词和引用</summary>
                    {!!item.matchedAliases.length && (
                      <p>
                        命中：{item.matchedAliases.join('、')} ·{' '}
                        {contextLabel[item.recommendationContext] || item.recommendationContext}
                        （人工判断）
                      </p>
                    )}
                    <pre>{item.rawAnswer}</pre>
                    {!!item.groundingQueries.length && (
                      <p>
                        <strong>引擎内部检索词：</strong>
                        {item.groundingQueries.join('；')}
                      </p>
                    )}
                    {!!item.citations.length && (
                      <div className="geo-visibility__citations">
                        <strong>答案引用页</strong>
                        {item.citations.map((citation, index) => (
                          <p key={`${item.id}:${index}`}>
                            <a href={citation.url} target="_blank" rel="noreferrer">
                              {citation.url}
                            </a>
                            <span>
                              {citation.status === 'known_available'
                                ? `已匹配可访问${citation.kind === 'site' ? '官网' : 'Blog'}来源页${citation.title ? `：${citation.title}` : ''}`
                                : '未核验：不计入有效引用率'}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                    <details className="geo-visibility__snapshot">
                      <summary>查看采样时的历史配置快照</summary>
                      <p>
                        <strong>品牌词：</strong>
                        {item.optimizationSnapshot.brand} · <strong>比对标识：</strong>
                        {item.optimizationSnapshot.aliases.join('、') || '无'}
                      </p>
                      <p>
                        <strong>核心词：</strong>
                        {item.optimizationSnapshot.core} · <strong>细分词：</strong>
                        {item.optimizationSnapshot.terms.join('、')}
                      </p>
                      <p>
                        <strong>官网：</strong>
                        {item.optimizationSnapshot.website} · <strong>Blog：</strong>
                        {item.optimizationSnapshot.blog || '未填写'}
                      </p>
                    </details>
                  </details>
                )}
              </article>
            ))}
          </section>
        </>
      )}

      <dialog
        ref={dialogRef}
        className="geo-workspace__dialog geo-visibility__dialog"
        aria-labelledby="geo-sample-title"
        onCancel={(event) => {
          event.preventDefault()
          closeSample()
        }}
      >
        {sampleQuestion && (
          <form onSubmit={submitSample}>
            <header>
              <div>
                <h2 id="geo-sample-title">记录人工采样</h2>
                <p>{sampleQuestion.question}</p>
              </div>
              <button type="button" onClick={closeSample} aria-label="关闭">
                ×
              </button>
            </header>
            {error && (
              <p className="geo-workspace__error" role="alert">
                {error}
              </p>
            )}
            <div className="geo-visibility__form-grid">
              <label>
                AI平台
                <input
                  required
                  maxLength={80}
                  value={sample.platform}
                  onChange={(event) => setSample({ ...sample, platform: event.target.value })}
                  placeholder="例如 ChatGPT、Gemini"
                />
              </label>
              <label>
                模型版本
                <input
                  maxLength={120}
                  value={sample.model}
                  onChange={(event) => setSample({ ...sample, model: event.target.value })}
                  placeholder="不清楚可留空"
                />
              </label>
              <label>
                联网模式
                <select
                  value={sample.browsingMode}
                  onChange={(event) =>
                    setSample({
                      ...sample,
                      browsingMode: event.target.value as SampleForm['browsingMode'],
                    })
                  }
                >
                  <option value="connected">联网 / 搜索已开启</option>
                  <option value="disconnected">未联网</option>
                  <option value="unknown">不清楚</option>
                </select>
              </label>
              <label>
                采样语言
                <select value={sample.language} disabled>
                  {localeOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>与固定问题的语言保持一致。</small>
              </label>
              <label>
                地区代码
                <input
                  required
                  maxLength={16}
                  value={sample.region}
                  onChange={(event) => setSample({ ...sample, region: event.target.value })}
                  placeholder="CN / US / GLOBAL"
                />
              </label>
              <label>
                采样结果
                <select
                  value={sample.outcome}
                  onChange={(event) =>
                    setSample({ ...sample, outcome: event.target.value as SampleForm['outcome'] })
                  }
                >
                  <option value="answered">已获得答案</option>
                  <option value="failed">检测失败 / 超时</option>
                </select>
              </label>
            </div>
            {sample.outcome === 'answered' ? (
              <>
                <label className="geo-visibility__wide-label">
                  原始答案
                  <textarea
                    required
                    maxLength={30000}
                    rows={8}
                    value={sample.rawAnswer}
                    onChange={(event) => setSample({ ...sample, rawAnswer: event.target.value })}
                    placeholder="粘贴目标平台返回的完整答案；系统会与品牌词及比对标识进行匹配。"
                  />
                </label>
                {currentAnswerMatches.length > 0 && (
                  <label>
                    公司出现时的推荐语境
                    <select
                      value={sample.recommendationContext}
                      onChange={(event) =>
                        setSample({ ...sample, recommendationContext: event.target.value })
                      }
                    >
                      <option value="not_applicable">请选择</option>
                      <option value="recommended">正向推荐</option>
                      <option value="mentioned">中性提及</option>
                      <option value="not_recommended">负向评价</option>
                      <option value="unclear">语境不明确</option>
                    </select>
                    <small>由录入者按原始答案判断，不由系统推断。</small>
                  </label>
                )}
                <label className="geo-visibility__wide-label">
                  引擎内部检索词
                  <textarea
                    rows={2}
                    value={sample.groundingQueries}
                    onChange={(event) =>
                      setSample({ ...sample, groundingQueries: event.target.value })
                    }
                    placeholder="可选；若平台展示了搜索/grounding query，每行一条。不要把用户问题复制到这里。"
                  />
                </label>
                <label className="geo-visibility__wide-label">
                  答案引用的页面URL
                  <textarea
                    rows={2}
                    value={sample.citationURLs}
                    onChange={(event) => setSample({ ...sample, citationURLs: event.target.value })}
                    placeholder="每行一个答案实际引用的URL；系统不访问这些外部地址。"
                  />
                </label>
              </>
            ) : (
              <label className="geo-visibility__wide-label">
                失败原因
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={sample.failureMessage}
                  onChange={(event) => setSample({ ...sample, failureMessage: event.target.value })}
                  placeholder="例如：请求超时、未获得答案、页面不可用"
                />
              </label>
            )}
            <footer>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={busy}
                onClick={closeSample}
              >
                取消
              </button>
              <button
                className="geo-workspace__button is-primary"
                disabled={
                  busy ||
                  (sample.outcome === 'answered' &&
                    currentAnswerMatches.length > 0 &&
                    sample.recommendationContext === 'not_applicable')
                }
              >
                {busy ? '保存中…' : '保存采样证据'}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </section>
  )
}
