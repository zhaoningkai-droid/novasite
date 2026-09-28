import { ImageIcon } from 'lucide-react'
import Image from 'next/image'

export const contentListPageSize = 10

export type ListQueryValue = string | string[] | undefined
export type ContentListSearchParams = {
  category?: ListQueryValue
  featured?: ListQueryValue
  keyword?: ListQueryValue
  page?: ListQueryValue
  q?: ListQueryValue
}

export const listQueryText = (value: ListQueryValue) =>
  (Array.isArray(value) ? value[0] || '' : value || '').trim()

export const listQueryPage = (value: ListQueryValue) => {
  const page = Number(listQueryText(value))
  return Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1
}

export const listQueryCategory = (value: ListQueryValue) => {
  const category = Number(listQueryText(value))
  return Number.isSafeInteger(category) && category > 0 && category <= 2_147_483_647 ? category : 0
}

export const contentListHref = (
  base: string,
  query: { category: number; featured?: boolean; keyword: string; searchKey?: 'q' | 'keyword' },
  page: number,
) => {
  const parameters = new URLSearchParams()
  if (query.keyword) parameters.set(query.searchKey || 'keyword', query.keyword)
  if (query.category) parameters.set('category', String(query.category))
  if (query.featured) parameters.set('featured', '1')
  parameters.set('page', String(page))
  return `${base}?${parameters.toString()}`
}

export const contentMediaURL = (value: unknown): string =>
  typeof value === 'object' && value && 'url' in value && typeof value.url === 'string'
    ? value.url
    : ''

export const contentUpdatedAt = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function ContentListItem({
  description,
  imageURL,
  title,
}: {
  description?: string | null
  imageURL: string
  title: string
}) {
  return (
    <div className="workspace-content-foundation__identity">
      {imageURL ? (
        <Image
          alt=""
          className="workspace-content-foundation__thumbnail"
          height={44}
          src={imageURL}
          unoptimized
          width={44}
        />
      ) : (
        <span aria-hidden="true" className="workspace-content-foundation__image-placeholder">
          <ImageIcon size={18} />
        </span>
      )}
      <span className="workspace-content-foundation__identity-copy">
        <strong title={title}>{title}</strong>
        <small title={description || '尚未填写摘要'}>{description || '尚未填写摘要'}</small>
      </span>
    </div>
  )
}

export function ContentStatus({ published }: { published: boolean }) {
  return (
    <span
      className={`workspace-content-foundation__status${published ? ' workspace-content-foundation__status--published' : ''}`}
    >
      <i aria-hidden="true" />
      {published ? '已发布' : '草稿'}
    </span>
  )
}

export function ContentFeaturedStatus({ featured }: { featured: boolean }) {
  return (
    <span className="workspace-content-foundation__static-featured">
      {featured ? '已推荐' : '未推荐'}
    </span>
  )
}

export function ContentUpdatedAt({ value }: { value: string }) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return <>—</>
  return (
    <time
      className="workspace-content-foundation__date"
      dateTime={value}
      title={contentUpdatedAt(value)}
    >
      <span>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short' }).format(date)}</span>
      <small>{new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' }).format(date)}</small>
    </time>
  )
}
