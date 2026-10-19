import { redirect } from 'next/navigation'
import { geoKeywordPath } from '@/platform/geo/navigation'

export default async function GeoPage({ params }: {
  params: Promise<{ company: string }>
}) {
  redirect(geoKeywordPath((await params).company))
}
