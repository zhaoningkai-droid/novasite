'use client'

import { useEffect, useRef } from 'react'

type EditorState = { busy: boolean; dirty: boolean }
const editors = new Map<symbol, EditorState>()
const updateFlags = () => {
  const values = [...editors.values()]
  document.documentElement.dataset.workspaceUnsaved = String(values.some((item) => item.dirty))
  document.documentElement.dataset.workspaceBusy = String(values.some((item) => item.busy))
}

// Kept for existing save/cancel callers. Navigation is always immediate.
export const allowWorkspaceNavigation = () => {}

export function useWorkspaceUnsaved(dirty: boolean, busy = false): void {
  const owner = useRef(Symbol('workspace-editor')).current
  useEffect(() => {
    editors.set(owner, { busy, dirty })
    updateFlags()
    return () => {
      editors.delete(owner)
      updateFlags()
    }
  }, [busy, dirty, owner])
}
