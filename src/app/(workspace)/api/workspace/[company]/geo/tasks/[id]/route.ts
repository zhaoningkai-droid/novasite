import { handleGeoTasks } from '@/platform/geo/task-api'
type Context = { params: Promise<{ company: string; id: string }> }
export async function GET(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoTasks(request, company, id)
}
export async function PATCH(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoTasks(request, company, id)
}
export async function POST(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoTasks(request, company, id)
}
export async function DELETE(request: Request, { params }: Context) {
  const { company, id } = await params
  return handleGeoTasks(request, company, id)
}
