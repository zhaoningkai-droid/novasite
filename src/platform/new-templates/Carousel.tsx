'use client'
import { useEffect, useState } from 'react'
import { templateCopy } from './copy'
import type { SiteLocale } from '@/platform/site'
export type Banner = {
  desktopImage?: string
  mobileImage?: string
  title?: string
  description?: string
  href?: string | null
}
export function Carousel({
  banners,
  locale,
  company,
}: {
  banners: Banner[]
  locale: SiteLocale
  company: string
}) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const t = templateCopy(locale)
  useEffect(() => {
    if (
      !playing ||
      banners.length < 2 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const timer = window.setInterval(() => setActive((i) => (i + 1) % banners.length), 6000)
    return () => window.clearInterval(timer)
  }, [playing, banners.length])
  if (!banners.length)
    return (
      <section className="nt-hero nt-hero--plain">
        <h1>{company}</h1>
      </section>
    )
  return (
    <section className="nt-hero" aria-label={company}>
      {banners.map((banner, i) => (
        <div className="nt-slide" key={i} hidden={active !== i}>
          {banner.desktopImage || banner.mobileImage ? (
            <picture>
              {banner.mobileImage ? (
                <source media="(max-width: 759px)" srcSet={banner.mobileImage} />
              ) : null}
              <img
                src={banner.desktopImage || banner.mobileImage}
                alt=""
                width="1600"
                height="760"
                fetchPriority={i === 0 ? 'high' : 'auto'}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </picture>
          ) : null}
          <div className="nt-hero-copy">
            <h1>{banner.title || company}</h1>
            {banner.description ? <p>{banner.description}</p> : null}
            {banner.href ? (
              <a className="nt-button" href={banner.href}>
                {t.detail}
              </a>
            ) : null}
          </div>
        </div>
      ))}
      {banners.length > 1 ? (
        <div className="nt-carousel-controls">
          <button
            type="button"
            aria-label={t.previous}
            onClick={() => setActive((i) => (i + banners.length - 1) % banners.length)}
          >
            ←
          </button>
          {banners.map((_, i) => (
            <button
              type="button"
              key={i}
              aria-label={`${i + 1}`}
              aria-pressed={active === i}
              onClick={() => setActive(i)}
            >
              {String(i + 1).padStart(2, '0')}
            </button>
          ))}
          <button
            type="button"
            aria-label={t.next}
            onClick={() => setActive((i) => (i + 1) % banners.length)}
          >
            →
          </button>
          <button type="button" onClick={() => setPlaying(!playing)}>
            {playing ? t.pause : t.play}
          </button>
        </div>
      ) : null}
    </section>
  )
}
