'use client'

import { FeaturedToggle } from './FeaturedToggle'

export function FeaturedProductToggle({
  endpoint,
  initial,
  productName,
}: {
  endpoint: string
  initial: boolean
  productName: string
}) {
  return <FeaturedToggle endpoint={endpoint} initial={initial} label={productName} />
}
