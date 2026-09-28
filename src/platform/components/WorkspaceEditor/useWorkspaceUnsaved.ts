'use client'

import { useEffect, useRef } from 'react'

type EditorState = { busy: boolean; dirty: boolean }
const editors = new Map<symbol, EditorState>()
let navigationAllowed = false
let resetTimer: ReturnType<typeof setTimeout> | undefined

const updateFlags = () => {
  const values = [...editors.values()]
  document.documentElement.dataset.workspaceUnsaved = values.some((item) => item.dirty)
    ? 'true'
    : 'false'
  document.documentElement.dataset.workspaceBusy = values.some((item) => item.busy)
    ? 'true'
    : 'false'
}

/** Use only after an explicit discard action or a successful save followed by navigation. */
export const allowWorkspaceNavigation = () => {
  navigationAllowed = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    navigationAllowed = false
  }, 1200)
}

const isBusy = () => [...editors.values()].some((item) => item.busy)
const isDirty = () => [...editors.values()].some((item) => item.dirty)

export function useWorkspaceUnsaved(dirty: boolean, busy = false): void {
  const owner = useRef(Symbol('workspace-editor')).current
  const previousDirty = useRef(false)

  useEffect(() => {
    if (dirty && !previousDirty.current) navigationAllowed = false
    previousDirty.current = dirty
    editors.set(owner, { busy, dirty })
    updateFlags()
    return () => {
      editors.delete(owner)
      updateFlags()
    }
  }, [busy, dirty, owner])

  useEffect(() => {
    // A newly mounted editor must not inherit a previous page's one-time discard approval.
    navigationAllowed = false
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAllowed || (!isDirty() && !isBusy())) return
      event.preventDefault()
      event.returnValue = ''
    }
    const protectLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        navigationAllowed ||
        (!isDirty() && !isBusy())
      )
        return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.download)
        return
      const destination = new URL(target.href, window.location.href)
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === location.pathname && destination.search === location.search)
      )
        return
      if (isBusy()) {
        event.preventDefault()
        event.stopImmediatePropagation()
        window.alert('正在保存或上传，请完成后再离开页面。')
        return
      }
      if (!window.confirm('当前修改尚未保存，离开会放弃这些修改。确定离开吗？')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      allowWorkspaceNavigation()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', protectLink, true)
    window.addEventListener('workspace-company-changing', allowWorkspaceNavigation)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', protectLink, true)
      window.removeEventListener('workspace-company-changing', allowWorkspaceNavigation)
    }
  }, [])
}
