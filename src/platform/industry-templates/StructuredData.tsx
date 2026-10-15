import type { IndustryPageModel } from './model'

// Describes visible customer content only. Demonstrations and previews never publish schema.
export function industryStructuredData(model: IndustryPageModel) {
  if (model.demo || model.preview) return null
  if (model.kind === 'product')
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: model.title,
      ...(model.summary ? { description: model.summary } : {}),
      ...(model.model ? { sku: model.model } : {}),
      ...(model.images?.length ? { image: model.images } : {}),
      brand: { '@type': 'Brand', name: model.company },
    }
  if (model.kind === 'faqs') {
    const items = (model.faqs || []).filter((item) => item.question && item.answerText)
    if (!items.length) return null
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answerText },
      })),
    }
  }
  return null
}

export function IndustryStructuredData({ model }: { model: IndustryPageModel }) {
  const data = industryStructuredData(model)
  return data ? (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  ) : null
}
