import { handleGeoSources } from '@/platform/geo/source-api'
type Context = { params: Promise<{ company: string; id: string }> }
export async function GET(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoSources(request, company, id)
}
export async function POST(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoSources(request, company, id)
}
