'use client'

import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { SiteLocale } from '@/platform/site-locales'

const labels: Record<SiteLocale, { previous: string; next: string; image: string; empty: string }> =
  {
    zh: { previous: '上一张图片', next: '下一张图片', image: '图片', empty: '暂无产品图片' },
    en: {
      previous: 'Previous image',
      next: 'Next image',
      image: 'Image',
      empty: 'No product images',
    },
    es: {
      previous: 'Imagen anterior',
      next: 'Imagen siguiente',
      image: 'Imagen',
      empty: 'Sin imágenes del producto',
    },
    ar: {
      previous: 'الصورة السابقة',
      next: 'الصورة التالية',
      image: 'صورة',
      empty: 'لا توجد صور للمنتج',
    },
    id: {
      previous: 'Gambar sebelumnya',
      next: 'Gambar berikutnya',
      image: 'Gambar',
      empty: 'Tidak ada gambar produk',
    },
    de: {
      previous: 'Vorheriges Bild',
      next: 'Nächstes Bild',
      image: 'Bild',
      empty: 'Keine Produktbilder',
    },
    ru: {
      previous: 'Предыдущее изображение',
      next: 'Следующее изображение',
      image: 'Изображение',
      empty: 'Нет изображений товара',
    },
  }

export function ExecutiveTenantProductGallery({
  images,
  title,
  locale = 'en',
}: {
  images: Array<{ url: string; alt: string }>
  title: string
  locale?: SiteLocale
}) {
  const [active, setActive] = useState(0)
  const t = labels[locale]
  const current = images[active]
  const move = (direction: -1 | 1) =>
    setActive((index) => (index + direction + images.length) % images.length)

  return (
    <div className="ed-product-detail__gallery">
      {current ? (
        <>
          {images.length > 1 ? (
            <button
              aria-label={t.previous}
              className="ed-product-detail__arrow ed-product-detail__arrow--left"
              onClick={() => move(-1)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          <div className="ed-product-detail__main-image">
            <Image
              alt={current.alt || title}
              fill
              priority
              sizes="(max-width: 760px) 100vw, 48vw"
              src={current.url}
              unoptimized
            />
          </div>
          {images.length > 1 ? (
            <button
              aria-label={t.next}
              className="ed-product-detail__arrow ed-product-detail__arrow--right"
              onClick={() => move(1)}
              type="button"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
          {images.length > 1 ? (
            <div className="ed-product-detail__thumbs">
              {images.map((item, index) => (
                <button
                  aria-label={`${t.image} ${index + 1}`}
                  aria-pressed={index === active}
                  key={`${item.url}-${index}`}
                  onClick={() => setActive(index)}
                  type="button"
                >
                  <Image alt="" fill sizes="96px" src={item.url} unoptimized />
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div
          aria-label={t.empty}
          className="ed-product-detail__main-image ed-product-detail__main-image--empty"
        >
          <span>{t.empty}</span>
        </div>
      )}
    </div>
  )
}
