import { handleGeoPlans } from '@/platform/geo/plan-api'
export const runtime = 'nodejs'
export const maxDuration = 60
type Context = { params: Promise<{ company: string }> }
export async function GET(request: Request, { params }: Context) { const { company } = await params; return handleGeoPlans(request, company) }
export async function POST(request: Request, { params }: Context) { const { company } = await params; return handleGeoPlans(request, company) }
export async function DELETE(request: Request, { params }: Context) { const { company } = await params; return handleGeoPlans(request, company) }
