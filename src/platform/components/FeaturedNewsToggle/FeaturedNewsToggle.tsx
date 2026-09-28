'use client'

import { FeaturedToggle } from '../FeaturedProductToggle/FeaturedToggle'

export function FeaturedNewsToggle({
  companySlug,
  contentName,
  endpoint,
  featured,
  newsID,
}: {
  companySlug: string
  contentName?: string
  endpoint?: string
  featured: boolean
  newsID: number
}) {
  return (
    <FeaturedToggle
      endpoint={endpoint || `/api/workspace/${companySlug}/news/${newsID}/featured`}
      initial={featured}
      label={contentName || `内容 ${newsID}`}
    />
  )
}
