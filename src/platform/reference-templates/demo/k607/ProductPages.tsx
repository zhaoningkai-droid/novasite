'use client'
import { DemoAnchor, demoHTML } from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import { useK607Page, useK607Site, pageLinks } from './TemplateData'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from '../DemoLink'
import { ArrowDown, ArrowLeft, ArrowRight, ChevronDown, ZoomIn } from 'lucide-react'
import productData from './product-data.json'
import source from './source-data.json'
import { LocalContactForm } from './CorporatePages'
import './products.css'
type Card = {
  href: string
  title: string
  image: string
}
type Listing = {
  kind: 'list'
  items: Card[]
  pagination: {
    href: string
    text: string
  }[]
}
type Detail = {
  kind: 'detail'
  title: string
  date: string
  tags: string[]
  images: {
    src: string
    alt: string
  }[]
  html: string
  content?: ReactNode
  summary?: string | null
  datasheet?: string
  recommended: Card[]
}
const pages = productData as Record<string, Listing | Detail>
const demoCategories = [
  { title: '动物形象类', href: '/product/c1/' },
  { title: '卡通形象类', href: '/product/c2/' },
  { title: '创意水果类', href: '/product/c3/' },
  { title: '三丽欧系列类', href: '/product/c14/' },
  { title: '维尼熊IP', href: '/product/c15/' },
]
function ProductSidebar({ path }: { path: string }) {
  const m = useK607Page(),
    site = useK607Site()
  const categories = m
    ? (
        m.categories ||
        site?.links.find((l) => l.href.split('?')[0] === m.base + '/products')?.children ||
        []
      ).map((c) => ({ title: c.label, href: c.href }))
    : demoCategories
  const sidebar = useRef<HTMLElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = sidebar.current
    const placeholder = slot.current
    if (!element || !placeholder) return
    const detail = path.endsWith('.html')
    let frame = 0
    function update() {
      if (!element || !placeholder) return
      const region = placeholder.closest(detail ? '.product-detail-columns' : '.catalog')
      if (!region || window.innerWidth <= 1200) {
        element.removeAttribute('style')
        return
      }
      const fixed = window.scrollY > (detail ? 680 : 570)
      placeholder.style.minHeight = `${element.offsetHeight}px`
      if (!fixed) {
        element.removeAttribute('style')
        return
      }
      const box = placeholder.getBoundingClientRect()
      // Preserve the column width while fixing the panel to the viewport bottom.
      Object.assign(element.style, {
        position: 'fixed',
        width: `${box.width}px`,
        left: `${box.left}px`,
        top: 'auto',
        bottom: `${Math.max(detail ? 5 : 0, window.innerHeight - region.getBoundingClientRect().bottom)}px`,
      })
    }
    function queueUpdate() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(queueUpdate)
    observer.observe(element)
    window.addEventListener('scroll', queueUpdate, { passive: true })
    window.addEventListener('resize', queueUpdate)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', queueUpdate)
      window.removeEventListener('resize', queueUpdate)
    }
  }, [path])
  const [expanded, setExpanded] = useState(path === '/product/c16/')
  return (
    <div ref={slot} className="catalog-sidebar-slot">
      <aside
        ref={sidebar}
        className={`catalog-sidebar ${path.endsWith('.html') ? 'is-detail' : 'is-list'}`}
      >
        <div className="catalog-sidebar-heading">
          <span aria-hidden="true">PRODUCT</span>
          <h2>产品中心</h2>
          {path.endsWith('.html') && <p>产品中心</p>}
        </div>
        <nav aria-label="产品分类">
          {categories.map((category) => (
            <div
              className={`catalog-category-group ${expanded ? 'is-expanded' : ''}`}
              key={category.href}
            >
              <DemoAnchor href={category.href} className={path === category.href ? 'active' : ''}>
                {category.title}
              </DemoAnchor>
              {category.href === '/product/c15/' && (
                <>
                  <button
                    className="catalog-category-toggle"
                    aria-label="展开维尼熊IP分类"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(!expanded)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <Link
                    className="catalog-subcategory"
                    href="/product/c16/"
                    aria-current={path === '/product/c16/' ? 'page' : undefined}
                  >
                    维尼维尼
                  </Link>
                </>
              )}
            </div>
          ))}
        </nav>
        <DemoAnchor
          className="catalog-service"
          href={site ? `tel:${site.contact.phone || ''}` : 'tel:123456789'}
        >
          <span className="source-icon catalog-phone-icon" aria-hidden="true">
            &#xe621;
          </span>
          <span>
            服务热线：<strong>{site ? site.contact.phone : '123456789'}</strong>
          </span>
        </DemoAnchor>
      </aside>
    </div>
  )
}
function ProductCard({ card }: { card: Card }) {
  return (
    <DemoAnchor className="catalog-card" href={card.href}>
      <div>
        <img src={card.image} alt={card.title} width="700" height="700" />
      </div>
      <p>{card.title}</p>
    </DemoAnchor>
  )
}
function RecommendedProducts({ cards }: { cards: Card[] }) {
  const track = useRef<HTMLDivElement>(null)
  const pointer = useRef({
    down: false,
    start: 0,
    scroll: 0,
    moved: false,
    last: 0,
    time: 0,
    velocity: 0,
  })
  const [activeCard, setActiveCard] = useState<string | null>(null)
  useEffect(() => {
    const element = track.current
    if (!element) return
    // The source Swiper starts at slide 2 and clamps against its final visible group.
    const item = element.firstElementChild as HTMLElement | null
    if (item) {
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0
      element.scrollLeft = Math.min(
        2 * (item.offsetWidth + gap),
        element.scrollWidth - element.clientWidth,
      )
    }
  }, [])
  function move(direction: number) {
    const element = track.current
    const item = element?.firstElementChild as HTMLElement | null
    if (!element || !item) return
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0
    element.scrollBy({
      left: direction * (item.offsetWidth + gap),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }
  return (
    <div className="product-recommended-carousel">
      <div
        className="product-recommended-grid"
        ref={track}
        aria-label="推荐产品轮播"
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return
          pointer.current = {
            down: true,
            start: event.clientX,
            scroll: event.currentTarget.scrollLeft,
            moved: false,
            last: event.clientX,
            time: performance.now(),
            velocity: 0,
          }
        }}
        onPointerMove={(event) => {
          const state = pointer.current
          if (!state.down) return
          const distance = event.clientX - state.start
          if (!state.moved && Math.abs(distance) < 5) return
          if (!state.moved) {
            event.currentTarget.setPointerCapture(event.pointerId)
            event.currentTarget.classList.add('is-dragging')
          }
          state.moved = true
          const now = performance.now()
          state.velocity = (state.last - event.clientX) / Math.max(1, now - state.time)
          state.last = event.clientX
          state.time = now
          event.currentTarget.scrollLeft = state.scroll - distance
          event.preventDefault()
        }}
        onPointerUp={(event) => {
          const state = pointer.current
          if (!state.down) return
          state.down = false
          event.currentTarget.classList.remove('is-dragging')
          if (!state.moved) return
          const element = event.currentTarget
          if (element.hasPointerCapture(event.pointerId))
            element.releasePointerCapture(event.pointerId)
          const first = element.firstElementChild as HTMLElement | null
          const step =
            (first?.offsetWidth || element.clientWidth) +
            (parseFloat(getComputedStyle(element).columnGap) || 0)
          const velocity = performance.now() - state.time < 100 ? state.velocity : 0
          element.scrollTo({
            left: Math.round((element.scrollLeft + velocity * 120) / step) * step,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          })
        }}
        onPointerCancel={(event) => {
          pointer.current.down = false
          event.currentTarget.classList.remove('is-dragging')
        }}
        onClickCapture={(event) => {
          if (pointer.current.moved) event.preventDefault()
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        {cards.map((card) => (
          <div
            key={card.href}
            className={`product-recommended-slide ${activeCard === card.href ? 'is-active' : ''}`}
            onMouseEnter={() => setActiveCard(card.href)}
            onFocus={() => setActiveCard(card.href)}
          >
            <ProductCard card={card} />
            <span className="product-recommended-overlay source-icon" aria-hidden="true">
              &#xe77a;
            </span>
          </div>
        ))}
      </div>
      <div className="product-recommended-controls">
        <button aria-label="下一张推荐产品" onClick={() => move(1)}>
          <ArrowRight />
        </button>
        <button aria-label="上一张推荐产品" onClick={() => move(-1)}>
          <ArrowLeft />
        </button>
      </div>
    </div>
  )
}
function ProductGallery({
  images,
  onZoom,
}: {
  images: Detail['images']
  onZoom: (index: number) => void
}) {
  const multiple = images.length > 1
  const [position, setPosition] = useState(multiple ? 1 : 0)
  const [resetting, setResetting] = useState(false)
  const moving = useRef(false)
  const drag = useRef({ start: 0, moved: false })
  const index = multiple ? (position - 1 + images.length) % images.length : 0
  const slides = multiple ? [images[images.length - 1], ...images, images[0]] : images
  function select(delta: number) {
    if (!multiple || moving.current) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPosition((current) => ((current - 1 + delta + images.length) % images.length) + 1)
      return
    }
    moving.current = true
    setPosition((current) => current + delta)
  }
  useEffect(() => {
    if (!resetting) return
    let secondFrame = 0
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setResetting(false)
        moving.current = false
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
    }
  }, [resetting])
  return (
    <div className="product-photos">
      <div
        className="product-detail-gallery"
        role="group"
        aria-label="产品图片轮播"
        onPointerDown={(event) => {
          drag.current = { start: event.clientX, moved: false }
        }}
        onPointerUp={(event) => {
          const distance = event.clientX - drag.current.start
          if (Math.abs(distance) > 40) {
            drag.current.moved = true
            select(distance < 0 ? 1 : -1)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            select(event.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        <div
          className="product-detail-gallery-track"
          style={{
            transform: `translateX(-${position * 100}%)`,
            transition: resetting ? 'none' : undefined,
          }}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
            if (position === 0 && multiple) {
              setResetting(true)
              setPosition(images.length)
            } else if (position === images.length + 1) {
              setResetting(true)
              setPosition(1)
            } else moving.current = false
          }}
        >
          {slides.map((photo, slide) => {
            const actual = multiple ? (slide - 1 + images.length) % images.length : 0
            const clone = multiple && (slide === 0 || slide === slides.length - 1)
            return (
              <button
                key={photo.src + slide}
                className="product-photo"
                aria-label={`放大产品图片 ${actual + 1}`}
                aria-hidden={clone || undefined}
                tabIndex={!clone && actual === index ? 0 : -1}
                onClick={() => {
                  if (!drag.current.moved) onZoom(actual)
                  drag.current.moved = false
                }}
              >
                <img
                  src={photo.src}
                  alt={clone ? '' : photo.alt}
                  width="900"
                  height="900"
                  draggable={false}
                />
                <ZoomIn size={24} />
              </button>
            )
          })}
        </div>
      </div>
      <div className={`product-photo-dots ${multiple ? '' : 'is-single'}`}>
        {images.map((photo, i) => (
          <button
            key={photo.src + i}
            aria-label={`产品图片 ${i + 1}`}
            aria-pressed={index === i}
            className={index === i ? 'active' : ''}
            onClick={() => {
              moving.current = false
              setPosition(multiple ? i + 1 : 0)
            }}
          />
        ))}
      </div>
    </div>
  )
}
function ProductDetail({ data, path }: { data: Detail; path: string }) {
  const m = useK607Page()
  const cases = m
    ? (m.cases || []).map((c) => ({
        title: c.title,
        image: { local: c.image || '' },
        href: c.href,
      }))
    : source.cases.map((c, i) => ({ ...c, href: `/case/${[8, 22, 18, 7][i]}.html` }))
  const [imageIndex, setImageIndex] = useState(0)
  const [activeCase, setActiveCase] = useState<number | null>(null)
  const lightbox = useRef<HTMLDialogElement>(null)
  const image = data.images[imageIndex]
  return (
    <>
      <section className="product-summary">
        <div className="page-width product-summary-inner">
          <ProductGallery
            images={data.images}
            onZoom={(index) => {
              setImageIndex(index)
              lightbox.current?.showModal()
            }}
          />
          <div className="product-summary-copy">
            <h1>{data.title}</h1>
            <dl>
              <div>
                <dt>添加时间：</dt>
                <dd>{data.date}</dd>
              </div>
              <div>
                <dt>产品描述：</dt>
                <dd>{data.summary}</dd>
              </div>
              <div>
                <dt>产品标签：</dt>
                <dd className="product-tags">
                  {data.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="product-summary-actions">
              <Link className="product-inquiry" href="/contact/#msg">
                在线咨询 +
              </Link>
              <DemoAnchor className="product-more" href="#section1">
                <ArrowDown size={18} />
                向下了解更多详细信息
              </DemoAnchor>
            </div>
          </div>
        </div>
      </section>
      <div className="page-width product-detail-body">
        <nav className="product-anchors" aria-label="产品内容">
          <DemoAnchor href="#section1">产品详情</DemoAnchor>
          <DemoAnchor href="#section4">猜你喜欢</DemoAnchor>
        </nav>
        <div className="product-detail-columns">
          <div className="product-rich-column">
            <section id="section1">
              <div className="product-detail-title">
                <span>INTRODUCTION</span>
                <h2>产品详情</h2>
                <p>PRODUCT INTRODUCTION</p>
              </div>
              <div className="product-rich-text">
                {m ? (
                  <>
                    {data.content}
                    {m.parameters?.length ? (
                      <table>
                        <tbody>
                          {m.parameters.map((p, i) => (
                            <tr key={i}>
                              <th>{p.label}</th>
                              <td>{p.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                    {data.datasheet ? (
                      <DemoAnchor href={data.datasheet} target="_blank" rel="noopener noreferrer">
                        下载产品资料
                      </DemoAnchor>
                    ) : null}
                  </>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: demoHTML(data.html, 'k607') }} />
                )}
              </div>
            </section>
            {cases.length > 0 && (
              <section className="product-case-section" id="section3">
                <div className="product-detail-title">
                  <span>COOPERATION</span>
                  <h2>案例中心</h2>
                </div>
                <div className="product-case-grid">
                  {cases.map((item, i) => (
                    <DemoAnchor
                      key={item.title}
                      href={item.href}
                      className={activeCase === i ? 'is-active' : ''}
                      onMouseEnter={() => setActiveCase(i)}
                      onFocus={() => setActiveCase(i)}
                    >
                      <img src={item.image.local} alt={item.title} width="800" height="450" />
                      <span>{item.title}</span>
                    </DemoAnchor>
                  ))}
                </div>
              </section>
            )}
          </div>
          <ProductSidebar path={path} />
        </div>
      </div>
      <section className="product-local-inquiry page-width">
        <LocalContactForm heading="联系我们" product={data.title} />
      </section>
      {data.recommended.length > 0 && (
        <section className="product-recommended page-width" id="section4">
          <div className="product-detail-title">
            <span>RECOMMENDED</span>
            <h2>猜你喜欢</h2>
            <p>RECOMMENDED PRODUCTS</p>
          </div>
          <RecommendedProducts cards={data.recommended} />
        </section>
      )}
      <dialog
        className="product-lightbox"
        ref={lightbox}
        onClick={(e) => {
          if (e.target === e.currentTarget) lightbox.current?.close()
        }}
      >
        <button autoFocus aria-label="关闭产品图片" onClick={() => lightbox.current?.close()}>
          ×
        </button>
        {image && <img src={image.src} alt={image.alt} width="1000" height="1000" />}
      </dialog>
    </>
  )
}
export function ProductPage({ path, page }: { path: string; page?: string }) {
  const m = useK607Page()
  const key = page === '2' && path === '/product/' ? '/product?page=2' : path
  const data: Listing | Detail | undefined = m
    ? m.kind === 'product'
      ? {
          kind: 'detail',
          title: m.title,
          date: m.publishedAt?.slice(0, 10) || '',
          tags: m.tags || [],
          images: (m.images || []).map((src) => ({ src, alt: m.title })),
          html: '',
          content: m.content,
          summary: m.summary,
          datasheet: m.datasheet,
          recommended: (m.products || []).map((c) => ({
            href: c.href,
            title: c.title,
            image: c.image || '',
          })),
        }
      : {
          kind: 'list',
          items: (m.cards || []).map((c) => ({
            href: c.href,
            title: c.title,
            image: c.image || '',
          })),
          pagination: pageLinks(m),
        }
    : pages[key]
  if (!data) return null
  if (data.kind === 'detail') return <ProductDetail data={data} path={path} />
  return (
    <section className="catalog page-width">
      <ProductSidebar path={path} />
      <div className="catalog-content">
        <h1 className="sr-only">产品中心</h1>
        <div className="catalog-grid">
          {data.items.map((card) => (
            <ProductCard key={card.href} card={card} />
          ))}
        </div>
        {data.items.length === 0 && <p className="catalog-empty">暂无产品</p>}
        <nav className="catalog-pagination" aria-label="产品分页">
          {data.pagination.map((item, i) =>
            item.href && !item.href.startsWith('javascript:') ? (
              <DemoAnchor
                key={i}
                href={item.href}
                aria-label={
                  item.text === '>>' ? '下一页' : item.text === '<<' ? '上一页' : item.text
                }
              >
                {item.text}
              </DemoAnchor>
            ) : (
              <span
                key={i}
                className={item.href ? 'current' : ''}
                aria-current={item.href ? 'page' : undefined}
              >
                {item.text}
              </span>
            ),
          )}
        </nav>
      </div>
    </section>
  )
}
