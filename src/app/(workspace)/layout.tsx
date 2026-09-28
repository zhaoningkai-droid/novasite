import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './workspace-ui.scss'

export const metadata: Metadata = { title: '选择公司 · NovaSite 独立站运营平台' }

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>
}
