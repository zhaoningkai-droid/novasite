import { handleGeoDetection } from '@/platform/geo/detection-api'

export const runtime = 'nodejs'
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoDetection(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoDetection(request, (await params).company)
}
