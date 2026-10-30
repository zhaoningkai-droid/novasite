'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { IndustryLink, IndustryPageModel } from '@/platform/industry-templates/model'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'
import { inquiryRequiredFields, inquiryTextLimits } from '@/platform/inquiry/required-fields'
import { sample } from './data'
import './style.css'

type Card = {
  title: string
  href: string
  category?: string
  image?: string
  summary?: string | null
}
const demoFAQ = [
  [
    'Which equipment is compatible?',
    'Our sample system supports a range of tractors and implements. Contact the team with your equipment model for a compatibility assessment.',
  ],
  [
    'How do I request technical support?',
    'Use the inquiry form and include your product model and the issue. In this demo your message is saved on this browser only.',
  ],
  [
    'Can I become a local dealer?',
    'Choose Become Dealer and provide your company information. The same contact form supports dealer and product inquiries.',
  ],
]
function Inquiry({
  model,
  topic = 'Make an inquiry',
}: {
  model?: IndustryPageModel
  topic?: string
}) {
  const send = useInquirySubmission(),
    required = inquiryRequiredFields(model?.requiredFields)
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    setBusy(true)
    setNotice('')
    try {
      if (model && !model.demo) {
        if (await send(form, model.site)) setNotice('Your inquiry has been received.')
      } else {
        localStorage.setItem(
          'allynav-demo-inquiry',
          JSON.stringify({
            ...Object.fromEntries(new FormData(form)),
            savedAt: new Date().toISOString(),
          }),
        )
        setNotice('Demo saved on this browser only. No message was sent.')
        form.reset()
      }
    } catch {
      setNotice('Unable to save or send. Your information remains in the form; please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="an-form" onSubmit={submit}>
      <input type="hidden" name="product" value={topic} />
      {!model && <p className="an-notice">Local template demo — no external message is sent.</p>}
      <div className="an-grid">
        {(['name', 'phone', 'email', 'address', 'country', 'company'] as const).map((name) => (
          <label className="an-field" key={name}>
            {name === 'address' ? 'City' : name[0].toUpperCase() + name.slice(1)}
            {name in required && required[name as keyof typeof required] ? ' *' : ''}
            <input
              name={name}
              type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
              required={name in required && required[name as keyof typeof required]}
              maxLength={inquiryTextLimits[name]}
              autoComplete={name === 'company' ? 'organization' : name === 'phone' ? 'tel' : name}
            />
          </label>
        ))}
      </div>
      <label className="an-field">
        Message *<textarea name="message" required maxLength={inquiryTextLimits.message} rows={5} />
      </label>
      <button className="an-button" disabled={busy}>
        {busy ? 'Saving…' : 'Submit inquiry →'}
      </button>
      <p className="an-notice" role="status">
        {notice}
      </p>
    </form>
  )
}
export function AllyTemplate({
  model: m,
  base,
  path = '',
  siteData,
}: {
  model?: IndustryPageModel
  base: string
  path?: string
  siteData?: { logo?: string; links: IndustryLink[]; languages: string[] }
}) {
  const href = (p = '') => {
    const aliases: Record<string, string> = {
      support: 'faqs',
      'get-technical-support': 'contact',
      events: 'news',
      videos: '#an-video',
      'privacy-policy': 'about',
      'terms-of-use': 'about',
      'site-map': 'about',
    }
    const target = m ? aliases[p] || p : p
    return `${base.replace(/\/$/, '')}${target.startsWith('#') ? target : target ? '/' + target.replace(/^\//, '') : ''}`
  }
  const current = path.replace(/^\/+|\/+$/g, ''),
    route = current.split('/')[0]
  const company = m ? m.company : sample.company
  const products: Card[] = m
    ? (m.kind === 'catalog' && m.section === 'products' ? m.cards || [] : m.products || []).map(
        (p) => ({
          ...p,
        }),
      )
    : sample.products.map((p) => ({ ...p, href: href(`products/${p.slug}`) }))
  const news: Card[] = m
    ? (m.kind === 'catalog' && m.section !== 'products' ? m.cards || [] : m.news || []).map(
        (p) => ({
          ...p,
        }),
      )
    : sample.news.map((p) => ({ ...p, href: href(`news/${p.slug}`) }))
  const searchButton = useRef<HTMLButtonElement>(null),
    mobileButton = useRef<HTMLButtonElement>(null),
    modal = useRef<HTMLDivElement>(null)
  const [productOffset, setProductOffset] = useState(0),
    [solutionOffset, setSolutionOffset] = useState(0),
    [contactTab, setContactTab] = useState('pre-sale'),
    [location, setLocation] = useState('')
  const [slide, setSlide] = useState(0),
    [category, setCategory] = useState('All'),
    [robot, setRobot] = useState(0),
    [tab, setTab] = useState('Overview'),
    [zoom, setZoom] = useState(false),
    [photo, setPhoto] = useState(0)
  const [menu, setMenu] = useState(false),
    [drop, setDrop] = useState(''),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(''),
    [subscription, setSubscription] = useState(''),
    [playVideo, setPlayVideo] = useState(false)
  const banners = m
    ? (m.banners || []).map((b) => ({
        image: b.desktopImage || b.mobileImage || '',
        title: b.title || company,
        text: b.description || '',
        href: b.href || href('products'),
      }))
    : sample.hero.map((image, i) => ({
        image,
        title: ['Precision Agriculture', 'Agricultural Robotics', 'Geospatial Solutions'][i % 3],
        text: 'Unlock seamless, efficient farming with intelligent technology. Navigate with confidence, improve productivity, and build a more sustainable future.',
        href: href('products'),
      }))
  useEffect(() => {
    if (banners.length < 2) return
    const id = setInterval(() => setSlide((s) => (s + 1) % banners.length), 6000)
    return () => clearInterval(id)
  }, [banners.length])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false)
        setSearch(false)
        setDrop('')
        setZoom(false)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    const sync = () => {
      const id = decodeURIComponent(window.location.hash.slice(1)),
        params = new URLSearchParams(window.location.search)
      const key = params.get('category') || id
      const aliases: Record<string, string> = {
        'precision-agriculture': '精准农业',
        'farming-robot': '农业机器人',
        'geospatial-solutions': '地理空间',
      }
      if (!m)
        setCategory(aliases[key] || (sample.products.some((p) => p.category === key) ? key : 'All'))
      if (
        ['pre-sale', 'after-sale', 'become-a-dealer', 'make-an-inquiry', 'find-a-dealer'].includes(
          id,
        )
      )
        setContactTab(id)
      const q = params.get('q')
      if (q) setQuery(q)
    }
    sync()
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [m])
  useEffect(() => {
    if (!search && !zoom && !menu) return
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      if (search || zoom)
        modal.current?.querySelector<HTMLElement>(search ? 'input' : 'button')?.focus()
    })
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || (!search && !zoom)) return
      const nodes = Array.from(
        modal.current?.querySelectorAll<HTMLElement>(
          'button,a[href],input,textarea,select,[tabindex="0"]',
        ) || [],
      ).filter((e) => e.getClientRects().length)
      const first = nodes[0],
        last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [search, zoom, menu])
  const chooseCategory = (value: string) => {
    setCategory(value)
    const aliases: Record<string, string> = {
      精准农业: 'precision-agriculture',
      农业机器人: 'farming-robot',
      地理空间: 'geospatial-solutions',
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('category')
    url.hash = value === 'All' ? '' : aliases[value] || value
    window.history.replaceState(null, '', url)
  }
  const categories = [
    'All',
    ...new Set(products.map((p) => p.category).filter(Boolean) as string[]),
  ]
  const filtered = products.filter((p) => category === 'All' || p.category === category)
  const solutions = m
    ? (m.modules?.length
        ? m.modules
        : route === 'solutions'
          ? (m.cards || []).map((c) => ({ title: c.title, text: c.summary, image: c.image }))
          : []
      ).map((v) => ({
        title: v.title,
        summary: v.text || '',
        image: v.image || '',
      }))
    : sample.solutions
  const home = m ? m.kind === 'home' && !route : !current
  const kind =
    ([
      'solutions',
      'downloads',
      'search',
      'videos',
      'events',
      'support',
      'get-technical-support',
      'privacy-policy',
      'terms-of-use',
      'site-map',
    ].includes(route)
      ? route
      : m?.kind) ||
    (route === 'products'
      ? current.includes('/')
        ? 'product'
        : 'catalog'
      : ['news', 'blog'].includes(route)
        ? current.includes('/')
          ? 'article'
          : 'catalog'
        : route === 'about' || route === 'about-us'
          ? 'about'
          : route)
  const productDetail = !m ? sample.products.find((p) => current.endsWith('/' + p.slug)) : undefined
  const article = !m ? sample.news.find((p) => current.endsWith('/' + p.slug)) : undefined
  const pageTitle =
    m?.title ||
    productDetail?.title ||
    article?.title ||
    (
      {
        products: 'Our Products',
        news: 'Insights & Innovations',
        blog: 'Insights & Innovations',
        about: 'About Us',
        'about-us': 'About Us',
        contact: 'Let’s grow together',
        faqs: 'Frequently Asked Questions',
        downloads: 'Resource Downloads',
        solutions: 'Intelligent Solutions',
        search: 'Search',
        videos: 'Video Library',
        events: 'Events',
        support: 'Support Center',
        'get-technical-support': 'Technical Support',
        'privacy-policy': 'Privacy Policy',
        'terms-of-use': 'Terms Of Use',
        'site-map': 'Site Map',
      } as Record<string, string>
    )[route] ||
    'Page not found'
  const missing = !m && ((kind === 'product' && !productDetail) || (kind === 'article' && !article))
  const isProductList = kind === 'catalog' && (m ? m.section === 'products' : route === 'products')
  const cardGrid = (items: Card[], productCards = false) => (
    <div className="an-grid">
      {items.map((p, i) => (
        <article className="an-card" key={p.href + i}>
          {p.image && (
            <a className="an-image" href={p.href}>
              <img src={p.image} alt={p.title} loading="lazy" />
            </a>
          )}
          <div className="an-card-copy">
            <small>{p.category || 'Discover more'}</small>
            <h3>
              <a href={p.href}>{p.title}</a>
            </h3>
            <p>{p.summary}</p>
            <div className="an-card-actions">
              {productCards && (
                <a className="an-button" href={href('contact') + '#make-an-inquiry'}>
                  Get A Quote
                </a>
              )}
              <a className="an-link" href={p.href}>
                {productCards ? 'Full Details' : 'Explore'} →
              </a>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
  const searchResults = [...products, ...news].filter((p) =>
    (p.title + ' ' + (p.summary || '')).toLowerCase().includes(query.trim().toLowerCase()),
  )
  const searchForm = (
    <>
      <label className="an-field">
        Search products and insights
        <input
          autoFocus={search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
        />
      </label>
      {query.trim() ? (
        searchResults.length ? (
          cardGrid(searchResults)
        ) : (
          <p>No results found. Try another keyword.</p>
        )
      ) : (
        <p>Enter a keyword to find products and articles.</p>
      )}
    </>
  )
  const faq = m ? (m.faqs || []).map((f) => [f.question, f.answer]) : demoFAQ
  const contactTopics: Record<
    string,
    { label: string; title: string; description: string; heading: string }
  > = {
    'pre-sale': {
      label: 'Pre-Sale',
      title: 'Pre-Sale Assistance',
      description:
        'Explore the right solution for your equipment and field operations. Our team can help with compatibility, configuration and product information.',
      heading: 'Need Help Before Purchase?',
    },
    'after-sale': {
      label: 'After-Sale',
      title: 'After-Sale Support',
      description:
        'Tell us your product model and describe the issue so the support team can review your request.',
      heading: 'How Can We Help?',
    },
    'become-a-dealer': {
      label: 'Become A Dealer',
      title: 'Grow With Us',
      description:
        'Share your company, location and experience to explore a potential dealer partnership.',
      heading: 'Become An AllyNav Dealer',
    },
    'make-an-inquiry': {
      label: 'Make An Inquiry',
      title: 'Make An Inquiry',
      description:
        'Have a project in mind? Tell us what you need and we will help identify a suitable solution.',
      heading: 'Tell Us About Your Project',
    },
    'find-a-dealer': {
      label: 'Find A Dealer',
      title: 'Find A Local Dealer',
      description:
        'Search the small set of illustrative regions in this template. These are demo entries, not verified AllyNav dealer listings.',
      heading: 'Search Demo Regions',
    },
  }
  const topic = contactTopics[contactTab]
  const nav: { label: string; to?: string; children?: string[][] }[] = siteData
    ? siteData.links.map((l) => ({
        label: l.label,
        to: l.href,
        children: l.children?.length
          ? [[l.label, l.href], ...l.children.map((c) => [c.label, c.href])]
          : undefined,
      }))
    : [
        {
          label: 'Solutions',
          children: [
            ['All solutions', 'solutions'],
            ['Precision Agriculture', 'products#precision-agriculture'],
            ['Agricultural Robotics', 'products#farming-robot'],
            ['Geospatial Solutions', 'products#geospatial-solutions'],
          ],
        },
        {
          label: 'Products',
          children: [
            ['All products', 'products'],
            ['Product resources', 'downloads'],
          ],
        },
        {
          label: 'Resources',
          children: [
            ['Blog', 'blog'],
            ['News', 'news'],
            ['Videos', 'videos'],
            ['Events', 'events'],
            ['Downloads', 'downloads'],
          ],
        },
        {
          label: 'Support',
          children: [
            ['FAQs', 'faqs'],
            ['Technical Support', 'get-technical-support'],
            ['Support Center', 'support'],
            ['Contact Support', 'contact#after-sale'],
          ],
        },
        { label: 'Contact', to: 'contact' },
        { label: 'About Us', to: 'about' },
      ]
  const navHref = (to = '') => (/^(?:https?:|mailto:|tel:|\/)/.test(to) ? to : href(to))
  return (
    <div className="ally-template">
      <a className="an-skip" href="#an-main">
        Skip to content
      </a>
      <header className="an-header">
        <a className="an-logo" href={href()}>
          {(m ? siteData?.logo : sample.logo) ? (
            <img src={m ? siteData?.logo : sample.logo} alt={company} />
          ) : (
            <strong>{company}</strong>
          )}
        </a>
        <button
          className="an-mobile-toggle"
          ref={mobileButton}
          aria-controls="an-navigation"
          aria-label="Toggle navigation"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          ☰
        </button>
        <nav
          id="an-navigation"
          className={`an-nav ${menu ? 'is-open' : ''}`}
          aria-label="Main navigation"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) {
              setMenu(false)
              setDrop('')
            }
          }}
        >
          {nav.map((n) =>
            n.children ? (
              <div
                className="an-dropdown"
                key={n.label}
                onMouseEnter={() => {
                  if (window.matchMedia('(min-width: 851px)').matches) setDrop(n.label)
                }}
                onMouseLeave={() => {
                  if (window.matchMedia('(min-width: 851px)').matches) setDrop('')
                }}
              >
                <button
                  aria-expanded={drop === n.label}
                  onClick={() => setDrop(drop === n.label ? '' : n.label)}
                >
                  {n.label}
                </button>
                <div className={`an-mega ${drop === n.label ? 'is-open' : ''}`}>
                  {n.children.map(([label, to]) => (
                    <a key={label} href={navHref(to)}>
                      {label} →
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <a key={n.label} href={navHref(n.to)}>
                {n.label}
              </a>
            ),
          )}
        </nav>
        <button
          ref={searchButton}
          className="an-search"
          aria-label="Open search"
          onClick={() => setSearch(true)}
        >
          ⌕
        </button>
        <a className="an-button" href={href('contact') + '#become-a-dealer'}>
          Become Dealer
        </a>
      </header>
      <main id="an-main">
        {home ? (
          <>
            <section
              className="an-hero"
              style={
                banners[slide]?.image
                  ? {
                      backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.27),transparent),url("${banners[slide].image}")`,
                    }
                  : undefined
              }
            >
              <div className="an-hero-copy" key={slide}>
                <h1>{banners[slide]?.title || company}</h1>
                <p>{banners[slide]?.text}</p>
                <a className="an-button an-light" href={banners[slide]?.href || href('products')}>
                  Explore solutions →
                </a>
              </div>
              {banners.length > 1 && (
                <>
                  <div className="an-arrows">
                    <button
                      aria-label="Previous banner"
                      onClick={() => setSlide((slide - 1 + banners.length) % banners.length)}
                    >
                      ←
                    </button>
                    <button
                      aria-label="Next banner"
                      onClick={() => setSlide((slide + 1) % banners.length)}
                    >
                      →
                    </button>
                  </div>
                  <div className="an-dots">
                    {banners.map((_, i) => (
                      <button
                        key={i}
                        className={i === slide ? 'active' : ''}
                        aria-label={`Banner ${i + 1}`}
                        aria-pressed={slide === i}
                        onClick={() => setSlide(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
            <section className="an-section">
              <div className="an-split">
                <div>
                  <h2>
                    {m?.intro?.title ||
                      (m ? company : 'Empowering Farms with Precision and Innovation')}
                  </h2>
                  <a className="an-link" href={href('about')}>
                    Learn More →
                  </a>
                </div>
                <p>
                  {m
                    ? m.intro?.text
                    : 'At AllyNav, we revolutionize agriculture with cutting-edge technology to improve efficiency, sustainability, and maximize yields. Explore the impact of our smart agriculture solutions on global farming.'}
                </p>
              </div>
              <div className="an-stats">
                {(m
                  ? m.stats || []
                  : [
                      { value: '200', unit: '+', label: 'R&D and Tech Experts' },
                      { value: '10', unit: '+', label: 'Years Driving Agri-tech Success' },
                      { value: '60', unit: '+', label: 'Countries Served Worldwide' },
                      { value: '1000', unit: '+', label: 'Autonomous Farming Projects' },
                    ]
                ).map((s) => (
                  <div key={s.label}>
                    <strong>
                      {s.value}
                      {s.unit}
                    </strong>
                    <p>{s.label}</p>
                  </div>
                ))}
              </div>
            </section>
            {products.length > 0 && (
              <section className="an-section">
                <div className="an-section-head">
                  <div>
                    <h2>Product Inquiry</h2>
                    <p>Explore innovative products that enhance efficiency.</p>
                  </div>
                  <a className="an-link" href={href('products')}>
                    View All Products →
                  </a>
                </div>
                <div className="an-carousel-controls">
                  <button
                    aria-label="Previous products"
                    onClick={() =>
                      setProductOffset((i) => (i - 1 + products.length) % products.length)
                    }
                  >
                    ←
                  </button>
                  <button
                    aria-label="Next products"
                    onClick={() => setProductOffset((i) => (i + 1) % products.length)}
                  >
                    →
                  </button>
                </div>
                {cardGrid(
                  [...products.slice(productOffset), ...products.slice(0, productOffset)].slice(
                    0,
                    3,
                  ),
                  true,
                )}
              </section>
            )}
            {m?.video && (
              <section id="an-video" className="an-section an-video-library">
                <h2>{m.video.title}</h2>
                {m.video.embed ? (
                  <iframe src={m.video.src} title={m.video.title} allowFullScreen />
                ) : (
                  <video src={m.video.src} controls playsInline />
                )}
              </section>
            )}
            {solutions.map((s, i) =>
              !m && i === 1 ? (
                <section className="an-section an-robot-section" key={s.title}>
                  <div className="an-section-head">
                    <div>
                      <h2>Agricultural Robotics</h2>
                      <p>{s.summary}</p>
                      <a className="an-link" href={href('products') + '#farming-robot'}>
                        Explore smart agricultural robots →
                      </a>
                    </div>
                  </div>
                  <div className="an-split">
                    <div className="an-robot-accordion">
                      {['Orchard Robots', 'Spraying Robots', 'Mowing Robots'].map((title, j) => (
                        <div className={`an-robot-item ${robot === j ? 'active' : ''}`} key={title}>
                          <button aria-expanded={robot === j} onClick={() => setRobot(j)}>
                            {title}
                            <span>{robot === j ? '−' : '+'}</span>
                          </button>
                          {robot === j && (
                            <div>
                              <p>
                                {
                                  [
                                    'Intelligent orchard operations that reduce repetitive labour and improve precision.',
                                    'Controlled spraying for efficient crop protection and targeted application.',
                                    'Autonomous mowing for consistent grounds maintenance and reduced manual work.',
                                  ][j]
                                }
                              </p>
                              <a href={href('products') + '#farming-robot'} className="an-link">
                                Explore {title} →
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <img
                      className="an-solution-image"
                      src={
                        [sample.aboutImage, sample.solutions[1].image, sample.solutions[0].image][
                          robot
                        ]
                      }
                      alt={['Orchard Robots', 'Spraying Robots', 'Mowing Robots'][robot]}
                      loading="lazy"
                    />
                  </div>
                </section>
              ) : (
                <section
                  className={`an-section an-split ${i % 2 ? 'an-reverse' : ''}`}
                  key={s.title}
                >
                  <div>
                    <h2>{s.title}</h2>
                    <p>{s.summary}</p>
                    <a className="an-link" href={href('solutions')}>
                      Explore solutions →
                    </a>
                  </div>
                  {s.image && (
                    <img className="an-solution-image" src={s.image} alt={s.title} loading="lazy" />
                  )}
                </section>
              ),
            )}
            {!m && (
              <section className="an-section an-discover">
                <div className="an-section-head">
                  <div>
                    <h2>Discover More Solutions</h2>
                    <p>Explore ready-to-use solutions for connected operations.</p>
                  </div>
                  <div className="an-carousel-controls">
                    <button
                      aria-label="Previous solutions"
                      onClick={() => setSolutionOffset((i) => (i + 1) % 2)}
                    >
                      ←
                    </button>
                    <button
                      aria-label="Next solutions"
                      onClick={() => setSolutionOffset((i) => (i + 1) % 2)}
                    >
                      →
                    </button>
                  </div>
                </div>
                <div className="an-grid">
                  {[0, 1].map((_, i) => {
                    const index = (i + solutionOffset) % 2
                    return (
                      <article className="an-card" key={index}>
                        <a className="an-image" href={href('solutions')}>
                          <img
                            src={sample.solutions[index].image}
                            alt={['Livestock Management', 'Machine Control'][index]}
                            loading="lazy"
                          />
                        </a>
                        <div className="an-card-copy">
                          <h3>{['Livestock Management', 'Machine Control'][index]}</h3>
                          <p>
                            {
                              [
                                'Connected monitoring for more informed livestock care.',
                                'Precision guidance for dependable machine control.',
                              ][index]
                            }
                          </p>
                          <a className="an-link" href={href('solutions')}>
                            Discover more →
                          </a>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
            {news.length > 0 && (
              <section className="an-section">
                <div className="an-section-head">
                  <div>
                    <h2>Insights & Innovations</h2>
                    <p>Technology trends and real-world applications.</p>
                  </div>
                  <a className="an-link" href={href('news')}>
                    Read More →
                  </a>
                </div>
                {cardGrid(news.slice(0, 3))}
              </section>
            )}
          </>
        ) : (
          <>
            <section className="an-inner">
              <div className="an-breadcrumb">
                <a href={href()}>Home</a> / {pageTitle}
              </div>
              {missing ? (
                <h1>Page not found</h1>
              ) : isProductList ? (
                <div
                  className="an-page-banner"
                  style={
                    (m ? m.image : sample.hero[0])
                      ? {
                          backgroundImage: `linear-gradient(90deg,#0006,transparent),url("${m ? m.image : sample.hero[0]}")`,
                        }
                      : undefined
                  }
                >
                  <h1>{m ? pageTitle : 'Discover AllyNav Products'}</h1>
                </div>
              ) : !['product', 'contact'].includes(kind) ? (
                <h1>{!m && kind === 'about' ? 'AllyNav, All for Agriculture' : pageTitle}</h1>
              ) : null}
              {m?.summary && <p>{m.summary}</p>}
            </section>
            <section className="an-section">
              {isProductList ? (
                <div className="an-catalog">
                  <aside className="an-catalog-side">
                    <div className="an-tabs">
                      {m?.categories?.length
                        ? m.categories.map((c) => (
                            <a key={c.href} href={c.href}>
                              {c.label}
                            </a>
                          ))
                        : categories.map((c) => (
                            <button
                              className={category === c ? 'active' : ''}
                              key={c}
                              onClick={() => chooseCategory(c)}
                            >
                              {c}
                            </button>
                          ))}
                    </div>
                  </aside>
                  <div>
                    {cardGrid(filtered, true)}
                    {!filtered.length && <p>No products in this category.</p>}
                  </div>
                </div>
              ) : kind === 'catalog' ? (
                <>
                  {cardGrid(news)}
                  {!news.length && <p>No articles available.</p>}
                </>
              ) : null}
              {kind === 'catalog' && m?.pagination && m.pagination.totalPages > 1 && (
                <nav className="an-tabs" aria-label="Pagination">
                  {Array.from({ length: m.pagination.totalPages }, (_, i) => (
                    <a
                      aria-current={m.pagination!.page === i + 1 ? 'page' : undefined}
                      href={`${href(m.section)}?${new URLSearchParams({ ...(m.activeCategory ? { category: m.activeCategory } : {}), page: String(i + 1) })}`}
                      key={i}
                    >
                      {i + 1}
                    </a>
                  ))}
                </nav>
              )}
              {kind === 'product' && !missing && (
                <>
                  <div className="an-split">
                    {(m?.images?.[0] || productDetail?.image) && (
                      <div className="an-gallery">
                        <button
                          className="an-gallery-main"
                          aria-label="Enlarge product image"
                          onClick={() => setZoom(true)}
                        >
                          <img
                            className="an-product-image"
                            src={m?.images?.[photo] || productDetail?.image}
                            alt={pageTitle}
                          />
                          <span>⌕</span>
                        </button>
                        {m?.images && m.images.length > 1 && (
                          <div className="an-tabs">
                            {m.images.map((image, i) => (
                              <button
                                aria-label={`Product image ${i + 1}`}
                                aria-pressed={photo === i}
                                key={image + i}
                                onClick={() => setPhoto(i)}
                              >
                                <img width="60" height="60" src={image} alt="" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <h1>{pageTitle}</h1>
                      <p>{m?.summary || productDetail?.summary}</p>
                      <div className="an-faq">
                        <details open>
                          <summary>Why You’ll Choose It</summary>
                          <p>{m?.summary || productDetail?.summary}</p>
                        </details>
                        <details>
                          <summary>Features</summary>
                          {m?.parameters?.length ? (
                            <ul>
                              {m.parameters.map((p) => (
                                <li key={p.label}>
                                  {p.label}: {p.value}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>
                              {m
                                ? 'Contact our team for product specifications.'
                                : 'Intuitive operation, installation guidance, and flexible configuration.'}
                            </p>
                          )}
                        </details>
                      </div>
                      <a className="an-button" href={href('contact')}>
                        Get a quote →
                      </a>
                    </div>
                  </div>
                  <div className="an-tabs">
                    {['Overview', 'Specifications', 'Downloads'].map((t) => (
                      <button
                        className={tab === t ? 'active' : ''}
                        onClick={() => setTab(t)}
                        key={t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {tab === 'Overview' ? (
                    <div className="an-rich">
                      {m ? (
                        m.content
                      ) : (
                        <p>
                          {productDetail?.summary} Designed for reliable operation, a simple
                          installation workflow, and intuitive control. Contact the team to discuss
                          the right configuration for your project.
                        </p>
                      )}
                    </div>
                  ) : tab === 'Specifications' ? (
                    <table>
                      <tbody>
                        {(m
                          ? m.parameters || []
                          : [
                              {
                                label: 'Application',
                                value: productDetail?.category || 'Precision positioning',
                              },
                              {
                                label: 'Support',
                                value: 'Installation guidance and product training',
                              },
                              { label: 'Connectivity', value: 'GNSS / RTK' },
                            ]
                        ).map((p) => (
                          <tr key={p.label}>
                            <th>{p.label}</th>
                            <td>{p.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <>
                      <p>Product resources</p>
                      {m ? (
                        m.datasheet ? (
                          <a className="an-button" href={m.datasheet} download>
                            Download datasheet
                          </a>
                        ) : (
                          <p>No datasheet has been published.</p>
                        )
                      ) : (
                        <a
                          className="an-button"
                          download="product-information.json"
                          href={
                            'data:application/json;charset=utf-8,' +
                            encodeURIComponent(JSON.stringify(productDetail, null, 2))
                          }
                        >
                          Download demo product information
                        </a>
                      )}
                    </>
                  )}
                </>
              )}
              {kind === 'article' && !missing && (
                <article className="an-rich">
                  {m ? (
                    m.content
                  ) : (
                    <>
                      {article?.image && <img src={article.image} alt={pageTitle} />}
                      <h2>{pageTitle}</h2>
                      <p>{article?.summary}</p>
                      <p>
                        Precision technology brings reliable guidance and better visibility to daily
                        operations. This sample article illustrates the template’s editorial layout;
                        replace the text and media through your site editor.
                      </p>
                    </>
                  )}
                  {m?.previous && (
                    <p>
                      <a href={m.previous.href}>← {m.previous.label}</a>
                    </p>
                  )}
                  {m?.next && (
                    <p>
                      <a href={m.next.href}>{m.next.label} →</a>
                    </p>
                  )}
                </article>
              )}
              {kind === 'about' && (
                <>
                  <div className="an-split">
                    <div>
                      <h2>{m?.intro?.title || pageTitle}</h2>
                      <p>
                        {m
                          ? m.intro?.text
                          : 'Driven by precision and innovation, we develop intelligent technology that connects equipment, people, and data. Our mission is to make advanced solutions accessible and practical.'}
                      </p>
                      {m?.certificates && <p>{m.certificates}</p>}
                    </div>
                    {(m?.intro?.image || (!m && sample.aboutImage)) && (
                      <img src={m?.intro?.image || sample.aboutImage} alt={company} />
                    )}
                  </div>
                  {m?.modules?.map((v) => (
                    <div className="an-split" key={v.title}>
                      <div>
                        <h2>{v.title}</h2>
                        <p>{v.text}</p>
                      </div>
                      {v.image && <img src={v.image} alt={v.title} />}
                    </div>
                  ))}
                </>
              )}
              {kind === 'about' && !m && (
                <section className="an-history">
                  <small>Our Journey · Template sample</small>
                  <h2>Innovation that moves forward</h2>
                  <div className="an-history-track">
                    <article>
                      <strong>01</strong>
                      <h3>Built on precision</h3>
                      <p>
                        A sample milestone introducing the team’s vision and technical foundations.
                      </p>
                    </article>
                    <article>
                      <strong>02</strong>
                      <h3>Connected agriculture</h3>
                      <p>
                        A sample milestone showing how solutions grow from guidance to intelligent
                        operations.
                      </p>
                    </article>
                  </div>
                </section>
              )}
              {kind === 'solutions' &&
                solutions.map((s) => (
                  <div className="an-split" key={s.title}>
                    <div>
                      <h2>{s.title}</h2>
                      <p>{s.summary}</p>
                      <a className="an-button" href={href('products')}>
                        Explore products →
                      </a>
                    </div>
                    {s.image && <img src={s.image} alt={s.title} />}
                  </div>
                ))}
              {kind === 'contact' && (
                <>
                  <div className="an-contact-tabs" role="tablist" aria-label="Contact topic">
                    {Object.entries(contactTopics).map(([id, item]) => (
                      <button
                        id={'tab-' + id}
                        role="tab"
                        tabIndex={contactTab === id ? 0 : -1}
                        onKeyDown={(event) => {
                          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                            return
                          event.preventDefault()
                          const ids = Object.keys(contactTopics),
                            i = ids.indexOf(id),
                            next =
                              event.key === 'Home'
                                ? ids[0]
                                : event.key === 'End'
                                  ? ids[ids.length - 1]
                                  : ids[
                                      (i + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) %
                                        ids.length
                                    ]
                          setContactTab(next)
                          window.history.replaceState(null, '', '#' + next)
                          document.getElementById('tab-' + next)?.focus()
                        }}
                        aria-selected={contactTab === id}
                        aria-controls="an-contact-panel"
                        key={id}
                        className={contactTab === id ? 'active' : ''}
                        onClick={() => {
                          setContactTab(id)
                          window.history.replaceState(null, '', '#' + id)
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div
                    id="an-contact-panel"
                    className="an-contact-panel an-split"
                    role="tabpanel"
                    aria-labelledby={'tab-' + contactTab}
                  >
                    <div>
                      <small className="an-link">Contact Us</small>
                      <h2>
                        {m
                          ? contactTab === 'become-a-dealer'
                            ? `Partner with ${company}`
                            : topic.title
                          : topic.title}
                      </h2>
                      <p>{m?.summary || topic.description}</p>
                      {m?.contact?.email && (
                        <p>
                          <a href={`mailto:${m.contact.email}`}>{m.contact.email}</a>
                        </p>
                      )}
                      {m?.contact?.phone && (
                        <p>
                          <a href={`tel:${m.contact.phone}`}>{m.contact.phone}</a>
                        </p>
                      )}
                      <p>{m?.contact?.address}</p>
                    </div>
                    <div className="an-form-card">
                      <h2>
                        {m && contactTab === 'become-a-dealer' ? 'Dealer inquiry' : topic.heading}
                      </h2>
                      {contactTab === 'find-a-dealer' ? (
                        m ? (
                          <>
                            <p>
                              Contact the company for current dealer availability in your region.
                            </p>
                            {m.contact?.email && (
                              <a className="an-button" href={`mailto:${m.contact.email}`}>
                                Ask about local service →
                              </a>
                            )}
                          </>
                        ) : (
                          <>
                            <label className="an-field">
                              Location
                              <input
                                type="search"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Search Europe, Asia or North America"
                              />
                            </label>
                            <p className="an-notice">
                              Illustrative template entries only. No live map service is connected.
                            </p>
                            {['Europe', 'Asia', 'North America']
                              .filter((v) => v.toLowerCase().includes(location.toLowerCase()))
                              .map((v) => (
                                <article className="an-dealer" key={v}>
                                  <h3>{v} · Sample service region</h3>
                                  <a
                                    className="an-link"
                                    href={href('contact') + '#make-an-inquiry'}
                                  >
                                    Ask about this region →
                                  </a>
                                </article>
                              ))}
                            {!['Europe', 'Asia', 'North America'].some((v) =>
                              v.toLowerCase().includes(location.toLowerCase()),
                            ) && <p>No demo region matches your search.</p>}
                          </>
                        )
                      ) : (
                        m?.showInquiry !== false && <Inquiry model={m} topic={topic.label} />
                      )}
                    </div>
                  </div>
                </>
              )}
              {kind === 'faqs' && (
                <div className="an-faq">
                  {faq.map(([q, a], i) => (
                    <details key={i}>
                      <summary>{q as ReactNode}</summary>
                      <div>{a as ReactNode}</div>
                    </details>
                  ))}
                </div>
              )}
              {kind === 'downloads' && (
                <>
                  {products.map((p) => (
                    <div className="an-download" key={p.href}>
                      <h3>{p.title}</h3>
                      <a
                        className="an-button"
                        download="product-information.json"
                        href={
                          'data:application/json;charset=utf-8,' +
                          encodeURIComponent(JSON.stringify(p, null, 2))
                        }
                      >
                        Download product information ↓
                      </a>
                    </div>
                  ))}
                </>
              )}
              {missing && (
                <p>
                  The requested item does not exist.{' '}
                  <a className="an-link" href={href(kind === 'product' ? 'products' : 'news')}>
                    Browse available items →
                  </a>
                </p>
              )}
              {kind === 'search' && searchForm}
              {['support', 'get-technical-support'].includes(kind) && (
                <div className="an-split">
                  <div>
                    <h2>How can we help?</h2>
                    <p>
                      Find product resources, read common questions, or contact our support team.
                    </p>
                    <div className="an-tabs">
                      <a href={href('downloads')}>Downloads</a>
                      <a href={href('faqs')}>FAQs</a>
                      <a href={href('contact') + '#after-sale'}>After-sale support →</a>
                    </div>
                  </div>
                  <Inquiry model={m} topic="Technical support" />
                </div>
              )}
              {kind === 'events' && (
                <div className="an-grid">
                  {m
                    ? (m.cards || []).map((c) => (
                        <article className="an-card" key={c.href}>
                          <h2>
                            <a href={c.href}>{c.title}</a>
                          </h2>
                          <p>{c.summary}</p>
                        </article>
                      ))
                    : [
                        'Precision Agriculture Open Day',
                        'Connected Farming Technology Workshop',
                      ].map((title, i) => (
                        <article className="an-card an-event" key={title}>
                          <small>Template sample event · schedule to be confirmed</small>
                          <h2>{title}</h2>
                          <p>
                            {i
                              ? 'An introductory workshop on connected equipment and field workflows.'
                              : 'Explore smart guidance and automated field operations.'}
                          </p>
                          <a className="an-button" href={href('contact') + '#make-an-inquiry'}>
                            Ask about this event →
                          </a>
                        </article>
                      ))}
                </div>
              )}
              {kind === 'videos' && (
                <div className="an-video-library">
                  {m ? (
                    m.video ? (
                      m.video.embed ? (
                        <iframe src={m.video.src} title={m.video.title} allowFullScreen />
                      ) : (
                        <video src={m.video.src} controls playsInline />
                      )
                    ) : (
                      <p>No video has been published.</p>
                    )
                  ) : (
                    <>
                      <h2>AllyNav Precision Agriculture</h2>
                      <p>
                        Official demonstration video. Playback uses YouTube and requires a network
                        connection.
                      </p>
                      {playVideo ? (
                        <iframe
                          src="https://www.youtube.com/embed/isoc7r9ONuQ?autoplay=1&controls=1"
                          title="AllyNav precision agriculture video"
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <button
                          className="an-video-poster"
                          aria-label="Play official AllyNav video"
                          onClick={() => setPlayVideo(true)}
                        >
                          <img
                            src={sample.hero[0]}
                            alt="Agricultural precision guidance demonstration"
                          />
                          <span>▶ Play video</span>
                        </button>
                      )}
                      <p>
                        <a
                          className="an-link"
                          href="https://www.youtube.com/watch?v=isoc7r9ONuQ"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open on YouTube ↗
                        </a>
                      </p>
                    </>
                  )}
                </div>
              )}
              {['privacy-policy', 'terms-of-use'].includes(kind) && (
                <article className="an-rich">
                  <h2>{kind === 'privacy-policy' ? 'Privacy Policy' : 'Terms Of Use'}</h2>
                  {m ? (
                    m.content || <p>Contact the company for its current policy.</p>
                  ) : (
                    <>
                      <p>
                        This is a local demonstration of a reusable website template, not the
                        official AllyNav website.
                      </p>
                      <h3>
                        {kind === 'privacy-policy'
                          ? 'Data in this demonstration'
                          : 'Using this template demonstration'}
                      </h3>
                      <p>
                        Demo inquiry and newsletter forms save entered information on this browser
                        only. They do not send it to AllyNav or an external mailing service. Browser
                        storage can be cleared through your browser settings.
                      </p>
                      <p>
                        Product descriptions and event information are illustrative samples. Actual
                        commercial terms, product specifications and privacy notices must be
                        supplied by the site owner before publication.
                      </p>
                      <a className="an-link" href={href('contact')}>
                        Contact →
                      </a>
                    </>
                  )}
                </article>
              )}
              {kind === 'site-map' && (
                <nav className="an-sitemap" aria-label="Site map">
                  {[
                    ['Home', ''],
                    ['Products', 'products'],
                    ['Solutions', 'solutions'],
                    ['About Us', 'about'],
                    ['Blog', 'blog'],
                    ['News', 'news'],
                    ['Videos', 'videos'],
                    ['Events', 'events'],
                    ['Support', 'support'],
                    ['FAQs', 'faqs'],
                    ['Downloads', 'downloads'],
                    ['Contact', 'contact'],
                    ['Privacy Policy', 'privacy-policy'],
                    ['Terms Of Use', 'terms-of-use'],
                  ].map(([name, to]) => (
                    <p key={name}>
                      <a href={href(to)}>{name} →</a>
                    </p>
                  ))}
                </nav>
              )}
            </section>
          </>
        )}
      </main>
      <footer className="an-footer">
        <div className="an-section">
          <div className="an-split">
            <div>
              <h2>Stay Updated</h2>
              <p>News and ideas in precision technology.</p>
            </div>
            <form
              className="an-subscribe"
              onSubmit={(e) => {
                e.preventDefault()
                try {
                  localStorage.setItem(
                    'allynav-demo-newsletter',
                    String(new FormData(e.currentTarget).get('email')),
                  )
                  setSubscription('Saved on this browser only. No subscription was sent.')
                } catch {
                  setSubscription('Storage is unavailable. Please try another browser.')
                }
              }}
            >
              <label>
                Email
                <input name="email" type="email" required placeholder="Your email address" />
              </label>
              <button className="an-button">Subscribe →</button>
              <p role="status">{subscription}</p>
            </form>
          </div>
          <div className="an-footer-grid">
            <div>
              <h3>{company}</h3>
              <p>Precision. Innovation. Possibilities.</p>
            </div>
            <div>
              <h3>Explore</h3>
              <a href={href('products')}>Products</a>
              <a href={href('solutions')}>Solutions</a>
              <a href={href('about')}>About Us</a>
            </div>
            <div>
              <h3>Resources</h3>
              <a href={href('blog')}>Blog</a>
              <a href={href('news')}>News</a>
              {!m && <a href={href('videos')}>Videos</a>}
              {!m && <a href={href('events')}>Events</a>}
              <a href={href('downloads')}>Downloads</a>
              <a href={href('faqs')}>FAQs</a>
            </div>
            <div>
              <h3>Contact</h3>
              <a href={href('contact')}>Make an inquiry</a>
              {m?.contact?.email && <a href={`mailto:${m.contact.email}`}>{m.contact.email}</a>}
            </div>
          </div>
          <div className="an-copyright">
            © {new Date().getFullYear()} {company}. {!m && 'Independent template demonstration.'}
            {!m && (
              <div className="an-legal-links">
                <a href={href('privacy-policy')}>Privacy Policy</a>
                <a href={href('terms-of-use')}>Term Of Use</a>
                <a href={href('site-map')}>Site Map</a>
              </div>
            )}
          </div>
        </div>
      </footer>
      <a className="an-floating" href={href('contact')}>
        ☏ Inquiry
      </a>
      <button
        className="an-top"
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </button>
      {zoom &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="ally-template">
            <div
              ref={modal}
              className="an-modal an-image-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Product image"
            >
              <button className="an-close" aria-label="Close image" onClick={() => setZoom(false)}>
                ×
              </button>
              <img src={m?.images?.[photo] || productDetail?.image} alt={pageTitle} />
            </div>
          </div>,
          document.body,
        )}
      {search &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="ally-template">
            <div
              ref={modal}
              className="an-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Site search"
            >
              <button
                className="an-close"
                aria-label="Close search"
                onClick={() => setSearch(false)}
              >
                ×
              </button>
              <div className="an-section">{searchForm}</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
