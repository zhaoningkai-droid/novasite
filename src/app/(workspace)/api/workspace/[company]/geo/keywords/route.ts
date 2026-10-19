import { handleGeoKeywords } from '@/platform/geo/keyword-api'
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoKeywords(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoKeywords(request, (await params).company)
}
