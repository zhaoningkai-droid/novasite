import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import '../../../../../(frontend)/globals.css'
import '@/platform/new-templates/templates.css'
import '@/app/(sites)/s/[site]/[lang]/site.css'
import '@/app/(sites)/s/[site]/[lang]/atelier.css'
export const metadata: Metadata = { title: '模板预览', robots: { index: false, follow: false } }
export default async function PreviewLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <html lang={lang} data-theme="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
