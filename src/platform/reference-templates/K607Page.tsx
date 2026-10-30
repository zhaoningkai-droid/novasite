import { K607PageProvider } from './demo/k607/TemplateData'
import { HomePage } from './demo/k607/HomePage'
import { SiteFrame } from './demo/k607/SiteFrame'
import { PageChrome } from './demo/k607/PageChrome'
import { ProductPage } from './demo/k607/ProductPages'
import { EditorialPage } from './demo/k607/EditorialPages'
import { CorporatePage } from './demo/k607/CorporatePages'
import type { IndustryPageModel } from '@/platform/industry-templates/model'
import { IndustryStructuredData } from '@/platform/industry-templates/StructuredData'
import './demo/k607/base.css'
import './demo/k607/customer-data.css'
export function K607Page({ model: m }: { model: IndustryPageModel }) {
  const path =
    m.kind === 'about'
      ? '/about/'
      : m.kind === 'contact'
        ? '/contact/'
        : m.kind === 'faqs'
          ? '/faq/'
          : `/${m.section === 'products' ? 'product' : m.section === 'cases' ? 'case' : 'article'}/${m.kind === 'product' || m.kind === 'article' ? 'detail.html' : ''}`
  return (
    <K607PageProvider value={m}>
      <IndustryStructuredData model={m} />
      {m.kind === 'home' ? (
        <HomePage />
      ) : (
        <SiteFrame>
          {['about', 'contact', 'faqs'].includes(m.kind) ? (
            <CorporatePage path={path} />
          ) : (
            <>
              <PageChrome path={path} />
              {m.section === 'products' ? (
                <ProductPage path={path} />
              ) : (
                <EditorialPage path={path} />
              )}
            </>
          )}
        </SiteFrame>
      )}
    </K607PageProvider>
  )
}
