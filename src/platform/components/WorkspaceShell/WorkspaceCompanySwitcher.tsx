'use client'

import { Building2, Check, ChevronDown, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'

type Props = { companies: WorkspaceCompany[]; currentCompany: WorkspaceCompany }
const setSelectedCompanyCookie = (companyID: number) => {
  document.cookie = `payload-tenant=${companyID}; Max-Age=31536000; Path=/; SameSite=Lax`
}

export function WorkspaceCompanySwitcher({ companies, currentCompany }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => { setSelectedCompanyCookie(currentCompany.id) }, [currentCompany.id])
  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keydown)
    }
  }, [open])

  const changeCompany = (company: WorkspaceCompany) => {
    if (company.id === currentCompany.id) { setOpen(false); return }
    if (document.documentElement.dataset.workspaceBusy === 'true') {
      setNotice('正在保存或上传，请完成后再切换公司。'); return
    }
    if (document.documentElement.dataset.workspaceUnsaved === 'true' && !window.confirm(
      `“${currentCompany.name}”有未保存的修改。切换公司会放弃这些修改，是否继续？`,
    )) return
    window.dispatchEvent(new CustomEvent('workspace-company-changing', {
      detail: { from: currentCompany.id, to: company.id },
    }))
    sessionStorage.removeItem('novasite-workspace-ui-state')
    setSelectedCompanyCookie(company.id)
    router.push(`/workspace/${company.slug}/website/analytics`)
  }
  const visible = companies.filter((company) =>
    `${company.name} ${company.slug}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return <div className="workspace-company-switcher" ref={root}>
    <button aria-expanded={open} aria-controls="workspace-company-list"
      className="workspace-company-switcher__trigger" ref={trigger}
      onClick={() => { setOpen((value) => !value); setNotice('') }} type="button">
      <span className="workspace-company-switcher__avatar" aria-hidden="true"><Building2 size={17} /></span>
      <span className="workspace-company-switcher__label"><small>当前公司</small>
        <strong>{currentCompany.name}</strong></span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <section aria-label="切换公司列表" className="workspace-company-switcher__menu"
      id="workspace-company-list">
      <header><strong>切换工作公司</strong><span>{companies.length} 家</span></header>
      <label className="workspace-company-switcher__search"><Search size={16} aria-hidden="true" />
        <input aria-label="搜索工作公司" placeholder="搜索公司名称" ref={search} type="search"
          value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="workspace-company-switcher__list">
        {visible.map((company) => <button aria-current={company.id === currentCompany.id ? 'true' : undefined}
          className="workspace-company-switcher__item" key={company.id}
          onClick={() => changeCompany(company)} type="button">
          <span><strong>{company.name}</strong><small>{company.slug}</small></span>
          {company.id === currentCompany.id && <Check size={17} aria-label="当前公司" />}
        </button>)}
        {!visible.length && <p>没有找到匹配公司</p>}
      </div>
      {notice && <p role="status">{notice}</p>}
      <Link href="/workspace/companies">管理全部公司</Link>
    </section>}
  </div>
}
