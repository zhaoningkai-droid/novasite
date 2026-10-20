'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import {
  ArrowRight, BarChart3, BookOpenText, BriefcaseBusiness, Download, Globe2,
  Info, MessageSquare, Newspaper, Package, RefreshCw, TrendingUp, Users,
} from 'lucide-react'

import type { WorkspaceCompany } from '@/platform/workspace'
import { csvCell, type AnalyticsCounts, type AnalyticsRange, type LeadAnalytics } from './analytics-data'
import { ga4Unavailable, type Ga4Traffic } from '../../analytics/ga4-types'
import type { Ga4Realtime } from '../../analytics/ga4-realtime.server'
import { useAnalyticsRefresh } from './useAnalyticsRefresh'

import './workspace-analytics.scss'

type Props = {
  company: WorkspaceCompany
  counts: AnalyticsCounts
  range: AnalyticsRange
  leads: LeadAnalytics
  refreshedAt: string
  traffic?: Ga4Traffic
  realtime?: Ga4Realtime
}

const statusLabel = (status: WorkspaceCompany['status']) => {
  if (status === 'published') return '网站已发布'
  if (status === 'suspended') return '网站已暂停'
  return '网站搭建中'
}

export function WorkspaceAnalytics({ company, counts, range, leads, refreshedAt, realtime, traffic = ga4Unavailable('not_configured', '尚未接入 GA4 访问统计。') }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [exportNotice, setExportNotice] = useState('')
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router])
  useAnalyticsRefresh(refresh, pending, `${company.slug}:${range}`)
  const currentPath = `/workspace/${company.slug}/website/analytics`
  const leadMessage = leads.status === 'forbidden' ? '当前账号无询盘查看权限' : '询盘数据暂时读取失败，请刷新重试'
  const content = [
    { label: '产品', count: counts.products, href: `/workspace/${company.slug}/website/content`, hint: '产品目录', icon: Package },
    { label: '新闻文章', count: counts.news, href: `/workspace/${company.slug}/website/content/news`, hint: '资讯与动态', icon: Newspaper },
    { label: '案例', count: counts.cases, href: `/workspace/${company.slug}/website/content/cases`, hint: '客户项目', icon: BriefcaseBusiness },
    { label: '博客', count: counts.blog, href: `/workspace/${company.slug}/website/content/blog`, hint: '专业文章', icon: BookOpenText },
  ]
  const metrics = [
    { label: '累计浏览量（PV）', value: traffic.totalViews?.toLocaleString('zh-CN') ?? '—', hint: traffic.status === 'ready' ? '当前 GA4 资源可查询的累计浏览量' : traffic.message, icon: Globe2 },
    { label: `近 ${range} 天访客数（UV）`, value: traffic.users?.toLocaleString('zh-CN') ?? '—', hint: traffic.status === 'ready' ? 'GA4 总用户数，不是独立 IP 数' : traffic.message, icon: Users },
    { label: `近 ${range} 天浏览量（PV）`, value: traffic.views?.toLocaleString('zh-CN') ?? '—', hint: traffic.status === 'ready' ? 'GA4 页面浏览事件' : traffic.message, icon: BarChart3 },
    { label: `近 ${range} 天询盘量`, value: leads.count?.toLocaleString('zh-CN') ?? '—', hint: leads.status === 'ready' ? '来自当前公司真实询盘记录' : leadMessage, icon: MessageSquare },
  ]
  const maxDaily = Math.max(1, ...leads.daily.map((day) => day.count))
  const maxTraffic = Math.max(1, ...traffic.daily.flatMap((day) => [day.views, day.users]))
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(refreshedAt))

  const exportData = () => {
    const rows: (string | number)[][] = [
      ['公司', '统计范围', '数据类型', '项目', '数值', '说明'],
      [company.name, '累计', 'GA4', '累计PV', traffic.totalViews ?? '', traffic.message],
      [company.name, `近${range}天`, 'GA4', 'PV', traffic.views ?? '', traffic.message],
      [company.name, `近${range}天`, 'GA4', '用户数', traffic.users ?? '', 'GA4 用户口径，不是独立 IP 数'],
      [company.name, `近${range}天`, 'GA4', '询盘转化', traffic.conversions ?? '', '仅统计授权访客成功提交后上报的事件，与数据库询盘数口径不同'],
      [company.name, `近${range}天`, 'GA4', 'WhatsApp点击', traffic.whatsappClicks ?? '', '点击次数，不表示已发送消息'],
      ...traffic.daily.map((day) => [company.name, day.date, 'GA4每日', 'PV / 用户数', `${day.views} / ${day.users}`, traffic.timeZone || '']),
      ...traffic.sources.map((source) => [company.name, `近${range}天`, 'GA4来源', source.label, source.sessions, '会话数']),
      ...traffic.pages.map((page) => [company.name, `近${range}天`, 'GA4页面', page.path, page.views, 'PV']),
      [company.name, `近${range}天`, '询盘统计', '询盘总数', leads.count ?? '', leads.status === 'ready' ? '当前公司真实记录；包含今天；北京时间' : leadMessage],
      ...leads.daily.map((day) => [company.name, `近${range}天`, '每日询盘', day.date, day.count, '北京时间']),
      ...leads.sources.map((source) => [company.name, `近${range}天`, '询盘来源', source.label, source.count, '按询盘UTM Source汇总']),
      ...content.map((item) => [company.name, '全部时间', '内容记录', item.label, item.count, '包含草稿']),
      [company.name, `近${range}天`, '数据时间', refreshedAt, '', '只导出汇总数据，不包含客户联系方式'],
    ]
    const blob = new Blob(['\uFEFF', rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `网站数据-${company.slug}-${range}天-${refreshedAt.slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportNotice('已导出当前范围的汇总数据。')
  }

  return <section className="workspace-analytics" aria-label="网站数据" aria-busy={pending}>
    <header className="workspace-analytics__title">
      <div><h1>网站数据</h1></div>
      <Link className="workspace-analytics__status" href={`/workspace/${company.slug}/website/sites`}>
        <span className={`workspace-analytics__status-dot workspace-analytics__status-dot--${company.status || 'building'}`} />
        <span>{statusLabel(company.status)}</span><Globe2 size={16} aria-hidden="true" /><ArrowRight size={14} aria-hidden="true" />
      </Link>
    </header>

    <div className="workspace-analytics__toolbar">
      <div className="workspace-analytics__ranges" role="group" aria-label="统计时间范围">
        {([7, 30, 90] as const).map((days) => <button key={days} type="button" aria-pressed={range === days} disabled={pending} onClick={() => startTransition(() => router.replace(`${currentPath}?range=${days}`, { scroll: false }))}>近 {days} 天</button>)}
      </div>
      <div className="workspace-analytics__toolbar-actions">
        <span className="workspace-analytics__updated" role="status">{pending ? '正在更新数据…' : `每分钟自动更新 · ${dateLabel} 更新`}</span>
        <button type="button" disabled={pending} onClick={refresh}><RefreshCw size={15} aria-hidden="true" className={pending ? 'workspace-analytics__spinning' : undefined} />刷新</button>
        <button type="button" disabled={pending} onClick={exportData}><Download size={15} aria-hidden="true" />导出数据</button>
      </div>
    </div>
    <p className="workspace-analytics__notice"><Info size={16} aria-hidden="true" /><span>{traffic.message} {traffic.status === 'ready' ? `统计时区 ${traffic.timeZone}。累计和趋势等待 Google 处理完成后自动更新。` : '不可用的访问数据以“—”显示，不代表访问量为零。'} 询盘量来自当前公司数据库。</span></p>
    {exportNotice && <p className="workspace-analytics__export-notice" role="status">{exportNotice}</p>}

    {realtime && realtime.status !== 'not_configured' && <section
      className="workspace-analytics__panel workspace-analytics__realtime"
      aria-label="近30分钟实时访问"
    >
      <div><h2>实时访问</h2><p>近 30 分钟 · 仅统计当前公司网站</p></div>
      <dl>
        <div><dt>浏览量（PV）</dt><dd>{realtime.views?.toLocaleString('zh-CN') ?? '—'}</dd></div>
      </dl>
      <p>{realtime.status === 'ready' ? '实时访问按近 30 分钟统计，与下方报表的时间范围不同。' : '实时数据暂时无法读取，将自动重试。'}</p>
    </section>}

    <div className="workspace-analytics__grid workspace-analytics__metrics">
      {metrics.map(({ label, value, hint, icon: Icon }) => <article className="workspace-analytics__card" key={label}>
        <div className="workspace-analytics__metric-heading"><p>{label}</p><Icon size={18} aria-hidden="true" /></div>
        <strong>{value}</strong><span className="workspace-analytics__metric-hint">{hint}</span>
      </article>)}
    </div>

    <div className="workspace-analytics__charts">
      <section className="workspace-analytics__panel" aria-labelledby="workspace-traffic-title">
        <div className="workspace-analytics__section-heading"><div><h2 id="workspace-traffic-title">访问趋势</h2><p>浏览量 PV · GA4 用户数 UV</p></div><span className="workspace-analytics__unconnected">{traffic.status === 'ready' ? 'GA4' : '尚未连接'}</span></div>
        {traffic.status !== 'ready' ? <div className="workspace-analytics__empty"><BarChart3 size={30} aria-hidden="true" /><h3>暂无可用的访问统计</h3><p>{traffic.message}</p><Link href={`/workspace/${company.slug}/website/sites`}>配置 GA4</Link></div>
          : traffic.views === 0 ? <div className="workspace-analytics__empty"><BarChart3 size={30} aria-hidden="true" /><h3>{realtime?.views ? '实时已收到访问，趋势待 Google 处理' : '所选范围暂无已处理的访问记录'}</h3><p>标准报表存在处理延迟；有新数据后自动显示，无需反复点击刷新。</p></div>
          : <div className="workspace-analytics__trend"><p className="workspace-analytics__ga4-legend"><i />PV <i />用户数</p><div className="workspace-analytics__bars" aria-label={`近 ${range} 天访问趋势`}>
            {traffic.daily.map((day) => <div className="workspace-analytics__bar-slot workspace-analytics__ga4-pair" key={day.date} title={`${day.date}：${day.views} PV，${day.users} 用户`}><span style={{ height: `${day.views / maxTraffic * 100}%` }} /><span style={{ height: `${day.users / maxTraffic * 100}%` }} /></div>)}
          </div><div className="workspace-analytics__axis"><span>{traffic.daily[0]?.date}</span><span>{traffic.daily.at(-1)?.date}</span></div>
          <details className="workspace-analytics__daily"><summary>查看每日访问数据</summary><div><table><thead><tr><th>日期</th><th>PV</th><th>用户数</th></tr></thead><tbody>{traffic.daily.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.views}</td><td>{day.users}</td></tr>)}</tbody></table></div></details></div>}
      </section>
      <section className="workspace-analytics__panel" aria-labelledby="workspace-lead-title">
        <div className="workspace-analytics__section-heading">
          <div><h2 id="workspace-lead-title">询盘趋势</h2>
            <p>近 {range} 天 · 每日收到的询盘数量</p></div>
          {leads.status === 'ready' && <div className="workspace-analytics__lead-actions">
            <span className="workspace-analytics__live"><i />真实记录</span>
            <Link href={`/workspace/${company.slug}/website/inquiries`}>
              查看询盘<ArrowRight size={14} aria-hidden="true" /></Link>
          </div>}
        </div>
        {leads.status !== 'ready' ? <div className="workspace-analytics__empty"><MessageSquare size={30} aria-hidden="true" /><p>{leadMessage}</p></div>
          : leads.count === 0 ? <div className="workspace-analytics__empty"><MessageSquare size={30} aria-hidden="true" /><h3>这段时间还没有询盘</h3><p>网站收到新的询盘后，会显示在这里。</p></div>
            : <div className="workspace-analytics__trend">
              <div className="workspace-analytics__bars" aria-label={`近${range}天共${leads.count}条询盘`}>
                {leads.daily.map((day) => <div className="workspace-analytics__bar-slot" key={day.date} title={`${day.date}：${day.count} 条询盘`}><span style={{ height: `${day.count / maxDaily * 100}%` }} /></div>)}
              </div>
              <div className="workspace-analytics__axis"><span>{leads.daily[0]?.date.slice(5)}</span><span>单日最高 {maxDaily} 条</span><span>{leads.daily.at(-1)?.date.slice(5)}</span></div>
              <details className="workspace-analytics__daily"><summary>查看每日数据</summary><div><table><thead><tr><th scope="col">日期（北京时间）</th><th scope="col">询盘数</th></tr></thead><tbody>{leads.daily.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.count}</td></tr>)}</tbody></table></div></details>
            </div>}
      </section>
    </div>

    <div className="workspace-analytics__charts">
      <section className="workspace-analytics__panel"><div className="workspace-analytics__section-heading"><div><h2>访客来源</h2><p>GA4 来源 / 媒介，按会话数排序，展示前 10 项。</p></div></div>
        {traffic.status !== 'ready' || !traffic.sources.length ? <p className="workspace-analytics__source-empty">{traffic.status === 'ready' ? '暂无访客来源数据。' : traffic.message}</p> : <ul className="workspace-analytics__source-list">{traffic.sources.map((source) => <li key={source.label}><span>{source.label}</span><meter min={0} max={Math.max(1, ...traffic.sources.map((x) => x.sessions))} value={source.sessions} /><strong>{source.sessions}<small> 次会话</small></strong></li>)}</ul>}
      </section>
      <section className="workspace-analytics__panel"><div className="workspace-analytics__section-heading"><div><h2>热门页面</h2><p>按 GA4 浏览量排序，展示前 10 项。</p></div></div>
        {traffic.status !== 'ready' || !traffic.pages.length ? <p className="workspace-analytics__source-empty">{traffic.status === 'ready' ? '暂无页面访问数据。' : traffic.message}</p> : <div className="workspace-analytics__daily"><table><thead><tr><th>页面路径</th><th>PV</th></tr></thead><tbody>{traffic.pages.map((page) => <tr key={page.path}><td className="workspace-analytics__page-path" title={page.path}>{page.path}</td><td>{page.views}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
    <section className="workspace-analytics__panel workspace-analytics__sources"><div className="workspace-analytics__section-heading"><div><h2>GA4 转化</h2><p>受访客授权、广告拦截与报表处理延迟影响；以询盘收件箱的实际入库记录为准。</p></div></div><div className="workspace-analytics__ga4-conversions"><p>成功询盘事件 <strong>{traffic.conversions?.toLocaleString('zh-CN') ?? '—'}</strong></p><p>WhatsApp 点击 <strong>{traffic.whatsappClicks?.toLocaleString('zh-CN') ?? '—'}</strong><small>点击不代表访客已发送消息</small></p></div></section>

    <section className="workspace-analytics__panel workspace-analytics__sources" aria-labelledby="workspace-source-title">
      <div className="workspace-analytics__section-heading"><div><h2 id="workspace-source-title">询盘来源分布</h2><p>按询盘记录的推广来源（UTM Source）汇总；未记录来源的询盘单独列出。</p></div><TrendingUp size={19} aria-hidden="true" /></div>
      {leads.status !== 'ready' ? <p className="workspace-analytics__source-empty">{leadMessage}</p> : !leads.sources.length ? <p className="workspace-analytics__source-empty">所选时间范围暂无询盘来源数据。</p> : <ul className="workspace-analytics__source-list">
        {leads.sources.map((source) => <li key={source.label}><span title={source.label}>{source.label}</span><meter value={source.count} min={0} max={leads.count || 1} aria-label={`${source.label}：${source.count}条，占${Math.round(source.count / (leads.count || 1) * 100)}%`} /><strong>{source.count} <small>条 · {Math.round(source.count / (leads.count || 1) * 100)}%</small></strong></li>)}
      </ul>}
    </section>

    <section className="workspace-analytics__content" aria-labelledby="workspace-content-title">
      <div className="workspace-analytics__section-heading"><div><h2 id="workspace-content-title">内容概览</h2><p>当前公司全部已保存的内容记录，包含草稿；不受上方时间范围影响。</p></div><span className="workspace-analytics__live"><i />真实记录</span></div>
      <div className="workspace-analytics__grid">
        {content.map(({ label, count, href, hint, icon: Icon }) => <article className="workspace-analytics__card" key={label}>
          <div className="workspace-analytics__card-icon"><Icon size={19} aria-hidden="true" /></div><p>{label}</p><strong>{count.toLocaleString('zh-CN')}</strong>
          <div className="workspace-analytics__card-footer"><span>{hint}</span><Link aria-label={`管理${label}`} href={href}>管理<ArrowRight size={14} aria-hidden="true" /></Link></div>
        </article>)}
      </div>
    </section>

    <section className="workspace-analytics__next" aria-labelledby="workspace-next-title">
      <div><span className="workspace-analytics__next-icon"><Globe2 size={19} aria-hidden="true" /></span><div><h2 id="workspace-next-title">检查网站页面</h2><p>编辑首页、公司介绍、常见问题和联系信息，再预览客户网站。</p></div></div>
      <div className="workspace-analytics__next-actions"><Link href={`/workspace/${company.slug}/website/homepage`}>编辑首页<ArrowRight size={15} aria-hidden="true" /></Link><a href={`/s/${company.slug}/zh`} rel="noopener noreferrer" target="_blank">预览网站<ArrowRight size={15} aria-hidden="true" /></a></div>
    </section>
  </section>
}
