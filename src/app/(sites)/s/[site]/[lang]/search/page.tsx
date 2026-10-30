import { AllyCustomerUtilityPage } from '@/platform/allynav-template'

export default function Page({ params }: { params: Promise<{ site: string; lang: string }> }) {
  return <AllyCustomerUtilityPage params={params} section="search" />
}
