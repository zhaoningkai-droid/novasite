import { handleGeoMaterials } from '@/platform/geo/material-api'
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoMaterials(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoMaterials(request, (await params).company)
}
