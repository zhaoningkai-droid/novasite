import { handleGeoVisibility } from '@/platform/geo/visibility-api'
export const runtime = 'nodejs'
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoVisibility(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoVisibility(request, (await params).company)
}
