import { getPayload } from 'payload'
import config from '@payload-config'
import { FAQManager } from '@/platform/components/FAQManager/FAQManager'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
const plain = (value: any): string => !value || typeof value !== 'object' ? '' : Array.isArray(value) ? value.map(plain).join(' ') : `${typeof value.text === 'string' ? value.text : ''} ${plain(value.root)} ${plain(value.children)}`.trim()
export default async function FAQsWorkspacePage({ params }: { params: Promise<{ company: string }> }) { const { company: slug } = await params; const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company) return null; const payload = await getPayload({ config }); const result = await payload.find({ collection: 'faqs', depth: 0, locale: 'zh', fallbackLocale: false, limit: 100, sort: 'sortOrder', overrideAccess: false, user, where: { tenant: { equals: company.id } } }); return <FAQManager companySlug={slug} initial={result.docs.map((item) => ({ id: item.id, question: item.question, answer: plain(item.answer), enabled: item.enabled !== false, sortOrder: item.sortOrder || 0 }))}/> }
