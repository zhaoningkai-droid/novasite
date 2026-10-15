import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ExecutiveTenantHome } from '@/platform/legacy-templates/ExecutiveTenantHome'
import type { ExecutiveTenantHomeData } from '@/platform/legacy-templates/executive-home-model'

const emptyTenantHome = (): ExecutiveTenantHomeData => ({
  about: { background: '', buttonLabel: '', overlay: 0.62, text: '', title: '' },
  advantages: [], banners: [], cases: [], categories: [], certificates: [], companyName: '租户示例公司',
  contact: { address: '', email: '', phone: '', qrCode: '', whatsapp: '' }, faq: [], faqTitle: '', footerBackground: '', footerOverlay: 0.65,
  locale: 'zh', news: [], products: [], settings: {}, siteSlug: 'tenant-example', strengthGallery: [], strengthItems: [], videoPoster: '', videoSource: '',
  showCases: true, showFAQ: false, showInquiry: false, showNews: true, showProducts: true, showStrength: true,
  inquiry: { description: '', requiredFields: {}, title: '' },
})

describe('executive tenant homepage isolation', () => {
  it('keeps a tenant with no configured business content empty', () => {
    const html = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data: emptyTenantHome() }))

    expect(html).toContain('租户示例公司')
    expect(html).toContain('网站内容准备中')
    expect(html).not.toContain('匠境古建')
    expect(html).not.toContain('青瓦筒瓦')
    expect(html).not.toContain('images.pexels.com')
  })

  it('renders tenant content only when it is passed by the tenant adapter', () => {
    const data = emptyTenantHome()
    data.products = [{ href: '/s/tenant-example/zh/products/roof-tile', image: '/media/tenant-roof-tile.jpg', title: '租户自有瓦件' }]
    data.settings.productsTitle = '租户产品中心'

    const html = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data }))

    expect(html).toContain('租户自有瓦件')
    expect(html).toContain('租户产品中心')
    expect(html).not.toContain('青瓦筒瓦')
    expect(html).toContain('href="/s/tenant-example/zh/contact"')
  })

  it('keeps the empty state when all existing business modules are disabled', () => {
    const data = emptyTenantHome()
    data.cases = [{ href: '/s/tenant-example/zh/cases/project', title: '隐藏的案例' }]
    data.news = [{ href: '/s/tenant-example/zh/news/article', title: '隐藏的新闻' }]
    data.products = [{ href: '/s/tenant-example/zh/products/item', title: '隐藏的产品' }]
    data.strengthItems = [{ title: '隐藏的实力数据', value: '20', unit: '年', href: '#strength' }]
    data.showCases = false
    data.showNews = false
    data.showProducts = false
    data.showStrength = false

    const html = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data }))

    expect(html).toContain('网站内容准备中')
    expect(html).not.toContain('隐藏的案例')
    expect(html).not.toContain('隐藏的新闻')
    expect(html).not.toContain('隐藏的产品')
    expect(html).not.toContain('隐藏的实力数据')
  })

  it('honors safe tenant banner destinations without allowing protocol-relative links', () => {
    const data = emptyTenantHome()
    data.banners = [{ desktopImage: '/media/hero.jpg', linkType: 'internal', linkURL: '/products/roof-tile', title: '租户首屏' }]

    const internalHTML = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data }))

    expect(internalHTML).toContain('href="/s/tenant-example/zh/products/roof-tile"')
    expect(internalHTML).toContain('了解详情')

    data.banners = [{ desktopImage: '/media/hero.jpg', linkType: 'internal', linkURL: '//outside.example/path', title: '租户首屏' }]
    const unsafeHTML = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data }))

    expect(unsafeHTML).not.toContain('outside.example')
  })

  it('opens configured HTTPS banner links in a safe new tab', () => {
    const data = emptyTenantHome()
    data.banners = [{ desktopImage: '/media/hero.jpg', linkType: 'external', linkURL: 'https://example.com/project', title: '租户首屏' }]

    const html = renderToStaticMarkup(createElement(ExecutiveTenantHome, { data }))

    expect(html).toContain('href="https://example.com/project"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
