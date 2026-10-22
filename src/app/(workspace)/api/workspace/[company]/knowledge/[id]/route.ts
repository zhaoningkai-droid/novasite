import { handleKnowledge } from '@/platform/knowledge/api'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function GET(
  request: Request,
  { params }: { params: Promise<{ company: string; id: string }> },
) {
  const { company, id } = await params
  return handleKnowledge(request, company, id)
}
export const PATCH = GET
