import { handleKnowledge } from '@/platform/knowledge/api'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function GET(request: Request, { params }: { params: Promise<{ company: string }> }) {
  return handleKnowledge(request, (await params).company)
}
export const POST = GET
export const PUT = GET
