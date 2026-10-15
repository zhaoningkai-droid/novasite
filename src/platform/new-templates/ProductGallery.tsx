'use client'

import { useState } from 'react'

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0)
  const active = selected < images.length ? selected : 0
  if (!images.length) return null

  return (
    <div className="nt-product-gallery">
      <a
        className="nt-gallery-main"
        href={images[active]}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={images[active]} alt={`${title} ${active + 1}`} width="800" height="800" />
      </a>
      {images.length > 1 ? (
        <div className="nt-gallery-thumbnails" role="group" aria-label={title}>
          {images.map((image, index) => (
            <button
              type="button"
              key={`${image}-${index}`}
              aria-label={`${title} ${index + 1}`}
              aria-pressed={active === index}
              onClick={() => setSelected(index)}
            >
              <img src={image} alt="" width="100" height="100" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
