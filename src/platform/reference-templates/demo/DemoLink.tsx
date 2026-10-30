'use client'
import NextLink from 'next/link'
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
const DemoBase = createContext({ base: '', aliases: false })
export function DemoLinks({
  base,
  children,
  aliases = false,
}: {
  base: string
  children: ReactNode
  aliases?: boolean
}) {
  return <DemoBase.Provider value={{ base, aliases }}>{children}</DemoBase.Provider>
}
function hrefFor({ base, aliases }: { base: string; aliases: boolean }, href: unknown) {
  if (
    typeof href === 'string' &&
    (href === base ||
      href.startsWith(base + '/') ||
      href.startsWith(base + '?') ||
      href.startsWith('/s/'))
  )
    return href
  if (aliases && typeof href === 'string')
    href = href.replace(
      /^\/(product|article|case|faq)(?=\/|$)/,
      (_, part) =>
        '/' +
        { product: 'products', article: 'news', case: 'cases', faq: 'faqs' }[part as 'product'],
    )
  if (
    typeof href !== 'string' ||
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.startsWith('/sites/') ||
    href.startsWith('/template-demo/')
  )
    return href
  return base + (href === '/' ? '' : href)
}
export function DemoAnchor(props: ComponentProps<'a'>) {
  const base = useContext(DemoBase)
  return <a {...props} href={hrefFor(base, props.href) as string | undefined} />
}
export default function DemoLink(props: ComponentProps<typeof NextLink>) {
  const base = useContext(DemoBase)
  return <NextLink {...props} href={hrefFor(base, props.href) as typeof props.href} />
}
export function demoHTML(html: string, code: string) {
  const key = code === 'k607' ? 'plush-607-v1' : 'plush-712-v1'
  return html.replace(
    /(href\s*=\s*["'])(\/(?!\/|sites\/|template-demo\/)[^"']*)/gi,
    (_, prefix, p) => prefix + `/template-demo/${key}/zh` + (p === '/' ? '' : p),
  )
}
