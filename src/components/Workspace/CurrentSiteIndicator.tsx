'use client'

import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import './workspace.scss'

export function CurrentSiteIndicator() {
  const { options, selectedTenantID } = useTenantSelection()
  const currentSite = options.find((option) => option.value === selectedTenantID)?.label
  const currentSiteName = typeof currentSite === 'string' ? currentSite : currentSite ? Object.values(currentSite)[0] : undefined

  return (
    <div className="workspace-current-site" data-current-site={currentSiteName || ''}>
      <span>当前工作站点</span>
      <strong>{currentSiteName || '请先选择客户站点'}</strong>
    </div>
  )
}
