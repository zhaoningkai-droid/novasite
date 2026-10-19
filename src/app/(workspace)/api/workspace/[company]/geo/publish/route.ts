import { handleGeoPublishing } from '@/platform/geo/publish-api'
export const runtime='nodejs'
export const maxDuration=60
type Context={params:Promise<{company:string}>}
export async function GET(request:Request,{params}:Context){return handleGeoPublishing(request,(await params).company)}
export async function POST(request:Request,{params}:Context){return handleGeoPublishing(request,(await params).company)}
