'use client'

import type { DefaultCellComponentProps } from 'payload'
import type { MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

export function EnterWorkspaceCell({ rowData }: DefaultCellComponentProps) {
  const router = useRouter()
  const { setTenant } = useTenantSelection()

  const enterWorkspace = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const tenantID = typeof rowData.id === 'number' ? rowData.id : Number(rowData.id)
    const companySlug = typeof rowData.slug === 'string' ? rowData.slug : ''
    if (!Number.isInteger(tenantID) || !companySlug) return

    document.cookie = `payload-tenant=${encodeURIComponent(String(tenantID))}; Max-Age=31536000; Path=/; SameSite=Lax`
    setTenant({ id: tenantID, refresh: false })
    router.push(`/workspace/${companySlug}/website/analytics`)
  }

  return <button className="workspace-enter-button" onClick={enterWorkspace} type="button">进入工作台</button>
}
