import { K712PageProvider } from './demo/k712/TemplateData'
import { HomePage } from './demo/k712/HomePage'
import { SiteFrame } from './demo/k712/SiteFrame'
import { InnerPage } from './demo/k712/InnerPages'
import { IndustryStructuredData } from '@/platform/industry-templates/StructuredData'
import type { IndustryPageModel } from '@/platform/industry-templates/model'
import './demo/k712/base.css'
import './demo/k712/inner.css'
import './demo/k712/customer-data.css'
export function K712Page({ model: m }: { model: IndustryPageModel }) {
  const path =
    m.kind === 'about'
      ? '/about/'
      : m.kind === 'contact'
        ? '/contact/'
        : m.kind === 'faqs'
          ? '/faq/'
          : `/${m.section === 'products' ? 'product' : m.section === 'cases' ? 'case' : 'article'}/${m.kind === 'product' || m.kind === 'article' ? 'detail.html' : ''}`
  return (
    <K712PageProvider value={m}>
      <IndustryStructuredData model={m} />
      <SiteFrame home={m.kind === 'home'}>
        <main id="main">{m.kind === 'home' ? <HomePage /> : <InnerPage path={path} />}</main>
      </SiteFrame>
    </K712PageProvider>
  )
}
