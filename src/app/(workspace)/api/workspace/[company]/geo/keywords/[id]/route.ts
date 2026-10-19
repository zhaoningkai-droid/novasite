import { handleGeoKeywords } from '@/platform/geo/keyword-api'
type Context = { params: Promise<{ company: string; id: string }> }
export async function GET(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoKeywords(request, company, id)
}
export async function PATCH(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoKeywords(request, company, id)
}
