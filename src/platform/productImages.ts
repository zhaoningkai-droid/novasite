type MediaLike = { url?: string | null }
type ProductLike = { gallery?: unknown }

export const productImageURLs = (product: ProductLike): string[] => Array.isArray(product.gallery)
  ? product.gallery.flatMap((item) => typeof item === 'object' && item && typeof (item as MediaLike).url === 'string' ? [(item as MediaLike).url as string] : [])
  : []

export const productCoverURL = (product: ProductLike, fallback: string) => productImageURLs(product)[0] || fallback
