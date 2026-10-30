'use client'
import { DemoAnchor } from '../DemoLink'
/* Original image elements preserve the source assets and their natural aspect ratios. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import Link from '../DemoLink'
import { ArrowRight, ChevronDown, Plus, X } from 'lucide-react'
import { useK607Site, useK607Page } from './TemplateData'
import { LocalContactForm } from './CorporatePages'
import sampleData from './source-data.json'
import { useSourceReveals, WaterRipples } from './MotionEffects'
export function SourceIcon({ code, size = 20 }: { code: number; size?: number }) {
  return (
    <i className="source-icon" aria-hidden="true" style={{ fontSize: size }}>
      {String.fromCodePoint(code)}
    </i>
  )
}
const link = (path: string) => path
const asset = (filename: string) => `/sites/k607/${filename}`
const logo = asset('827788a8dccee28cf0e9b1baf0d6d47d.jpg')
const qr = asset('18cf43ad70a9b6487e432d995fd22ccf.png')
const demoIntro =
  '企业概况 企业官方注册全称：中国商贸有限公司 成立时间：深耕毛绒玩具核心产业带多年，依托成熟供应链体系搭建全链路生产能力 全球总部：中国・河北・石家庄 生产基地 / 仓储地址：中国・河北・石家庄 核心团队背景：100 人专业团队涵盖生产、质检、定制设计、外贸全链路，核心成员平均拥有 8 年以上毛绒玩具行业经验，具备批量生产与定制化项目落地能力'
const demoCategories = ['动物形象类', '卡通形象类', '创意水果类', '三丽欧系列类', '维尼熊IP']
const categoryPaths = ['c1', 'c2', 'c3', 'c14', 'c15']
const demoNav = [
  { title: '首页', path: '/', children: [] },
  { title: '产品中心', path: '/product/', children: [...demoCategories, '维尼维尼'] },
  {
    title: '新闻资讯',
    path: '/article/',
    children: ['企业新闻', '企业介绍', '行业新闻', '产品上新'],
  },
  {
    title: '案例中心',
    path: '/case/',
    children: ['客户案例', '南美案例', '巴西案例', '北美案例', '北欧案例', '亚洲案例'],
  },
  { title: '关于我们', path: '/about/', children: [] },
  { title: '常见问题', path: '/faq/', children: [] },
  { title: '联系我们', path: '/contact/', children: [] },
]
const demoSubPaths: Record<string, string[]> = {
  '/product/': [...categoryPaths, 'c16'],
  '/article/': ['c11', 'c12', 'c30', 'c31'],
  '/case/': ['c13', 'c17', 'c18', 'c32', 'c33', 'c34'],
}
const languages = [
  ['zh', '简体中文'],
  ['en', 'English'],
  ['hi', 'हिन्दी'],
  ['es', 'Español'],
  ['ar', 'العربية'],
  ['fr', 'Français'],
  ['bn', 'বাংলা'],
  ['ru', 'Русский'],
  ['pt', 'Português'],
  ['id', 'Bahasa Indonesia'],
  ['de', 'Deutsch'],
  ['ja', '日本語'],
  ['ur', 'اُردُو'],
  ['vi', 'Tiếng Việt'],
  ['tr', 'Türkçe'],
  ['ko', '한국어'],
  ['fa', 'فارسی'],
  ['th', 'ภาษาไทย'],
  ['it', 'Italiano'],
  ['tl', 'Wikang Tagalog'],
  ['uk', 'Українська'],
  ['pl', 'Polski'],
  ['uz', "O'zbek"],
  ['my', 'မြန်မာဘာသာ'],
  ['ms', 'Bahasa Melayu'],
  ['nl', 'Nederlands'],
  ['ro', 'Română'],
  ['km', 'ភាសាខ្មែរ'],
  ['el', 'Ελληνικά'],
  ['hu', 'Magyar'],
  ['cs', 'Čeština'],
  ['sv', 'Swedish'],
  ['ca', 'Català'],
  ['bg', 'Български'],
  ['sr', 'Српски'],
  ['he', 'עברית'],
  ['da', 'Dansk'],
  ['hr', 'Hrvatski'],
  ['bs', 'Bosanski'],
  ['fi', 'Suomi'],
  ['no', 'Norsk'],
  ['sk', 'Slovenčina'],
  ['lt', 'Lietuvių'],
  ['lv', 'Latviešu'],
  ['sl', 'Slovenščina'],
  ['et', 'Eesti'],
  ['cy', 'Cymraeg'],
  ['mt', 'Malti'],
]

function useHomeData() {
  const m = useK607Page()
  return m
    ? {
        banners: (m.banners || []).map((b) => ({
          local: b.desktopImage || b.mobileImage || '',
          title: b.title || '',
          description: b.description || '',
          href: b.href,
          mobile: b.mobileImage,
        })),
        products: (m.products || []).map((c) => ({
          title: c.title,
          href: c.href,
          image: { local: c.image || '' },
        })),
        cases: (m.cases || []).map((c) => ({
          title: c.title,
          description: c.summary || '',
          href: c.href,
          image: { local: c.image || '' },
        })),
        news: (m.news || []).map((c) => ({
          title: c.title,
          description: c.summary || '',
          date: c.date || '',
          href: c.href,
          image: { local: c.image || '' },
        })),
      }
    : {
        ...sampleData,
        banners: sampleData.banners.map((b) => ({
          ...b,
          title: '',
          description: '',
          href: undefined as string | undefined,
          mobile: undefined as string | undefined,
        })),
      }
}
function useSiteData() {
  const site = useK607Site()
  const nav = site
    ? site.links.map((l) => ({
        title: l.label,
        path: l.href,
        children: (l.children || []).map((c) => c.label),
      }))
    : demoNav
  const subPaths: Record<string, string[]> = site
    ? Object.fromEntries(site.links.map((l) => [l.href, (l.children || []).map((c) => c.href)]))
    : demoSubPaths
  return {
    site,
    nav,
    subPaths,
    logo: site ? site.logo || '' : logo,
    phone: site ? site.contact.phone || '' : '123456789',
    email: site ? site.contact.email || '' : '123456789@gmail.com',
    company: site ? site.company : '中国商贸有限公司',
    whatsapp: site ? site.contact.whatsapp || '' : '45454545',
    address: site ? site.contact.address || '' : '河北省石家庄市桥西区石家庄站2层',
    qrs: site
      ? site.contact.qr || []
      : ['WhatsApp', '微信', 'Weixin'].map((label) => ({ label, image: qr })),
  }
}

function SectionTitle({ en, title }: { en: string; title: string }) {
  return (
    <div className="section-title">
      <span aria-hidden="true">{en}</span>
      <h2>{title}</h2>
    </div>
  )
}
export function Header() {
  const { site, nav, subPaths, logo, company } = useSiteData()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeMenu = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOpen(false)
      menuButton.current?.focus()
      return
    }
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setClosing(false)
      menuButton.current?.focus()
    }, 400)
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )
  const [expanded, setExpanded] = useState<string | null>(null)
  const [langOpen, setLangOpen] = useState(false)
  const [allLangs, setAllLangs] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('a,button')?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setOpen(false)
          menuButton.current?.focus()
        } else {
          setClosing(true)
          closeTimer.current = setTimeout(() => {
            setOpen(false)
            setClosing(false)
            menuButton.current?.focus()
          }, 400)
        }
      }
      if (e.key !== 'Tab') return
      const items = panel.current?.querySelectorAll<HTMLElement>('a,button')
      if (!items?.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])
  return (
    <>
      <header className="header">
        <Link className="logo" href="/" aria-label={company + '首页'}>
          {logo ? (
            <img src={logo} alt={company} width="58" height="58" />
          ) : (
            <strong>{site?.headerText || company}</strong>
          )}
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          {nav.map((item) => (
            <div className="nav-item" key={item.path}>
              <DemoAnchor href={link(item.path)}>{item.title}</DemoAnchor>
              {item.children.length > 0 && (
                <div className="mega-menu">
                  <div className="mega-heading">
                    <strong>{item.title}</strong>
                    <span>快速导航</span>
                  </div>
                  <div className="mega-links">
                    {item.children.map((child, i) => (
                      <DemoAnchor
                        key={child}
                        href={link(
                          site ? subPaths[item.path][i] : `${item.path}${subPaths[item.path][i]}/`,
                        )}
                      >
                        <ArrowRight size={16} />
                        {child}
                      </DemoAnchor>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="language" onMouseLeave={() => setLangOpen(false)}>
          <button
            aria-expanded={langOpen}
            onMouseEnter={() => setLangOpen(true)}
            onClick={() => setLangOpen(!langOpen)}
          >
            <img src={asset('zh.png')} alt="" width="20" height="14" />
            {site
              ? languages.find((l) => l[0] === site.locale)?.[1] || site.locale
              : '简体中文'}{' '}
            <ChevronDown size={12} />
          </button>
          {langOpen && (
            <div className="language-list">
              {(site ? languages.filter((l) => site.languages.includes(l[0])) : languages)
                .slice(0, allLangs ? undefined : 12)
                .map(([code, name]) => (
                  <DemoAnchor
                    key={code}
                    href={
                      site
                        ? site.base.replace(/\/[^/]+$/, '/' + code)
                        : `https://${code === 'en' ? 'www' : code}.heger.ltd`
                    }
                  >
                    <img src={asset(`${code}.png`)} alt="" width="20" height="14" />
                    {name}
                  </DemoAnchor>
                ))}
              {!allLangs && <button onClick={() => setAllLangs(true)}>更多语言</button>}
            </div>
          )}
        </div>
        <button
          ref={menuButton}
          className="menu-toggle"
          aria-label="打开导航菜单"
          aria-expanded={open}
          aria-controls="full-menu"
          onClick={() => setOpen(true)}
        >
          <span className="source-icon menu-icon" aria-hidden="true">
            &#xe779;
          </span>
        </button>
      </header>
      {open && (
        <div
          id="full-menu"
          className={`full-menu ${closing ? 'menu-closing' : ''}`}
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="网站导航"
        >
          <div className="menu-top">
            <Link href="/">
              {logo ? (
                <img src={logo} alt={company} width="45" height="45" />
              ) : (
                <strong>{company}</strong>
              )}
            </Link>
            <button aria-label="关闭导航菜单" onClick={closeMenu}>
              关闭 <X />
            </button>
          </div>
          <nav className="menu-columns" aria-label="完整导航">
            {nav.map((item) => (
              <div className="menu-column" key={item.path}>
                <div className="menu-column-title">
                  <DemoAnchor href={link(item.path)}>{item.title}</DemoAnchor>
                  {item.children.length > 0 && (
                    <button
                      aria-label={`展开${item.title}`}
                      aria-expanded={expanded === item.path}
                      onClick={() => setExpanded(expanded === item.path ? null : item.path)}
                    >
                      <ChevronDown />
                    </button>
                  )}
                </div>
                <div className={`menu-sub ${expanded === item.path ? 'expanded' : ''}`}>
                  {item.children.map((child, i) => (
                    <DemoAnchor
                      key={child}
                      href={link(
                        site ? subPaths[item.path][i] : `${item.path}${subPaths[item.path][i]}/`,
                      )}
                    >
                      {child}
                    </DemoAnchor>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}
function Hero() {
  const data = useHomeData()
  const m = useK607Page()
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef(0)
  const [resetting, setResetting] = useState(false)
  const first = useRef(true)
  const change = (step: number) =>
    setSlide((i) => (i + step + data.banners.length) % Math.max(1, data.banners.length))
  useEffect(() => {
    if (
      data.banners.length < 2 ||
      paused ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const timer = setTimeout(
      () => {
        first.current = false
        setSlide((i) => i + 1)
      },
      first.current ? 3000 : 3800,
    )
    return () => clearTimeout(timer)
  }, [paused, slide, data.banners.length])
  if (!data.banners.length) return null
  return (
    <section
      className="hero"
      aria-label={m ? m.company + '展示轮播' : '毛绒玩具展示轮播'}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        const delta = e.changedTouches[0].clientX - touchStart.current
        if (Math.abs(delta) > 40) change(delta < 0 ? 1 : -1)
      }}
    >
      <h1 className="sr-only">{m ? m.company : '中国商贸有限公司 · 毛绒玩具生产与定制'}</h1>
      <div
        className="hero-track"
        style={{
          transform: `translateX(-${slide * 100}%)`,
          transitionDuration: resetting ? '0s' : undefined,
        }}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget || slide < data.banners.length) return
          setResetting(true)
          setSlide(0)
          requestAnimationFrame(() => requestAnimationFrame(() => setResetting(false)))
        }}
      >
        {[...data.banners, data.banners[0]].map((banner, i) => (
          <div key={`${banner.local}-${i}`} className={`hero-slide ${slide === i ? 'active' : ''}`}>
            <picture>
              {banner.mobile && <source media="(max-width:767px)" srcSet={banner.mobile} />}
              <img
                src={banner.local}
                alt={
                  m
                    ? banner.title
                    : ['Heger 海洋系列毛绒玩具', 'Heger 森林系列毛绒玩具', 'Heger 毛绒玩具定制'][
                        i % data.banners.length
                      ]
                }
                width="1920"
                height="823"
                fetchPriority={i === 0 ? 'high' : 'auto'}
              />
            </picture>
            {(banner.title || banner.description) && (
              <div className="hero-content">
                <h2>{banner.title}</h2>
                <p>{banner.description}</p>
                {banner.href && <DemoAnchor href={banner.href}>了解更多 →</DemoAnchor>}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="hero-prev" aria-label="上一张横幅" onClick={() => change(-1)}>
        <SourceIcon code={0xe608} size={58} />
        <span className="banner-arrow-line" />
      </button>
      <button className="hero-next" aria-label="下一张横幅" onClick={() => change(1)}>
        <span className="banner-arrow-line" />
        <SourceIcon code={0xe60a} size={58} />
      </button>
      <div className="dots">
        {data.banners.map((_, i) => (
          <button
            key={i}
            className={slide % data.banners.length === i ? 'active' : ''}
            aria-label={`横幅 ${i + 1}`}
            aria-pressed={slide % data.banners.length === i}
            onClick={() => setSlide(i)}
          />
        ))}
      </div>
      <DemoAnchor className="scroll-down" href="#about" aria-label="向下查看企业介绍">
        <SourceIcon code={0xe658} size={24} />
      </DemoAnchor>
    </section>
  )
}
function Products() {
  const data = useHomeData()
  const m = useK607Page()
  const [offset, setOffset] = useState(0)
  const products = data.products.length > 1 ? data.products.slice(1) : data.products
  const categories = m ? (m.categories || []).map((c) => c.label) : demoCategories
  const { site, phone } = useSiteData()
  const strip = useRef<HTMLDivElement>(null)
  const touchStart = useRef(0)
  const [columns, setColumns] = useState(3)
  const [gap, setGap] = useState(30)
  const [step, setStep] = useState(0)
  const [resetting, setResetting] = useState(false)
  useEffect(() => {
    const update = () => {
      const count = innerWidth >= 768 ? 3 : 2
      const space = innerWidth >= 1200 ? 30 : innerWidth >= 768 ? 15 : 10
      setColumns(count)
      setGap(space)
      setStep(((strip.current?.clientWidth ?? 0) - (count - 1) * space) / count + space)
    }
    update()
    const observer = new ResizeObserver(update)
    if (strip.current) observer.observe(strip.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (products.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setOffset((i) => (i >= products.length ? 1 : i + 1)), 3300)
    return () => clearInterval(timer)
  }, [products.length])
  const move = (direction: number) =>
    setOffset((i) =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? (i + direction + products.length) % products.length
        : Math.max(0, Math.min(products.length, i + direction)),
    )
  const visible = [...products, ...products.slice(0, columns)]
  if (!data.products.length) return null
  return (
    <section className="products" id="products">
      <SectionTitle en="PRODUCT" title="产品中心" />
      <div className="product-region">
        <div className="product-layout page-width">
          <aside className="product-sidebar" data-source-reveal="left">
            <nav aria-label="产品分类">
              {['全部', ...categories.slice(0, 4)].map((cat, i) => (
                <DemoAnchor
                  key={cat}
                  href={link(
                    i === 0
                      ? '/product/'
                      : m
                        ? m.categories?.[i - 1]?.href || '/product/'
                        : `/product/${categoryPaths[i - 1]}/`,
                  )}
                >
                  <span>{cat}</span>
                </DemoAnchor>
              ))}
            </nav>
            <DemoAnchor className="hotline" href={`tel:${phone}`}>
              <SourceIcon code={0xe621} size={50} />
              <div>
                服务热线<strong>{phone}</strong>
              </div>
            </DemoAnchor>
          </aside>
          <div
            className="vertical-word"
            aria-hidden="true"
            data-source-reveal="top"
            data-reveal-delay="400"
          >
            PRODUCT
          </div>
          <div className="product-gallery" data-source-reveal="right" data-reveal-delay="600">
            <DemoAnchor href={link(data.products[0].href)} className="featured-product">
              <img
                src={data.products[0].image.local}
                alt={data.products[0].title}
                width="1000"
                height="600"
                loading="eager"
              />
            </DemoAnchor>
            {products.length > 0 && (
              <div className="product-strip">
                <div className="product-motion-window" ref={strip}>
                  <div
                    className="product-motion-track"
                    style={{
                      gap,
                      transform: `translateX(-${offset * step}px)`,
                      transitionDuration: resetting ? '0s' : undefined,
                    }}
                    onTransitionEnd={() => {
                      if (offset >= products.length) {
                        setResetting(true)
                        setOffset(0)
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() => setResetting(false)),
                        )
                      }
                    }}
                    onTouchStart={(e) => {
                      touchStart.current = e.touches[0].clientX
                    }}
                    onTouchEnd={(e) => {
                      const delta = e.changedTouches[0].clientX - touchStart.current
                      if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1)
                    }}
                  >
                    {visible.map((product, i) => (
                      <DemoAnchor
                        key={`${product.href}-${i}`}
                        href={link(product.href)}
                        tabIndex={i >= offset && i < offset + columns ? 0 : -1}
                      >
                        <img
                          src={product.image.local}
                          alt={product.title}
                          width="400"
                          height="400"
                          loading="eager"
                        />
                        <span>{product.title}</span>
                      </DemoAnchor>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
function Cases() {
  const data = useHomeData()
  const m = useK607Page()
  const [index, setIndex] = useState(0)
  const touchStart = useRef(0)
  const move = (delta: number) =>
    setIndex((i) => Math.max(0, Math.min(data.cases.length - 1, i + delta)))
  if (!data.cases.length) return null
  return (
    <section className="cases page-width" id="cases">
      <SectionTitle en="CASES" title="案例中心" />
      <div
        className="case-carousel"
        onTouchStart={(e) => {
          touchStart.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStart.current
          if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1)
        }}
      >
        <div className="case-motion-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {data.cases.map((current, slideIndex) => (
            <div className="case-layout" key={current.title} aria-hidden={slideIndex !== index}>
              <div className="case-copy" data-source-reveal="top">
                <div className="case-heading">
                  <span>
                    <SourceIcon code={0xe61a} size={30} />
                  </span>
                  <h3>{current.title}</h3>
                </div>
                <p>{current.description}</p>
              </div>
              <div className="case-controls">
                <button
                  tabIndex={slideIndex === index ? 0 : -1}
                  aria-label="上一个案例"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <SourceIcon code={0xe601} />
                </button>
                <button
                  tabIndex={slideIndex === index ? 0 : -1}
                  aria-label="下一个案例"
                  disabled={index === data.cases.length - 1}
                  onClick={() => move(1)}
                >
                  <SourceIcon code={0xe600} />
                </button>
              </div>
              <div className="case-dots">
                {data.cases.map((c, i) => (
                  <button
                    key={c.title}
                    tabIndex={slideIndex === index ? 0 : -1}
                    aria-label={`案例 ${i + 1}`}
                    aria-pressed={index === i}
                    className={index === i ? 'active' : ''}
                    onClick={() => setIndex(i)}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
              <img
                className="case-image"
                src={current.image.local}
                alt={current.title}
                data-source-reveal="bottom"
                width="1200"
                height="675"
                loading="eager"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
function News() {
  const data = useHomeData()
  const m = useK607Page()
  const [index, setIndex] = useState(0)
  const [resetting, setResetting] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [columns, setColumns] = useState(3)
  const track = useRef<HTMLDivElement>(null)
  const touchStart = useRef(0)
  useEffect(() => {
    function resize() {
      const count = innerWidth >= 768 ? 3 : innerWidth >= 640 ? 2 : 1
      const space =
        innerWidth >= 1200
          ? 15
          : innerWidth >= 992
            ? 10
            : innerWidth >= 768
              ? 5
              : innerWidth >= 640
                ? 0
                : 5
      setColumns(count)
      setStep(((track.current?.clientWidth ?? 0) - (count - 1) * space) / count + space)
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (track.current) observer.observe(track.current)
    return () => observer.disconnect()
  }, [])
  const move = (delta: number) => setIndex((i) => (i + delta + data.news.length) % data.news.length)
  if (!data.news.length) return null
  return (
    <section className="news page-width" id="news">
      <SectionTitle en="NEWS" title="推荐新闻" />
      <div className="news-cards news-carousel">
        <div
          className="news-motion-track"
          ref={track}
          style={{
            transform: `translateX(-${index * step}px)`,
            transitionDuration: resetting ? '0s' : undefined,
          }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && index >= data.news.length) {
              setResetting(true)
              setIndex(0)
              requestAnimationFrame(() => requestAnimationFrame(() => setResetting(false)))
            }
          }}
          onTouchStart={(e) => {
            touchStart.current = e.touches[0].clientX
          }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touchStart.current
            if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1)
          }}
        >
          {[...data.news, ...data.news.slice(0, columns)].map((item, i) => (
            <DemoAnchor
              href={link(item.href)}
              key={`${item.href}-${i}`}
              tabIndex={i >= index && i < index + columns ? 0 : -1}
              onMouseEnter={() => setHovered(item.href)}
              onFocus={() => setHovered(item.href)}
              className={`news-card ${hovered === item.href ? 'source-hovered' : ''}`}
            >
              <img
                className="news-background"
                src={item.image.local}
                alt=""
                width="700"
                height="500"
                loading="eager"
              />
              <div className="news-content">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="news-date">
                  <time>{item.date.slice(0, 10)}</time>
                  <span>
                    <SourceIcon code={0xe658} />
                  </span>
                </div>
              </div>
            </DemoAnchor>
          ))}
        </div>
        <div className="news-pagination">
          {data.news.map((_, i) => (
            <button
              key={i}
              aria-label={`新闻组 ${i + 1}`}
              aria-pressed={index === i}
              className={index === i ? 'active' : ''}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
export function Footer() {
  const { site, nav, subPaths, phone, email, company, whatsapp, address, qrs } = useSiteData()
  const [qrOpen, setQrOpen] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  function showQr(title: string) {
    setQrOpen(title)
    dialog.current?.showModal()
  }
  return (
    <>
      <footer id="contact">
        <div className="footer-inner page-width">
          <div className="footer-service">
            <p>服务热线</p>
            <DemoAnchor className={phone.replace(/\s/g,'').length>10?'footer-phone-long':undefined} href={`tel:${phone}`}>{phone}</DemoAnchor>
            <DemoAnchor className="message" href={link('/contact')}>
              <SourceIcon code={0xe64b} size={28} />
              在线留言{' '}
              <span className="message-arrow">
                <SourceIcon code={0xe658} size={24} />
              </span>
            </DemoAnchor>
          </div>
          <div className="footer-links">
            {nav.slice(0, 3).map((item, index) => (
              <div key={item.path}>
                <h3>{index === 0 ? '快速导航' : item.title}</h3>
                {index === 0
                  ? nav.map((n) => (
                      <DemoAnchor key={n.path} href={link(n.path)}>
                        {n.title}
                      </DemoAnchor>
                    ))
                  : item.children.slice(0, index === 1 ? 5 : undefined).map((child, i) => (
                      <DemoAnchor
                        key={child}
                        href={link(
                          site ? subPaths[item.path][i] : `${item.path}${subPaths[item.path][i]}/`,
                        )}
                      >
                        {child}
                      </DemoAnchor>
                    ))}
              </div>
            ))}
          </div>
          <div className="footer-contact">
            <div className="socials">
              {site ? (
                site.socials.map((l) => (
                  <DemoAnchor key={l.href} href={l.href}>
                    {l.label}
                  </DemoAnchor>
                ))
              ) : (
                <>
                  <DemoAnchor href="https://youtube.com/@hegerplushofficial" aria-label="YouTube">
                    <img src={asset('ytb.png')} alt="YouTube" width="32" height="32" />
                  </DemoAnchor>
                  <DemoAnchor
                    href="https://www.linkedin.com/in/hongxi-hao-a417743b5"
                    aria-label="LinkedIn"
                  >
                    <img src={asset('lin.png')} alt="LinkedIn" width="32" height="32" />
                  </DemoAnchor>
                  <DemoAnchor href="https://blog.heger.ltd/" aria-label="Blog">
                    <img src={asset('blog.png')} alt="Blog" width="32" height="32" />
                  </DemoAnchor>
                </>
              )}
            </div>
            <address>
              <DemoAnchor href={`tel:${phone}`}>电话: {phone}</DemoAnchor>
              <DemoAnchor href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}>
                WhatsApp: {whatsapp}
              </DemoAnchor>
              <DemoAnchor href={`mailto:${email}`}>邮箱: {email}</DemoAnchor>
              <p>地址: {address}</p>
            </address>
            <div className="qr-codes">
              {qrs.map(({ label: title, image }) => (
                <button key={title} onClick={() => showQr(title)} aria-label={`放大${title}二维码`}>
                  <img src={image} alt={`${title}二维码`} width="60" height="60" />
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>
      <div className="copyright">
        版权所有 © {new Date().getFullYear()}{' '}
        {company}
        <DemoAnchor
          href={site ? site.base.replace(/\/[^/]+$/, '') + '/sitemap.xml' : link('/sitemap.xml')}
        >
          XML
        </DemoAnchor>
      </div>
      <dialog
        className="qr-dialog"
        ref={dialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close()
        }}
      >
        <button autoFocus aria-label="关闭二维码" onClick={() => dialog.current?.close()}>
          <X />
        </button>
        <img
          src={qrs.find((q) => q.label === qrOpen)?.image}
          alt={`${qrOpen}二维码`}
          width="300"
          height="300"
        />
        <p>{qrOpen}</p>
      </dialog>
    </>
  )
}
export function HomePage() {
  const m = useK607Page()
  const { site, company, phone, email } = useSiteData()
  const intro = m ? m.intro?.text || '' : demoIntro
  useSourceReveals()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <>
      <DemoAnchor className="skip-link" href="#main">
        跳至主要内容
      </DemoAnchor>
      <Header />
      <main id="main">
        <Hero />
        {(!m || m.intro) && (
          <section className="about" id="about">
            <div className="about-inner page-width">
              <div className="about-copy" data-source-reveal="top">
                <span className="about-word" aria-hidden="true">
                  ABOUT
                </span>
                <h2>{m ? m.intro?.title : '企业介绍'}</h2>
                <p>{intro}</p>
              </div>
              <div className="about-image" data-source-reveal="right" data-reveal-delay="400">
                <DemoAnchor className="about-more" href={link('/about')} aria-label="了解企业介绍">
                  <Plus />
                </DemoAnchor>
                <img
                  src={m ? m.intro?.image : asset('d486bde351a9eb29705cda5b4caa4f27.webp')}
                  alt={m ? m.intro?.title : 'Heger Plush 毛绒玩具'}
                  width="1200"
                  height="675"
                  loading="eager"
                />
              </div>
            </div>
          </section>
        )}
        <Products />
        {(!m || m.video) && (
          <section className="official-video">
            <div className="official-video-container">
              <h2>官方视频</h2>
              {m?.video?.embed ? (
                <iframe src={m.video.src} title={m.video.title} allowFullScreen />
              ) : (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  width="1280"
                  height="720"
                  src={m ? m.video?.src : asset('248be47a19ac8090f4a898dcb5203705.mp4')}
                  aria-label={company + '官方视频'}
                />
              )}
            </div>
          </section>
        )}
        <section className="consultation">
          <WaterRipples />
          <p className="consultation-label" data-source-reveal="bottom">
            欢迎来电咨询
          </p>
          <h2 data-source-reveal="bottom" data-reveal-delay="400">
            {company}
          </h2>
          <p
            className="consultation-description"
            data-source-reveal="bottom"
            data-reveal-delay="600"
          >
            {intro}
          </p>
          <DemoAnchor href={link('/contact')}>联系我们</DemoAnchor>
        </section>
        <Cases />
        <News />
        {m?.stats?.length ? (
          <section className="page-width k607-strength">
            <SectionTitle en="STRENGTH" title="企业实力" />
            <div>
              {m.stats.map((s, i) => (
                <article key={i}>
                  {s.image && <img src={s.image} alt={s.label} />}
                  <strong>
                    {s.value}
                    {s.unit}
                  </strong>
                  <p>{s.label}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {m?.showInquiry && (
          <section className="page-width product-local-inquiry">
            <LocalContactForm heading={m.inquiryTitle || '联系我们'} />
          </section>
        )}
      </main>
      <Footer />
      {scrolled && (
        <div className="floating-contact">
          <DemoAnchor href={`tel:${phone}`} aria-label={'电话 ' + phone}>
            <SourceIcon code={0xe94f} size={21} />
            <span>{phone}</span>
          </DemoAnchor>
          <DemoAnchor href={`mailto:${email}`} aria-label="邮箱">
            <SourceIcon code={0xe908} size={21} />
            <span>发送邮件</span>
          </DemoAnchor>
          <button
            aria-label="返回顶部"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <SourceIcon code={0xe6f5} size={21} />
          </button>
        </div>
      )}
    </>
  )
}
