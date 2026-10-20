import { WorkspaceAnalytics } from '@/platform/components/WorkspaceAnalytics/WorkspaceAnalytics'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
import { userHasRole } from '@/access/roles'
import { analyticsWindow, parseAnalyticsRange, summarizeLeads, type LeadAnalytics, type LeadSample } from '@/platform/components/WorkspaceAnalytics/analytics-data'
import { readGa4Traffic } from '@/platform/analytics/ga4-reports.server'
import { readGa4Realtime } from '@/platform/analytics/ga4-realtime.server'
import { ga4Unavailable } from '@/platform/analytics/ga4-types'

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
  const readTraffic = async () => {
    try {
      const site = await payload.findByID({ collection: 'tenants', id: company.id, depth: 0, overrideAccess: false, user,
        select: { slug: true, status: true, primaryDomain: true, seo: true } })
      const [traffic, realtime] = await Promise.all([
        readGa4Traffic(site, range, now), readGa4Realtime(site),
      ])
      return { traffic, realtime }
    } catch { return {
      traffic: ga4Unavailable('unavailable', '访问统计暂时无法读取，请稍后刷新。'),
      realtime: { status: 'unavailable' as const, views: null, users: null },
    } }
  }
  const [products, news, cases, blog, leads, { traffic, realtime }] = await Promise.all([
    payload.find({ collection: 'products', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'news', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'cases', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'posts', draft: true, limit: 1, locale: 'zh', overrideAccess: false, user, where: { tenant: { equals: company.id } } }),
    readLeadStats(),
    readTraffic(),
  ])
  return <WorkspaceAnalytics company={company} counts={{ blog: blog.totalDocs, cases: cases.totalDocs, news: news.totalDocs, products: products.totalDocs }} range={range} leads={leads} traffic={traffic} realtime={realtime} refreshedAt={now.toISOString()} />
}
