import { handleGeoPublishing } from '@/platform/geo/publish-api'
type Context={params:Promise<{company:string;id:string}>}
export async function GET(request:Request,{params}:Context){const {company,id}=await params;return handleGeoPublishing(request,company,id)}
