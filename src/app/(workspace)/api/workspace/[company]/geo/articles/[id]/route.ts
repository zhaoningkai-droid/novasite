import { handleGeoArticles } from '@/platform/geo/article-api'
export const runtime = 'nodejs'
export const maxDuration = 60
type Context = { params: Promise<{ company: string; id: string }> }
export async function GET(request: Request, { params }: Context) { const { company,id } = await params; return handleGeoArticles(request, company, id) }
export async function PATCH(request: Request, { params }: Context) { const { company,id } = await params; return handleGeoArticles(request, company, id) }
