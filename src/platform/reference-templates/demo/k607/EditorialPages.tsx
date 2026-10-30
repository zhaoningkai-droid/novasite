'use client'
import { DemoAnchor, demoHTML } from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import { useK607Page, pageLinks } from './TemplateData'
import type { ReactNode } from 'react'
import editorialData from './editorial-data.json'
import './editorial.css'
type EditorialList = {
  kind: 'list'
  items: {
    href: string
    title: string
    date: string
    image: string
  }[]
  pagination: {
    href: string
    text: string
    title: string
  }[]
}
type EditorialDetail = {
  kind: 'detail'
  title: string
  date: string
  html: string
  content?: ReactNode
  previousHtml: string
  nextHtml: string
  backHref: string
}
const pages = editorialData as Record<string, EditorialList | EditorialDetail>
export function EditorialPage({ path, page }: { path: string; page?: string }) {
  const m = useK607Page()
  const normalizedPath = path.endsWith('.html') || path.endsWith('/') ? path : `${path}/`
  const data: EditorialList | EditorialDetail | undefined = m
    ? m.kind === 'article'
      ? {
          kind: 'detail',
          title: m.title,
          date: m.model?.slice(0, 10) || '',
          html: '',
          content: (
            <>
              {m.images?.map((src) => (
                <img src={src} alt={m.title} key={src} />
              ))}
              {m.content}
            </>
          ),
          previousHtml: '',
          nextHtml: '',
          backHref: `${m.base}/${m.section}`,
        }
      : {
          kind: 'list',
          items: (m.cards || []).map((c) => ({
            href: c.href,
            title: c.title,
            date: c.date?.slice(0, 10) || '',
            image: c.image || '',
          })),
          pagination: pageLinks(m),
        }
    : (pages[page && page !== '1' ? `${normalizedPath}?page=${page}` : normalizedPath] ??
      pages[normalizedPath])
  if (!data) return null
  if (data.kind === 'detail') {
    return (
      <section className="k607-editorial-detail">
        <div className="k607-editorial-container">
          <article className="k607-editorial-article">
            <h1>{data.title}</h1>
            <p className="k607-editorial-date">{data.date}</p>
            <div className="k607-editorial-richtext">
              {m ? (
                data.content
              ) : (
                <div dangerouslySetInnerHTML={{ __html: demoHTML(data.html, 'k607') }} />
              )}
            </div>
            <nav className="k607-editorial-neighbors" aria-label="文章导航">
              <div>
                {m ? (
                  m.previous ? (
                    <DemoAnchor href={m.previous.href}>上一篇：{m.previous.label}</DemoAnchor>
                  ) : (
                    <span>上一篇：暂无</span>
                  )
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: demoHTML(
                        data.previousHtml.replace(/^<div>/, '').replace(/<\/div>$/, ''),
                        'k607',
                      ),
                    }}
                  />
                )}
              </div>
              <DemoAnchor
                className="k607-editorial-back"
                href={data.backHref}
                aria-label="返回列表"
              >
                <span className="source-icon" aria-hidden="true">
                  &#xe779;
                </span>
              </DemoAnchor>
              <div>
                {m ? (
                  m.next ? (
                    <DemoAnchor href={m.next.href}>下一篇：{m.next.label}</DemoAnchor>
                  ) : (
                    <span>下一篇：暂无</span>
                  )
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: demoHTML(
                        data.nextHtml.replace(/^<div>/, '').replace(/<\/div>$/, ''),
                        'k607',
                      ),
                    }}
                  />
                )}
              </div>
            </nav>
          </article>
        </div>
      </section>
    )
  }
  return (
    <section className="k607-editorial-list">
      <div className="k607-editorial-container">
        <div className="k607-editorial-grid">
          {data.items.map((item) => (
            <DemoAnchor href={item.href} className="k607-editorial-card" key={item.href}>
              <p className="k607-editorial-card-date">{item.date}</p>
              <h2 title={item.title}>{item.title}</h2>
              <div className="k607-editorial-card-image">
                <img src={item.image} alt={item.title} />
              </div>
              <div className="k607-editorial-more">
                <span>了解更多</span>
                <span className="k607-editorial-arrow" aria-hidden="true">
                  <span className="source-icon">&#xe658;</span>
                </span>
              </div>
            </DemoAnchor>
          ))}
        </div>
        {data.pagination.length > 0 && (
          <nav className="k607-editorial-pagination" aria-label="分页">
            {data.pagination.map((item, i) => (
              <DemoAnchor
                key={`${item.text}-${i}`}
                href={item.href}
                title={item.title || undefined}
                aria-current={item.text === '1' ? 'page' : undefined}
              >
                {item.text}
              </DemoAnchor>
            ))}
          </nav>
        )}
      </div>
    </section>
  )
}
