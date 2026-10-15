import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import Image from 'next/image'
import { notFound } from 'next/navigation'

import { copy, getSite, isSiteLocale } from '@/platform/site'
import { ExecutiveTenantAbout } from '@/platform/legacy-templates/ExecutiveTenantPages'

type Props = { params: Promise<{ lang: string; site: string }> }

export default async function AboutPage({ params }: Props) {
  const { lang, site: slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(slug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['about'])
  if (newPage) return newPage

  const about = site.fixedPages?.about
  const t = copy[lang]
  const modules = [...(about?.modules || [])].sort(
    (left, right) => (left.sortOrder || 0) - (right.sortOrder || 0),
  )
  const selectedTemplateKey =
    site.selectedTemplate && typeof site.selectedTemplate === 'object'
      ? site.selectedTemplate.key
      : ''
  if (selectedTemplateKey === 'executive-industrial-pro-v1') {
    return (
      <ExecutiveTenantAbout
        heroImage={site.branding.heroImageURL}
        locale={lang}
        siteSlug={slug}
        title={about?.title || t.about}
        intro={about?.intro}
        modules={modules.map((item, index) => ({
          id: item.id || index,
          title: item.title,
          description: item.description,
          image: typeof item.image === 'object' && item.image?.url ? item.image.url : null,
        }))}
      />
    )
  }
  return (
    <main>
      <section className="site-page-hero">
        <div className="site-wrap">
          <span className="site-eyebrow">{t.about}</span>
          <h1>{about?.title || t.about}</h1>
          <p>{about?.intro}</p>
        </div>
      </section>
      {modules.length ? (
        <section className="site-section">
          <div className="site-wrap site-grid" data-site-about-modules>
            {modules.map((item, index) => (
              <article className="site-card" key={item.id || index}>
                {typeof item.image === 'object' && item.image?.url ? (
                  <Image
                    alt={item.image.alt || item.title}
                    className="site-editorial-media"
                    height={800}
                    sizes="(max-width: 700px) 92vw, 50vw"
                    src={item.image.url}
                    unoptimized
                    width={1200}
                  />
                ) : null}
                <div className="site-card__body">
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
