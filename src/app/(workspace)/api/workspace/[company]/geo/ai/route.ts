import { handleGeoAI } from '@/platform/geo/ai-api'
export const runtime = 'nodejs'
export const maxDuration = 60
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoAI(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoAI(request, (await params).company)
}
