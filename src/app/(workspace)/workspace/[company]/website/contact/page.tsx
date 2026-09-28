import { getPayload } from 'payload'
import config from '@payload-config'
import { ContactEditor } from '@/platform/components/ContactEditor/ContactEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
import type { Media } from '@/payload-types'

const image = (value: number | Media | null | undefined) => ({
  id: typeof value === 'number' ? value : value?.id,
  url: typeof value === 'object' ? value?.url || '' : '',
})
export default async function ContactWorkspacePage({ params }: {
  params: Promise<{ company: string }>
}) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/login' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const tenant = await payload.findByID({ collection: 'tenants', id: company.id,
    depth: 1, locale: 'zh', overrideAccess: false, user })
  const contact = tenant.contact
  const page = tenant.fixedPages?.contactPage
  const whatsapp = image(contact?.whatsappQRCode)
  const wechat = image(contact?.wechatQRCode)
  const international = image(contact?.wechatInternationalQRCode)
  return <ContactEditor key={company.id} companySlug={slug} initial={{
    address: contact?.address || '', email: contact?.email || '', intro: page?.intro || '',
    phone: contact?.phone || '', showInquiryForm: page?.showInquiryForm !== false,
    title: page?.title || '', whatsapp: contact?.whatsapp || '',
    wechatQRCode: wechat.id, wechatQRCodeURL: wechat.url,
    whatsappQRCode: whatsapp.id, whatsappQRCodeURL: whatsapp.url,
    wechatInternationalQRCode: international.id, wechatInternationalQRCodeURL: international.url,
  }} />
}
