'use client'
import { DemoAnchor } from '../DemoLink'
/* Source content is extracted into editable data; motion is implemented in React. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import Swiper, { type SwiperOptions } from 'swiper'
import sampleData from './home-data.json'
import { useK712Page, useK712Site, homeSections } from './TemplateData'
import assets from './all-assets.json'
import './home.css'
const asset = (path: string) =>
  (assets as Record<string, string>)[`http://zh.preview.k712.temp.o668.com${path}`] || path
const titles = [
  '网站首页',
  '关于浩润',
  '企业视频',
  '产品中心',
  '荣誉资质',
  '项目案例',
  '新闻资讯',
  '网站底部',
]
function Arrow({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <button
      type="button"
      className={`swiper-button-${direction}`}
      aria-label={direction === 'next' ? '下一个' : '上一个'}
      onClick={(event) => event.stopPropagation()}
    >
      <i className={`iconfont icon-xiang${direction === 'next' ? 'you' : 'zuo'}jiantou`} />
    </button>
  )
}
function Section({
  index,
  active,
  className,
  children,
}: {
  index: number
  active: number
  className: string
  children: ReactNode
}) {
  const m = useK712Page()
  const position = homeSections(m).indexOf(index)
  if (position < 0) return null
  return (
    <section
      className={`section fp-section fp-table ${className}${position === active ? ' active fp-completely' : ''}`}
      data-anchor={`page${position + 1}`}
      aria-label={
        m
          ? [
              m.company,
              m.intro?.title || '关于我们',
              m.video?.title || '官方视频',
              '产品中心',
              '企业实力',
              '案例中心',
              '新闻资讯',
              '联系我们',
            ][index]
          : titles[index]
      }
    >
      {children}
    </section>
  )
}
export function HomePage() {
  const m = useK712Page(),
    site = useK712Site()
  const data = m
    ? {
        banners: (m.banners || []).map((b) => b.desktopImage || b.mobileImage || ''),
        about: m.intro?.text || '',
        aboutImage: m.intro?.image || '',
        video: m.video?.src || '',
        categories: (m.productGroups?.length
          ? m.productGroups
          : (m.categories || []).map((c) => ({
              label: c.label,
              href: c.href,
              items: m.products || [],
            }))
        ).map((c) => ({ title: c.label, href: c.href, items: c.items })),
        products: (m.products || []).map((c) => ({
          title: c.title,
          href: c.href,
          image: c.image || '',
        })),
        certificates: (m.stats || []).map((c) => ({
          image: c.image || '',
          title: c.label,
          value: (c.value || '') + (c.unit || ''),
        })),
        cases: (m.cases || []).map((c) => ({ title: c.title, href: c.href, image: c.image || '' })),
        news: (m.news || []).map((c) => ({
          title: c.title,
          href: c.href,
          image: c.image || '',
          summary: c.summary || '',
        })),
      }
    : {
        ...sampleData,
        categories: sampleData.categories.map((c) => ({ ...c, items: undefined })),
        certificates: sampleData.certificates.map((c) => ({ ...c, value: '' })),
      }
  const count = homeSections(m).length
  const phone = site ? site.contact.phone || '' : '123456789',
    email = site ? site.contact.email || '' : '123456789@gmail.com',
    whatsapp = site ? site.contact.whatsapp || '' : '45454545',
    address = site ? site.contact.address || '' : '河北省石家庄市桥西区石家庄站2层'
  const qrs = site
    ? site.contact.qr || []
    : ['WhatsApp', '微信', 'Weixin'].map((label) => ({
        label,
        image: (assets as Record<string, string>)[
          'http://shanghai.waimao.o668.com/upload/hegeer/202603/18cf43ad70a9b6487e432d995fd22ccf.png'
        ],
      }))
  const [section, setSection] = useState(0)
  const sectionRef = useRef(0)
  const shell = useRef<HTMLDivElement>(null)
  const [category, setCategory] = useState(0)
  const productGallery = useRef<Swiper | null>(null)
  const bannerGallery = useRef<Swiper | null>(null)
  const [modal, setModal] = useState<{
    title: string
    image: string
  } | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const root = shell.current
    if (!root) return
    let lockedUntil = 0
    let wheelDistance = 0
    let lastWheelAt = 0
    let touch: {
      x: number
      y: number
    } | null = null
    let desktop = innerWidth >= 989
    let frame = 0
    const previousRestoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const target = (index: number) =>
      root.querySelector<HTMLElement>(`[data-anchor="page${index + 1}"]`)
    const resetNativeScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      root.scrollTop = 0
    }
    const move = (index: number, record = true, immediate = false) => {
      if (!Number.isFinite(index)) return
      const next = Math.max(0, Math.min(count - 1, index))
      sectionRef.current = next
      setSection(next)
      if (desktop) {
        resetNativeScroll()
        const hash = `#page${next + 1}`
        if (record && location.hash !== hash) history.pushState(null, '', hash)
      } else target(next)?.scrollIntoView({ behavior: immediate ? 'instant' : 'smooth' })
      window.dispatchEvent(new CustomEvent('k712:sectionchange', { detail: next }))
    }
    const inputMove = (next: number) => {
      if (Date.now() < lockedUntil || next === sectionRef.current) return
      lockedUntil = Date.now() + 700
      move(next)
    }
    const pageControl = (element: EventTarget | null) =>
      element instanceof Element &&
      !!element.closest(
        '.k712-lightbox, .mobile-nav-wrapper, .language-dropdown, [role="dialog"], input, textarea, select, [contenteditable="true"]',
      )
    const normalControl = (element: EventTarget | null) =>
      pageControl(element) || (element instanceof Element && !!element.closest('video'))
    const wheel = (event: WheelEvent) => {
      if (
        !desktop ||
        event.ctrlKey ||
        pageControl(event.target) ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      )
        return
      // Only yield to a genuinely scrollable element, not an overflowing table cell.
      let element = event.target instanceof Element ? event.target : null
      while (element && element !== root) {
        if (
          element instanceof HTMLElement &&
          /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY) &&
          element.scrollHeight > element.clientHeight + 1 &&
          (event.deltaY > 0
            ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
            : element.scrollTop > 1)
        )
          return
        element = element.parentElement
      }
      event.preventDefault()
      const now = Date.now()
      if (now < lockedUntil) {
        wheelDistance = 0
        return
      }
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1)
      if (now - lastWheelAt > 180 || Math.sign(delta) !== Math.sign(wheelDistance))
        wheelDistance = 0
      lastWheelAt = now
      wheelDistance += delta
      if (Math.abs(wheelDistance) >= 12) {
        inputMove(sectionRef.current + (wheelDistance > 0 ? 1 : -1))
        wheelDistance = 0
      }
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null)
        return
      }
      if (
        !desktop ||
        normalControl(event.target) ||
        (event.target instanceof Element && event.target.closest('button, a'))
      )
        return
      let next = sectionRef.current
      if (['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey))
        next++
      else if (['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey))
        next--
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = count - 1
      else return
      event.preventDefault()
      inputMove(next)
    }
    const hash = () => {
      const match = location.hash.match(/^#page([1-8])$/)
      if (match) move(Number(match[1]) - 1, false, true)
      else if (desktop) resetNativeScroll()
    }
    const custom = (event: Event) => move(Number((event as CustomEvent<number>).detail))
    const resize = () => {
      const wasDesktop = desktop
      desktop = innerWidth >= 989
      lockedUntil = 0
      if (desktop) move(sectionRef.current, false, true)
      else if (wasDesktop) move(sectionRef.current, false, true)
    }
    const touchStart = (event: TouchEvent) => {
      if (!desktop || pageControl(event.target)) {
        touch = null
        return
      }
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    const touchMove = (event: TouchEvent) => {
      if (
        desktop &&
        touch &&
        Math.abs(event.touches[0].clientY - touch.y) > Math.abs(event.touches[0].clientX - touch.x)
      )
        event.preventDefault()
    }
    const touchEnd = (event: TouchEvent) => {
      if (!desktop || !touch) return
      const dx = event.changedTouches[0].clientX - touch.x
      const dy = event.changedTouches[0].clientY - touch.y
      if (Math.abs(dy) > innerHeight * 0.05 && Math.abs(dy) > Math.abs(dx))
        inputMove(sectionRef.current + (dy < 0 ? 1 : -1))
      touch = null
    }
    const scroll = () => {
      if (desktop) {
        resetNativeScroll()
        return
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const sections = [...root.querySelectorAll<HTMLElement>('.section')]
        const index = sections.findIndex(
          (element) => element.getBoundingClientRect().bottom > innerHeight * 0.4,
        )
        if (index >= 0 && index !== sectionRef.current) {
          sectionRef.current = index
          setSection(index)
          window.dispatchEvent(new CustomEvent('k712:sectionchange', { detail: index }))
        }
      })
    }
    document.documentElement.classList.add('k712-home-document')
    if (desktop) resetNativeScroll()
    const timer = setTimeout(hash, 0)
    window.addEventListener('wheel', wheel, { passive: false, capture: true })
    window.addEventListener('keydown', keyboard)
    window.addEventListener('hashchange', hash)
    window.addEventListener('popstate', hash)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('k712:section', custom)
    root.addEventListener('touchstart', touchStart, { passive: true })
    root.addEventListener('touchmove', touchMove, { passive: false })
    root.addEventListener('touchend', touchEnd, { passive: true })
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      window.removeEventListener('wheel', wheel, true)
      window.removeEventListener('keydown', keyboard)
      window.removeEventListener('hashchange', hash)
      window.removeEventListener('popstate', hash)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('k712:section', custom)
      root.removeEventListener('touchstart', touchStart)
      root.removeEventListener('touchmove', touchMove)
      root.removeEventListener('touchend', touchEnd)
      history.scrollRestoration = previousRestoration
      document.documentElement.classList.remove('k712-home-document')
    }
  }, [count])
  useEffect(() => {
    const instances: Swiper[] = []
    const create = (selector: string, options: SwiperOptions) => {
      const element = document.querySelector<HTMLElement>(`.k712-home-shell ${selector}`)
      if (element) {
        const instance = new Swiper(element, options)
        instances.push(instance)
        return instance
      }
    }
    bannerGallery.current =
      create('#banner .swiper-container', {
        effect: 'fade',
        loop: data.banners.length > 1,
        speed: 1000,
        simulateTouch: true,
        allowTouchMove: true,
        grabCursor: true,
        autoplay:
          data.banners.length > 1
            ? { delay: 3600, disableOnInteraction: false, stopOnLastSlide: false }
            : false,
        pagination: { el: '#banner .swiper-pagination', clickable: true },
      }) || null
    create('.gallery-thumbs', {
      slidesPerView: 'auto',
      direction: 'vertical',
      freeMode: true,
      mousewheel: false,
    })
    productGallery.current =
      create('.gallery-top', { loop: false, allowTouchMove: false }) || null
    document
      .querySelectorAll<HTMLElement>('.k712-home-shell .gallery-top .sl_list')
      .forEach((element) => {
        const instance = new Swiper(element, {
          slidesPerView: 3,
          spaceBetween: 20,
          loop: false,
          observer: true,
          observeParents: true,
          autoplay: { delay: 2000, stopOnLastSlide: false, disableOnInteraction: false },
          navigation: {
            nextEl: element.querySelector<HTMLElement>(':scope > .swiper-button-next') || undefined,
            prevEl: element.querySelector<HTMLElement>(':scope > .swiper-button-prev') || undefined,
          },
          breakpoints: {
            360: { slidesPerView: 1, spaceBetween: 10 },
            640: { slidesPerView: 2, spaceBetween: 15 },
            990: { slidesPerView: 3, spaceBetween: 20 },
          },
        })
        instances.push(instance)
      })
    productGallery.current?.slideTo(0, 0, false)
    create('.certificate-list', {
      slidesPerView: 4,
      spaceBetween: 20,
      loop: true,
      speed: 1000,
      autoplay: { delay: 3000, stopOnLastSlide: false, disableOnInteraction: false },
      pagination: { el: '.certificate-pagination', clickable: true },
      breakpoints: {
        360: { slidesPerView: 1, spaceBetween: 10 },
        640: { slidesPerView: 2, spaceBetween: 15 },
        768: { slidesPerView: 3, spaceBetween: 15 },
        990: { slidesPerView: 4, spaceBetween: 20 },
      },
    })
    create('.news-list', {
      slidesPerView: 4,
      spaceBetween: 50,
      speed: 1000,
      loop: true,
      navigation: {
        nextEl: document.querySelector<HTMLElement>('.news .swiper-button-next') || undefined,
        prevEl: document.querySelector<HTMLElement>('.news .swiper-button-prev') || undefined,
      },
      breakpoints: {
        360: { slidesPerView: 1, spaceBetween: 5 },
        480: { slidesPerView: 1, spaceBetween: 10 },
        640: { slidesPerView: 2, spaceBetween: 10 },
        768: { slidesPerView: 2, spaceBetween: 10 },
        990: { slidesPerView: 4, spaceBetween: 50 },
      },
    })
    return () => {
      bannerGallery.current = null
      productGallery.current = null
      instances.reverse().forEach((instance) => instance.destroy(true, true))
    }
  }, [data.banners.length, count])
  const activeSource = homeSections(m)[section]
  useEffect(() => {
    if (activeSource !== 2) video.current?.pause()
  }, [activeSource])
  return (
    <div ref={shell} className="k712-home-shell">
      <div
        id="homePg"
        className="fullpage-wrapper"
        style={{ transform: `translate3d(0,-${section * 100}vh,0)` }}
      >
        <Section index={0} active={section} className="homePg1">
          <div id="banner">
            <div className="swiper swiper-container">
              {!data.banners.length && (
                <div className="k712-empty-banner">
                  <h1>{m?.company}</h1>
                </div>
              )}
              <div className="swiper-wrapper k712-banner-track">
                {data.banners.map((image, i) => (
                  <div className="swiper-slide" key={image + i}>
                    <div className="pcimg">
                      <picture>
                        {m?.banners?.[i]?.mobileImage && (
                          <source media="(max-width:767px)" srcSet={m.banners[i].mobileImage} />
                        )}
                        <img
                          src={image}
                          alt={m ? m.banners?.[i]?.title || m.company : `Hegr 毛绒玩具 ${i + 1}`}
                          draggable={false}
                        />
                      </picture>
                      {m && (m.banners?.[i]?.title || m.banners?.[i]?.description) && (
                        <div className="k712-banner-copy">
                          <h1>{m.banners?.[i]?.title}</h1>
                          <p>{m.banners?.[i]?.description}</p>
                          {m.banners?.[i]?.href && (
                            <DemoAnchor href={m.banners[i].href}>了解更多 →</DemoAnchor>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="swiper-pagination swiper-pagination-clickable swiper-pagination-bullets swiper-pagination-horizontal" />
              <div className="k712-banner-controls">
                <button
                  type="button"
                  className="k712-banner-prev"
                  aria-label="上一张横幅"
                  onClick={(event) => {
                    event.stopPropagation()
                    bannerGallery.current?.slidePrev()
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="k712-banner-next"
                  aria-label="下一张横幅"
                  onClick={(event) => {
                    event.stopPropagation()
                    bannerGallery.current?.slideNext()
                  }}
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </Section>
        <Section index={1} active={section} className="homePg2">
          <div className="fp-tableCell">
            <div className="about container">
              <div className="ab_txt" style={m && !data.aboutImage ? { width: '100%' } : undefined}>
                <div className="main_title">
                  <b>{m?.intro?.title || '关于我们'}</b>
                </div>
                <div className="ab_con">
                  <p>{data.about}</p>
                  <Link className="ab_more" href="/about/">
                    <i className="iconfont icon-jiantou_xiangyou" />
                    <em>查看更多</em>
                  </Link>
                </div>
              </div>
              <div className="ab_bottom">
                <ul />
              </div>
            </div>
            <div className="ab_right">
              <div
                className="pic"
                style={{
                  background: `url(${data.aboutImage}) no-repeat center`,
                  backgroundSize: 'auto 100%',
                }}
              />
            </div>
          </div>
        </Section>
        <Section index={2} active={section} className="homePgVideo">
          <div className="fp-tableCell">
            <div className="video-section container text-center">
              <div className="main_title">
                <b>官方视频</b>
              </div>
              <div className="video-banner">
                {m?.video?.embed ? (
                  <iframe src={m.video.src} title={m.video.title} allowFullScreen />
                ) : (
                  <video
                    ref={video}
                    src={data.video}
                    controls
                    controlsList="nodownload"
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) =>
                      e.currentTarget.parentElement?.classList.toggle(
                        'video-portrait',
                        e.currentTarget.videoHeight > e.currentTarget.videoWidth,
                      )
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </Section>
        <Section index={3} active={section} className="homePg3">
          <div className="fp-tableCell">
            <div className="product container">
              <div className="main_title">
                <b>产品中心</b>
              </div>
              <div className="sl">
                <div className="swiper-container gallery-thumbs fl">
                  <div className="swiper-wrapper">
                    {data.categories.map((item, i) => (
                      <div
                        key={item.href}
                        className={`swiper-slide indexP-swiper-items ${i === category ? 'active' : ''}`}
                        onMouseEnter={() => {
                          setCategory(i)
                          productGallery.current?.slideTo(i)
                        }}
                        onFocus={() => {
                          setCategory(i)
                          productGallery.current?.slideTo(i)
                        }}
                      >
                        <DemoAnchor href={item.href} onClick={(event) => event.stopPropagation()}>
                          {item.title}
                        </DemoAnchor>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="swiper-container gallery-top fr">
                  <div className="swiper-wrapper">
                    {data.categories.map((group, i) => (
                      <div className="swiper-slide" key={group.href}>
                        <div className="swiper-container sl_list" data-filter-idx={i}>
                          <div className="swiper-wrapper k712-product-track">
                            {(m
                              ? (group.items || []).map((c) => ({
                                  href: c.href,
                                  title: c.title,
                                  image: c.image || '',
                                }))
                              : data.products
                            ).map((item) => (
                              <div className="swiper-slide" key={item.href}>
                                <DemoAnchor href={item.href}>
                                  <em>{item.title}</em>
                                  <p />
                                  <span>
                                    <img src={item.image} alt={item.title} />
                                  </span>
                                  <i>查看详情</i>
                                </DemoAnchor>
                              </div>
                            ))}
                          </div>
                          <Arrow direction="next" />
                          <Arrow direction="prev" />
                          <div
                            className="sl_empty"
                            style={{ display: m && !group.items?.length ? 'block' : 'none' }}
                          >
                            暂无数据
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="clearfix" />
              </div>
            </div>
          </div>
        </Section>
        <Section index={4} active={section} className="homePg5">
          <div className="fp-tableCell">
            <div className="container">
              <div className="main_title">
                <b>企业实力</b>
              </div>
              <div className="certificate-section">
                <div className="swiper-container certificate-list">
                  <div className="swiper-wrapper k712-certificate-track">
                    {data.certificates.map((item, i) => (
                      <div className="swiper-slide" key={item.title + i}>
                        <div className="certificate-item" data-certificate-index={i}>
                          <div className="certificate-img">
                            {item.image ? (
                              <img src={item.image} alt={item.title} />
                            ) : (
                              <strong className="k712-strength-value">{item.value}</strong>
                            )}
                            <div className="certificate-overlay">
                              <i className="iconfont icon-sousuo" />
                              <div className="certificate-title-hover">{item.title}</div>
                            </div>
                          </div>
                          <div className="certificate-title">
                            {item.title}
                            {item.image && item.value && (
                              <strong className="k712-strength-caption">{item.value}</strong>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="certificate-pagination" />
              </div>
            </div>
          </div>
        </Section>
        <Section index={5} active={section} className="homePg4">
          <div className="fp-tableCell">
            <div className="case container">
              <div className="main_title">
                <b>案例中心</b>
              </div>
              <div className="case_body swiper-container">
                <div className="swiper-wrapper">
                  {data.cases.map((item) => (
                    <div className="swiper-slide" key={item.href}>
                      <DemoAnchor href={item.href}>
                        <div className="photo">
                          <div
                            className="pic"
                            style={{
                              background: `url(${item.image}) no-repeat center top`,
                              backgroundSize: '100% auto',
                            }}
                          />
                        </div>
                        <div className="msg">
                          <i className="wc iconfont icon-gongcheng-" />
                          <h3>{item.title}</h3>
                        </div>
                      </DemoAnchor>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>
        <Section index={6} active={section} className="homePg5">
          <div className="fp-tableCell">
            <div className="container">
              <div className="main_title">
                <b>新闻资讯</b>
              </div>
              <div className="news">
                <div className="swiper-container news-list">
                  <div className="swiper-wrapper k712-news-track">
                    {data.news.map((item) => (
                      <div className="swiper-slide" key={item.href}>
                        <DemoAnchor href={item.href}>
                          <span className="img-box">
                            <img src={item.image} alt={item.title} />
                          </span>
                          <b>{item.title}</b>
                          <p>{item.summary}</p>
                          <i className="iconfont icon-jiantou_xiangyou">了解更多</i>
                        </DemoAnchor>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="swiper-button-next">
                  下一个
                  <i className="iconfont icon-xiangyoujiantou" />
                </button>
                <button className="swiper-button-prev">
                  <i className="iconfont icon-xiangzuojiantou" />
                  上一个
                </button>
              </div>
            </div>
          </div>
        </Section>
        <Section index={7} active={section} className="homePg6">
          <div className="footer">
            <div className="ftimg">
              <img src={asset('/site/k712/images/copy.webp')} alt="" className="img-responsive" />
            </div>
            <div className="foot" style={{ width: '100%' }}>
              <div className="ft-contact">
                <i>联系我们</i>
                <p>
                  <DemoAnchor href={`tel:${phone}`}>电话：{phone}</DemoAnchor>
                </p>
                <p>
                  <DemoAnchor
                    href={
                      site
                        ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`
                        : 'https://api.whatsapp.com/send?phone=45454545'
                    }
                  >
                    WhatsApp：{whatsapp}
                  </DemoAnchor>
                </p>
                <p>
                  <DemoAnchor href={`mailto:${email}`}>邮箱：{email}</DemoAnchor>
                </p>
                <p>地址：{address}</p>
              </div>
              <div className="copyright">
                版权所有 © {new Date().getFullYear()} {site ? site.company : 'Hegr'}{' '}
                <DemoAnchor
                  href={
                    site
                      ? site.base.replace(/\/[^/]+$/, '') + '/sitemap.xml'
                      : '/index.php/sitemap.xml'
                  }
                >
                  XML
                </DemoAnchor>
              </div>
              <div className="links">
                <div className="social-links-grid d-flex gap-2 mb-4">
                  {(site
                    ? site.socials.map((l) => [l.href, '', l.label])
                    : [
                        [
                          'https://youtube.com/@hegerplushofficial?si=p2aVcgHU1Uv671tc',
                          'ytb.png',
                          'YouTube',
                        ],
                        ['https://www.linkedin.com/in/hongxi-hao-a417743b5', 'lin.png', 'LinkedIn'],
                        ['https://blog.heger.ltd/', 'blog.png', 'blog'],
                      ]
                  ).map(([href, image, title]) => (
                    <DemoAnchor href={href} key={href} title={title} className="social-btn">
                      <>
                        {image ? (
                          <img src={asset(`/site/images/${image}`)} alt={title} />
                        ) : (
                          <span>{title}</span>
                        )}
                      </>
                    </DemoAnchor>
                  ))}
                </div>
              </div>
              <div className="link">
                <div className="footer-qrcode d-flex gap-3">
                  {qrs.map(({ label: title, image }) => (
                    <div className="qrcode-item text-center" key={title}>
                      <button
                        type="button"
                        aria-label={`放大${title}二维码`}
                        onClick={() => setModal({ title, image })}
                      >
                        <img src={image} width="80" height="80" alt={title} />
                      </button>
                      <p className="x-small text-white-50 mb-0">{title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>
      {modal && (
        <div className="k712-lightbox" onClick={() => setModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              type="button"
              className="k712-close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              ×
            </button>
            <img src={modal.image} alt={modal.title} />
            <p>{modal.title}</p>
          </div>
        </div>
      )}
    </div>
  )
}
