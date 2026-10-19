import { handleGeoTasks } from '@/platform/geo/task-api'
export const runtime = 'nodejs'
export const maxDuration = 60
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) {
  return handleGeoTasks(request, (await params).company)
}
export async function POST(request: Request, { params }: Context) {
  return handleGeoTasks(request, (await params).company)
}
export async function DELETE(request: Request, { params }: Context) {
  return handleGeoTasks(request, (await params).company)
}
