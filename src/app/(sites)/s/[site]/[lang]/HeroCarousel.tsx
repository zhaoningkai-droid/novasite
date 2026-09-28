'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'

type Banner = { desktopImage?: string; description?: string; linkType?: 'external' | 'internal' | 'none'; linkURL?: string; mobileImage?: string; sortOrder?: number; title?: string }
type Slide = Banner & { isFallback?: boolean }

export function HeroCarousel({ banners, children, eyebrow, fallbackDescription, fallbackImage, fallbackTitle }: { banners: Banner[]; children?: ReactNode; eyebrow?: ReactNode; fallbackDescription: string; fallbackImage?: string | null; fallbackTitle: string }) {
  const slides = useMemo<Slide[]>(() => {
    const configured = banners.filter((banner) => banner.desktopImage || banner.mobileImage || banner.title || banner.description).sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    return configured.length ? configured : [{ desktopImage: fallbackImage || '', description: fallbackDescription, isFallback: true, title: fallbackTitle }]
  }, [banners, fallbackDescription, fallbackImage, fallbackTitle])
  const [active, setActive] = useState(0)
  const [mobile, setMobile] = useState(false)
  const current = slides[active] || slides[0]
  const image = mobile ? current.mobileImage || current.desktopImage : current.desktopImage || current.mobileImage
  const destination = current.linkType === 'internal' && current.linkURL?.startsWith('/') && !current.linkURL.startsWith('//') ? current.linkURL : current.linkType === 'external' && current.linkURL?.startsWith('https://') ? current.linkURL : null
  const title = current.isFallback ? current.title || fallbackTitle : current.title || ''
  const description = current.isFallback ? current.description || fallbackDescription : current.description || ''
  const hasCopy = Boolean(title.trim() || description.trim())

  useEffect(() => {
    const update = () => setMobile(window.innerWidth <= 760)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => setActive((index) => (index + 1) % slides.length), 6000)
    return () => window.clearInterval(timer)
  }, [slides.length])
  useEffect(() => setActive((index) => Math.min(index, slides.length - 1)), [slides.length])

  return <section className={`site-editorial-hero site-editorial-hero--carousel ${hasCopy ? 'site-editorial-hero--with-copy' : 'site-editorial-hero--image-only'}`} style={image ? { backgroundImage: `url(${image})` } : undefined}>
    {hasCopy ? <div className="site-wrap site-editorial-hero__content">
      {title ? <h1>{title}</h1> : null}
      {description ? <p>{description}</p> : null}
      {destination ? <a className="site-hero-link" href={destination} rel={current.linkType === 'external' ? 'noopener noreferrer' : undefined} target={current.linkType === 'external' ? '_blank' : undefined}>查看详情</a> : null}
      {children}
    </div> : null}
    {slides.length > 1 ? <div aria-label="首页横幅切换" className="site-hero-dots">{slides.map((_, index) => <button aria-label={`切换到第 ${index + 1} 张横幅`} aria-pressed={active === index} className={active === index ? 'active' : ''} key={index} onClick={() => setActive(index)} type="button" />)}</div> : null}
  </section>
}
