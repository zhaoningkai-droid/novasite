'use client'

import { useEffect } from 'react'

const systemGroupID = 'nav-group-系统设置'

export function NavDefaults() {
  useEffect(() => {
    let attempts = 0
    const collapseSystemGroup = () => {
      const button = document.querySelector<HTMLButtonElement>(
        `#${CSS.escape(systemGroupID)} .nav-group__toggle--open`,
      )
      if (button) {
        button.click()
        return
      }
      attempts += 1
      if (attempts < 20) window.setTimeout(collapseSystemGroup, 100)
    }
    collapseSystemGroup()
  }, [])

  return null
}
