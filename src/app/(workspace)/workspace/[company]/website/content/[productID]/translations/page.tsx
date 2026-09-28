import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { WorkspaceTranslations, type TranslationLocale } from '@/platform/components/WorkspaceTranslations/WorkspaceTranslations'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Props = { params: Promise<{ company: string; productID: string }> }
const localeDefinitions: Array<Pick<TranslationLocale, 'code' | 'label'>> = [{ code: 'zh', label: '简体中文' }, { code: 'en', label: '英语' }, { code: 'ru', label: '俄语' }, { code: 'id', label: '印尼语' }]

export default async function ProductTranslationsPage({ params }: Props) {
  const { company: slug, productID: rawProductID } = await params
  const productID = Number(rawProductID)
  if (!Number.isInteger(productID) || productID < 1) notFound()
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  const payload = await getPayload({ config })
  const docs = await Promise.all(localeDefinitions.map((locale) => payload.find({ collection: 'products', depth: 0, fallbackLocale: false, limit: 1, locale: locale.code, overrideAccess: false, user, where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] } })))
  if (!docs[0].docs[0]) notFound()
  const locales = docs.map((result, index) => {
    const product = result.docs[0]
    const title = typeof product?.title === 'string' ? product.title : ''
    const summary = typeof product?.summary === 'string' ? product.summary : ''
    return { ...localeDefinitions[index], complete: Boolean(title.trim() && summary.trim()), summary, title }
  })
  return <WorkspaceTranslations locales={locales} returnHref={`/workspace/${slug}/website/content`} saveURL={`/api/workspace/${slug}/products/${productID}/translations`} />
}
