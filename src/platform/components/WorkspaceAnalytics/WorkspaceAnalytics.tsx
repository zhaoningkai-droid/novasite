'use client'

import { CalendarRange, Download, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { WorkspaceCompany } from '@/platform/workspace'

import './workspace-analytics.scss'

type Range = '7d' | '30d' | 'year'
type Source = { color: string; label: string; value: number }
type Dashboard = { comparison: { inquiries: number; pv: number; totalPV: number; uv: number }; inquiries: number; pv: number; source: Source[]; totalPV: number; trend: { pv: number[]; uv: number[] }; uv: number }

const labels: Record<Range, string> = { '7d': '近7天', '30d': '近30天', year: '近一年' }
const sources = [
  { color: '#1765c1', label: '直接访问' }, { color: '#84d400', label: '搜索引擎' }, { color: '#ffbd35', label: '电子邮件' }, { color: '#11aee0', label: '大模型' }, { color: '#f34b4b', label: '社交媒体' },
]

const hash = (input: string) => [...input].reduce((total, char) => total + char.charCodeAt(0), 0)

function makeDashboard(slug: string, range: Range): Dashboard {
  const seed = hash(slug)
  const multiplier = range === '7d' ? 1 : range === '30d' ? 4 : 37
  const pv = (78 + (seed % 39)) * multiplier
  const uv = Math.round(pv * (0.43 + (seed % 8) / 100))
  const inquiries = Math.max(1, Math.round(pv / 44))
  const points = range === '7d' ? 7 : range === '30d' ? 10 : 12
  const distribute = (total: number, count: number, offset: number) => {
    const weights = Array.from({ length: count }, (_, index) => 20 + ((seed + offset + index * 19) % 37))
    const weightTotal = weights.reduce((sum, value) => sum + value, 0)
    const exact = weights.map((weight) => total * weight / weightTotal)
    const values = exact.map(Math.floor)
    const remainder = total - values.reduce((sum, value) => sum + value, 0)
    const order = exact.map((value, index) => ({ fraction: value - Math.floor(value), index }))
      .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    for (let index = 0; index < remainder; index++) values[order[index].index] += 1
    return values
  }
  const trendPV = distribute(pv, points, 0)
  const trendUV = distribute(uv, points, 71)
  const sourceValues = distribute(pv, sources.length, 143)
  const source = sources.map((item, index) => ({ ...item, value: sourceValues[index] }))

  return { comparison: { inquiries: -4 + seed % 13, pv: -8 + seed % 19, totalPV: -6 + seed % 18, uv: -5 + seed % 17 }, inquiries, pv, source, totalPV: 12000 + seed * 17, trend: { pv: trendPV, uv: trendUV }, uv }
}

const percent = (value: number) => value === 0 ? '→ 0%' : `${value > 0 ? '↑' : '↓'} ${Math.abs(value)}%`

function LineChart({ dashboard, range }: { dashboard: Dashboard; range: Range }) {
  const values = [...dashboard.trend.pv, ...dashboard.trend.uv]
  const max = Math.max(...values, 1)
  const line = (data: number[]) => data.map((value, index) => `${index * (640 / Math.max(data.length - 1, 1))},${214 - value / max * 174}`).join(' ')
  const scaleLabels: Record<Range, [string, string, string]> = { '7d': ['7天前', '前3天', '今天'], '30d': ['30天前', '15天前', '今天'], year: ['去年', '半年前', '本月'] }
  return <div className="workspace-analytics__chart" data-testid="trend-chart" data-pv-total={dashboard.pv} data-uv-total={dashboard.uv}>
    <div className="workspace-analytics__legend"><span><i className="workspace-analytics__dot workspace-analytics__dot--pv" />PV</span><span><i className="workspace-analytics__dot workspace-analytics__dot--uv" />UV</span></div>
    <svg aria-label={`PV和UV趋势图，${labels[range]}`} role="img" viewBox="0 0 640 240"><line x1="0" x2="640" y1="40" y2="40" /><line x1="0" x2="640" y1="127" y2="127" /><line x1="0" x2="640" y1="214" y2="214" /><polyline className="workspace-analytics__line workspace-analytics__line--pv" points={line(dashboard.trend.pv)} /><polyline className="workspace-analytics__line workspace-analytics__line--uv" points={line(dashboard.trend.uv)} /></svg>
    <div className="workspace-analytics__chart-axis" aria-hidden="true">{scaleLabels[range].map((label) => <span key={label}>{label}</span>)}</div>
  </div>
}

function DonutChart({ source }: { source: Source[] }) {
  const total = source.reduce((sum, item) => sum + item.value, 0)
  const offsets = source.map((_, index) => source.slice(0, index).reduce((sum, item) => sum + item.value / total * 320.44, 0))
  return <div className="workspace-analytics__donut-wrap" data-testid="source-chart"><svg aria-label="来源分布环图" role="img" viewBox="0 0 160 160"><circle className="workspace-analytics__donut-track" cx="80" cy="80" r="51" />{source.map((item, index) => { const fraction = item.value / total; return <circle className="workspace-analytics__donut-segment" cx="80" cy="80" key={item.label} r="51" stroke={item.color} strokeDasharray={`${fraction * 320.44} ${320.44 - fraction * 320.44}`} strokeDashoffset={-offsets[index]} /> })}<text x="80" y="76">来源</text><text className="workspace-analytics__donut-total" data-testid="source-total" x="80" y="96">{total}</text></svg><ul>{source.map((item) => <li key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{item.value}次</b><small>{(item.value / total * 100).toFixed(1)}%</small></li>)}</ul></div>
}

export function WorkspaceAnalytics({ company }: { company: WorkspaceCompany }) {
  const [range, setRange] = useState<Range>('year')
  const [feedback, setFeedback] = useState('')
  const dashboard = useMemo(() => makeDashboard(company.slug, range), [company.slug, range])
  const metrics = [{ label: '累计PV', testId: 'metric-total-pv', value: dashboard.totalPV, change: dashboard.comparison.totalPV }, { label: 'UV', testId: 'metric-uv', value: dashboard.uv, change: dashboard.comparison.uv }, { label: 'PV', testId: 'metric-pv', value: dashboard.pv, change: dashboard.comparison.pv }, { label: '询盘量', testId: 'metric-inquiries', value: dashboard.inquiries, change: dashboard.comparison.inquiries }]
  const refresh = () => { setFeedback(`已更新${labels[range]}的演示数据。真实流量尚未接入。`) }
  const exportCSV = () => {
    const lines = ['指标,数值', ...metrics.map((item) => `${item.label},${item.value}`), '', '来源,访问次数', ...dashboard.source.map((item) => `${item.label},${item.value}`)]
    const href = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = href; link.download = `${company.slug}-${labels[range]}-网站数据演示.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    setFeedback('已导出当前范围的演示数据 CSV 文件。')
  }
  return <section className="workspace-analytics" aria-label="网站数据看板" data-testid="workspace-analytics">
    <header className="workspace-analytics__title"><div><h1>网站数据</h1><p data-testid="analytics-company">当前公司：{company.name}</p></div><span>演示数据，尚未接入真实流量统计</span></header>
    <div className="workspace-analytics__toolbar"><span className="workspace-analytics__period"><CalendarRange size={16} />统计周期</span><div className="workspace-analytics__actions"><button onClick={refresh} type="button"><RefreshCw size={16} />刷新数据</button><button onClick={exportCSV} type="button"><Download size={16} />导出演示数据</button><div className="workspace-analytics__ranges" aria-label="统计时间范围" role="group">{(Object.keys(labels) as Range[]).map((item) => <button aria-pressed={range === item} className={range === item ? 'workspace-analytics__range--active' : ''} data-testid={`range-${item}`} key={item} onClick={() => { setRange(item); setFeedback('') }} type="button">{labels[item]}</button>)}</div></div></div>
    {feedback && <p className="workspace-analytics__feedback" role="status">{feedback}</p>}
    <section className="workspace-analytics__overview" aria-labelledby="analytics-overview"><div className="workspace-analytics__overview-head"><h2 id="analytics-overview">数据概览</h2><span>当前周期：{labels[range]}</span></div><div className="workspace-analytics__metrics">{metrics.map((item) => <article key={item.label}><h3>{item.label}</h3><strong data-testid={item.testId}>{item.value.toLocaleString()}</strong><p>较上期 <b className={item.change > 0 ? 'workspace-analytics__up' : item.change < 0 ? 'workspace-analytics__down' : 'workspace-analytics__same'}>{percent(item.change)}</b></p></article>)}</div></section>
    <div className="workspace-analytics__panels"><article><h2>PV/UV趋势 <small>按周期分布</small></h2><LineChart dashboard={dashboard} range={range} /></article><article><h2>访问来源 <small>演示数据</small></h2><DonutChart source={dashboard.source} /></article></div>
  </section>
}
