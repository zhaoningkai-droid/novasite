import { handleGeoMaterialUpload } from '@/platform/geo/material-upload-api'

type Context = { params: Promise<{ company: string; id: string }> }

export async function POST(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoMaterialUpload(request, company, id)
}
