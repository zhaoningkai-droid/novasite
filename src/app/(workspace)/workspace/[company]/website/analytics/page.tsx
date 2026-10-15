import { WorkspaceAnalytics } from '@/platform/components/WorkspaceAnalytics/WorkspaceAnalytics'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
import { userHasRole } from '@/access/roles'
import { analyticsWindow, parseAnalyticsRange, summarizeLeads, type LeadAnalytics, type LeadSample } from '@/platform/components/WorkspaceAnalytics/analytics-data'

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ range?: string | string[] }> }

export default async function CompanyWorkspacePage({ params, searchParams }: Props) {
  const { company: slug } = await params
  const range = parseAnalyticsRange((await searchParams).range)
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)

  // The parent workspace layout already validates this path. Keep this guard for direct rendering safety.
  if (!company) return null
  const payload = await getPayload({ config })
  const now = new Date()
  const readLeadStats = async (): Promise<LeadAnalytics> => {
    if (!userHasRole(user, ['super-admin', 'site-admin', 'sales'])) {
      return { status: 'forbidden', count: null, daily: [], sources: [] }
    }
    const window = analyticsWindow(range, now)
    const samples: LeadSample[] = []
    try {
      let page = 1
      let hasNextPage = true
      while (hasNextPage) {
        const result = await payload.find({
          collection: 'leads', depth: 0, limit: 500, page, sort: 'id', overrideAccess: false, user,
          select: { createdAt: true, utmSource: true },
          where: { and: [
            { tenant: { equals: company.id } },
            { createdAt: { greater_than_equal: window.start, less_than_equal: window.end } },
          ] },
        })
        samples.push(...result.docs)
        hasNextPage = result.hasNextPage
        page += 1
      }
      return summarizeLeads(samples, range, now)
    } catch {
      payload.logger.error('Workspace inquiry analytics could not be loaded; content overview remains available.')
      return { status: 'unavailable', count: null, daily: [], sources: [] }
    }
  }
  const [products, news, cases, blog, leads] = await Promise.all([
    payload.find({ collection: 'products', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'news', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'cases', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'posts', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    readLeadStats(),
  ])
  return <WorkspaceAnalytics company={company} counts={{ blog: blog.totalDocs, cases: cases.totalDocs, news: news.totalDocs, products: products.totalDocs }} range={range} leads={leads} refreshedAt={now.toISOString()} />
}
