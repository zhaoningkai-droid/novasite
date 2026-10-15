import { getPayload, type Where } from 'payload'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import { getMeUser } from '@/utilities/getMeUser'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { inquiryReaderRoles } from '@/platform/inquiry/inbox-service'
import { isInquiryStatus, type InquiryRow } from '@/platform/inquiry/inbox-model'
import { WorkspaceInquiryInbox } from '@/platform/components/WorkspaceInquiryInbox/WorkspaceInquiryInbox'
import { listQueryPage, listQueryText } from '@/platform/components/WorkspaceTable/ContentListPrimitives'

export const metadata: Metadata = {
  title: '询盘收件箱', robots: { index: false, follow: false },
}
type Query = { q?: string | string[]; status?: string | string[]; page?: string | string[] }
const pageSize = 10
export default async function InquiryInboxPage({ params, searchParams }: {
  params: Promise<{ company: string }>; searchParams: Promise<Query>
}) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/login' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  if (!userHasRole(user, [...inquiryReaderRoles])) {
    return <section><h1>询盘收件箱</h1><p>当前账号没有查看询盘的权限。</p></section>
  }
  const query = await searchParams
  const keyword = listQueryText(query.q).slice(0, 120)
  const rawStatus = listQueryText(query.status)
  const status = isInquiryStatus(rawStatus) ? rawStatus : ''
  const page = listQueryPage(query.page)
  const where: Where[] = [{ tenant: { equals: company.id } }]
  if (status) where.push({ status: { equals: status } })
  if (keyword) where.push({ or: ['name', 'email', 'phone', 'company', 'country', 'message']
    .map((field) => ({ [field]: { contains: keyword } })) })
  const payload = await getPayload({ config })
  let rows: InquiryRow[] = []
  let totalDocs: number | null = null
  let totalPages = 1
  let loadError = false
  try {
    const result = await payload.find({
      collection: 'leads', depth: 0, limit: pageSize, page, sort: '-createdAt',
      overrideAccess: false, user, where: { and: where },
      select: { name: true, email: true, phone: true, company: true, country: true,
        status: true, message: true, createdAt: true, updatedAt: true },
    })
    totalDocs = result.totalDocs
    totalPages = Math.max(1, result.totalPages)
    rows = result.docs.map((lead) => ({
      id: lead.id, name: lead.name, email: lead.email, phone: lead.phone,
      company: lead.company, country: lead.country, status: lead.status,
      createdAt: lead.createdAt, updatedAt: lead.updatedAt,
      summary: lead.message.slice(0, 140),
    }))
  } catch {
    loadError = true
    payload.logger.error('Workspace inquiry inbox unavailable; no visitor data logged.')
  }
  if (!loadError && page > totalPages) {
    const parameters = new URLSearchParams({ page: String(totalPages) })
    if (keyword) parameters.set('q', keyword)
    if (status) parameters.set('status', status)
    redirect(`/workspace/${slug}/website/inquiries?${parameters}`)
  }
  return <WorkspaceInquiryInbox companySlug={slug} companyName={company.name} rows={rows}
    keyword={keyword} status={status} page={page} totalDocs={totalDocs}
    totalPages={totalPages} loadError={loadError}
    canRetryNotification={userHasRole(user, ['super-admin', 'site-admin'])} />
}
