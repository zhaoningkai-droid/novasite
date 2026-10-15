import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ProductWorkspaceEditor } from '@/platform/components/ProductWorkspaceEditor/ProductWorkspaceEditor'
import { richTextToHTML } from '@/platform/rich-text'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function EditWorkspaceProductPage({ params }: { params: Promise<{ company: string; productID: string }> }) {
  const { company: slug, productID: rawID } = await params; const id = Number(rawID); if (!Number.isInteger(id)) notFound()
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company) notFound()
  const payload = await getPayload({ config }); const [products, categories] = await Promise.all([payload.find({ collection: 'products', depth: 1, draft: true, fallbackLocale: 'none', limit: 1, locale: company.defaultLocale, overrideAccess: false, user, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } }), payload.find({ collection: 'product-categories', depth: 0, fallbackLocale: 'none', pagination: false, locale: company.defaultLocale, overrideAccess: false, sort: 'sortOrder', user, where: { tenant: { equals: company.id } } })])
  const product = products.docs[0]; if (!product) notFound()
  const gallery = Array.isArray(product.gallery) ? product.gallery.filter((item): item is Exclude<typeof item, number> => typeof item === 'object' && item !== null) : []
  const category = typeof product.category === 'object' && product.category ? product.category.id : product.category
  const tags = Array.isArray(product.tags) ? product.tags.flatMap((tag) => typeof tag?.label === 'string' ? [tag.label] : []) : []
  const datasheet = typeof product.datasheet === 'object' && product.datasheet
    ? { id: product.datasheet.id, filename: product.datasheet.filename,
      filesize: product.datasheet.filesize, mimeType: product.datasheet.mimeType, url: product.datasheet.url }
    : typeof product.datasheet === 'number' ? { id: product.datasheet } : null
  return <ProductWorkspaceEditor categories={categories.docs.map((item) => ({ id: item.id, name: item.name || '未命名分类' }))} companySlug={slug} sourceLocale={company.defaultLocale} initial={{ category: typeof category === 'number' ? category : undefined, datasheet, detailHTML: product.detailHTML || richTextToHTML(product.description), gallery, id: product.id, keywords: product.keywords || '', sortOrder: product.sortOrder || 0, status: product._status === 'published' ? 'published' : 'draft', summary: typeof product.summary === 'string' ? product.summary : '', tags, title: typeof product.title === 'string' ? product.title : '' }} />
}
