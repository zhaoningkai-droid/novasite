import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import '@/app/(frontend)/globals.css'
import './executive-demo.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string; lang: string }>
}): Promise<Metadata> {
  const { key } = await params
  const title =
    key === 'power-705-v1'
      ? '配电柜 · 工业'
      : key === 'autoparts-571-v1'
        ? '紧固件 · 标准件'
        : '商务工业 · 专业｜古建'
  return {
    title: `${title}｜模板演示`,
    description: '独立站模板效果预览。品牌、产品、图片和资料仅作演示，不导入客户站。',
    robots: { index: false, follow: false },
  }
}

export default async function TemplateDemoLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <html
      lang={lang === 'zh' ? 'zh-CN' : lang}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      data-theme="light"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
