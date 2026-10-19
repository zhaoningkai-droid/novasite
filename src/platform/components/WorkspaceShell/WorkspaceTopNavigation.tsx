'use client'

import { Layers3, LogOut, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { geoKeywordPath, isGeoWorkspace } from '@/platform/geo/navigation'
import { WorkspaceTranslationAssistant } from './WorkspaceTranslationAssistant'

export function WorkspaceTopNavigation({ companySlug, canUseGeo = false }: {
  companySlug?: string; canUseGeo?: boolean
} = {}) {
  const router = useRouter()
  const geoActive = isGeoWorkspace(usePathname())
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setError('')
    try {
      const response = await fetch('/api/users/logout', { method: 'POST' })
      if (!response.ok) throw new Error('退出登录失败，请重试。')
      router.replace('/login')
      router.refresh()
    } catch {
      setError('暂时无法退出，请检查网络后重试。')
      setSigningOut(false)
    }
  }

  return <>
    <nav aria-label="平台主导航" className="workspace-top-navigation">
      {companySlug ? <>
        <Link aria-current={!geoActive ? 'page' : undefined}
          className={`workspace-top-navigation__item ${!geoActive ? 'is-active' : ''}`}
          href={`/workspace/${companySlug}/website/analytics`}>
          <Layers3 size={16} aria-hidden="true" />独立站
        </Link>
        {canUseGeo && <Link aria-current={geoActive ? 'page' : undefined}
          className={`workspace-top-navigation__item ${geoActive ? 'is-active' : ''}`}
          href={geoKeywordPath(companySlug)}>GEO优化</Link>}
      </> : <span aria-current="page" className="workspace-top-navigation__item is-active">
        <Layers3 size={16} aria-hidden="true" />独立站</span>}
    </nav>
    <div className="workspace-top-navigation__utilities">
      {error && <span className="workspace-top-navigation__logout-error" role="alert">{error}</span>}
      {companySlug && !geoActive && <WorkspaceTranslationAssistant companySlug={companySlug} />}
      <button aria-label="退出登录" className="workspace-top-navigation__logout"
        disabled={signingOut} onClick={() => void signOut()} type="button">
        {signingOut ? <LoaderCircle className="workspace-top-navigation__spinner" size={16} aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
        <span>{signingOut ? '正在退出…' : '退出'}</span>
      </button>
    </div>
  </>
}
