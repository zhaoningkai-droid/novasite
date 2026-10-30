import { handleGeoDetection } from '@/platform/geo/detection-api'

export const runtime = 'nodejs'
type Context = { params: Promise<{ company: string; artifactID: string }> }
export async function GET(request: Request, { params }: Context) {
  const { company, artifactID } = await params
  return handleGeoDetection(request, company, artifactID)
}
