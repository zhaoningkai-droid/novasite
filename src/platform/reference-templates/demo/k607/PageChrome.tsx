'use client'
import { DemoAnchor } from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import { useK607Page } from './TemplateData'
import chromeData from './page-chrome.json'
import './subpages.css'
type PageInfo = {
  title: string
  banner: {
    src: string
    alt: string
  }[]
  tabs: {
    href: string
    text: string
  }[]
  crumbs: {
    href: string
    text: string
  }[]
}
const pages = chromeData as Record<string, PageInfo>
export function PageChrome({ path }: { path: string }) {
  const m = useK607Page()
  const sample =
    pages[path] ||
    pages[
      path.startsWith('/product') ? '/product/' : path.startsWith('/case') ? '/case/' : '/article/'
    ]
  const page = m
    ? {
        title: m.title,
        banner: m.image ? [{ src: m.image, alt: '' }] : sample?.banner || [],
        tabs: (m.section === 'products'
          ? [{ label: '产品中心', href: m.base + '/products' }]
          : m.categories || []
        ).map((c) => ({ text: c.label, href: c.href })),
        crumbs: [
          { text: '首页', href: m.base },
          { text: m.title, href: '#main' },
        ],
      }
    : (pages[path] ?? pages[`${path}/`])
  if (!page) return null
  return (
    <>
      <div className="inner-banner">
        {page.banner.map((image) => (
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            width="1920"
            height="700"
            fetchPriority="high"
          />
        ))}
      </div>
      <div
        className={`inner-position ${path.startsWith('/product') && !path.endsWith('.html') ? 'catalog-position' : ''}`}
      >
        <div className="page-width inner-position-row">
          <nav className="inner-tabs" aria-label="栏目导航">
            {page.tabs.map((tab, i) => (
              <DemoAnchor
                key={`${tab.text}-${i}`}
                href={tab.href.startsWith('javascript:') ? path : tab.href}
                className={tab.href.startsWith('javascript:') || tab.href === path ? 'active' : ''}
              >
                {tab.text}
              </DemoAnchor>
            ))}
          </nav>
          <nav className="inner-crumbs" aria-label="当前位置">
            <span className="source-icon crumb-icon" aria-hidden="true">
              &#xe66e;
            </span>
            <span>当前位置：</span>
            {page.crumbs.map((crumb, i) => (
              <span key={`${crumb.href}-${i}`}>
                {i > 0 && <span aria-hidden="true"> &gt;&gt; </span>}
                <DemoAnchor href={crumb.href}>{crumb.text}</DemoAnchor>
              </span>
            ))}
          </nav>
        </div>
      </div>
    </>
  )
}
