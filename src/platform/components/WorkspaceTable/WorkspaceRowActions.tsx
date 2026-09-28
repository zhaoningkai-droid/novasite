'use client'

import { Eye, Languages, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

export function WorkspaceRowActions({
  disabled,
  editHref,
  label,
  onDelete,
  onDetails,
  translationHref,
}: {
  disabled: boolean
  editHref?: string
  label: string
  onDelete?: () => void
  onDetails: () => void
  translationHref?: string
}) {
  const menuID = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const useMenu = Boolean(translationHref && onDelete)

  useEffect(() => {
    const hide = () => menuRef.current?.hidePopover()
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  useEffect(() => {
    if (disabled) menuRef.current?.hidePopover()
  }, [disabled])

  const closeMenu = () => {
    menuRef.current?.hidePopover()
    triggerRef.current?.focus()
  }
  const openMenu = () => {
    const menu = menuRef.current
    const trigger = triggerRef.current
    if (!menu || !trigger) return
    if (menu.matches(':popover-open')) return closeMenu()
    const bounds = trigger.getBoundingClientRect()
    menu.style.left = Math.max(12, Math.min(bounds.right - 192, window.innerWidth - 204)) + 'px'
    menu.style.top = Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - 164)) + 'px'
    menu.showPopover()
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }

  const detailsAction = (
    <button
      aria-label={'查看 ' + label + ' 完整信息'}
      className="workspace-table__detail"
      disabled={disabled}
      onClick={() => {
        if (useMenu) closeMenu()
        onDetails()
      }}
      role={useMenu ? 'menuitem' : undefined}
      title="查看完整信息"
      type="button"
    >
      <Eye aria-hidden="true" size={16} />
      {useMenu && <span>查看完整信息</span>}
    </button>
  )
  const translationAction = translationHref && (
    <Link
      aria-disabled={disabled || undefined}
      aria-label={'维护 ' + label + ' 四语内容'}
      className="workspace-table__detail"
      href={translationHref}
      onClick={(event) => {
        if (disabled) event.preventDefault()
        else if (useMenu) closeMenu()
      }}
      role={useMenu ? 'menuitem' : undefined}
      tabIndex={disabled ? -1 : undefined}
      title="维护四语内容"
    >
      <Languages aria-hidden="true" size={16} />
      {useMenu && <span>维护四语内容</span>}
    </Link>
  )
  const deleteAction = onDelete && (
    <button
      aria-label={'删除 ' + label}
      className="workspace-table__detail workspace-table__detail--danger"
      disabled={disabled}
      onClick={() => {
        if (useMenu) closeMenu()
        onDelete()
      }}
      role={useMenu ? 'menuitem' : undefined}
      title="删除内容"
      type="button"
    >
      <Trash2 aria-hidden="true" size={16} />
      {useMenu && <span>删除内容</span>}
    </button>
  )

  return (
    <div className="workspace-table__actions">
      {editHref && (
        <Link
          aria-disabled={disabled || undefined}
          aria-label={'编辑 ' + label}
          className="workspace-table__detail workspace-table__detail--primary"
          href={editHref}
          onClick={(event) => {
            if (disabled) event.preventDefault()
          }}
          tabIndex={disabled ? -1 : undefined}
        >
          <PencilLine aria-hidden="true" size={14} />
          编辑
        </Link>
      )}
      {useMenu ? (
        <>
          <button
            aria-controls={menuID}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={label + ' 更多操作'}
            className="workspace-table__detail"
            disabled={disabled}
            onClick={openMenu}
            ref={triggerRef}
            title="更多操作"
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={18} />
          </button>
          <div
            aria-label={label + ' 操作'}
            className="workspace-table__row-menu"
            id={menuID}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeMenu()
              }
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const items = Array.from(
                  menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [],
                )
                const index = items.indexOf(document.activeElement as HTMLElement)
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                items[next]?.focus()
              }
            }}
            onToggle={() => setOpen(Boolean(menuRef.current?.matches(':popover-open')))}
            popover="auto"
            ref={menuRef}
            role="menu"
          >
            {detailsAction}
            {translationAction}
            {deleteAction}
          </div>
        </>
      ) : (
        <>
          {detailsAction}
          {translationAction}
          {deleteAction}
        </>
      )}
    </div>
  )
}
