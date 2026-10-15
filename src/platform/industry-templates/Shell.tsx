import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { templateCopy } from '@/platform/new-templates/copy'
import type { SiteLocale } from '@/platform/site-locales'
import { IndustryHeader, QuoteDialog } from './controls'
import { IndustryForm, Contact } from './Page'
import type { IndustryKey, IndustryLink, IndustryPageModel } from './model'
import './industry.css'

export function IndustryShell({
  templateKey,
  company,
  tagline,
  headerText,
  logo,
  base,
  locale,
  languages,
  links,
  footerIntro,
  children,
  model,
  quickLinks,
}: {
  templateKey: IndustryKey
  company: string
  headerText?: string
  tagline?: string | null
  logo?: string
  base: string
  locale: SiteLocale
  languages: SiteLocale[]
  links: IndustryLink[]
  footerIntro?: string | null
  children: ReactNode
  model: IndustryPageModel
  quickLinks?: IndustryLink[]
}) {
  const t = templateCopy(locale)
  return (
    <div
      className={`it-shell nt-shell ${templateKey === 'power-705-v1' ? 'it-power' : 'it-fastener'}`}
      data-template={templateKey}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <a className="it-skip" href="#it-main">
        {t.skip}
      </a>
      {model.demo ? (
        <aside className="it-demo-notice">
          {locale === 'zh'
            ? '模板效果演示 · 品牌、产品、图片和资料仅作示例，选用模板不会导入这些内容。'
            : 'Template demonstration · Sample content and images are not imported into customer sites.'}
        </aside>
      ) : model.preview ? (
        <aside className="it-demo-notice">{t.preview}</aside>
      ) : null}
      <Suspense fallback={<div className="it-header-fallback it-wrap">{company}</div>}>
        <IndustryHeader
          company={company}
          headerText={headerText}
          tagline={tagline}
          logo={logo}
          base={base}
          locale={locale}
          languages={languages}
          links={links}
          quote={
            <QuoteDialog locale={locale}>
              <IndustryForm model={model} />
            </QuoteDialog>
          }
        />
      </Suspense>
      {children}
      <footer className="it-footer">
        <div className="it-wrap it-footer-grid">
          <div>
            <strong className="it-footer-brand">{company}</strong>
            {footerIntro || tagline ? <p>{footerIntro || tagline}</p> : null}
            <Contact model={model} />
          </div>
          <nav aria-label={t.links}>
            <h2>{t.links}</h2>
            {(quickLinks?.length ? quickLinks : links).map((item, i) => (
              <Link href={item.href} key={i}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div>
            <h2>{t.products}</h2>
            {links
              .find((item) => item.href.endsWith('/products'))
              ?.children?.slice(0, 6)
              .map((item, i) => (
                <Link href={item.href} key={i}>
                  {item.label}
                </Link>
              ))}
          </div>
          <div>
            <h2>{t.quote}</h2>
            <QuoteDialog locale={locale}>
              <IndustryForm model={model} />
            </QuoteDialog>
          </div>
        </div>
        <div className="it-wrap it-copyright">
          <span>
            © {new Date().getFullYear()} {company}
          </span>
          <span>{model.demo ? 'DEMONSTRATION' : ''}</span>
        </div>
      </footer>
    </div>
  )
}
