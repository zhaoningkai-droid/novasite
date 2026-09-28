import type { ReactNode } from 'react'

import type { WorkspaceCompany } from '@/platform/workspace'
import { WorkspaceFrame } from './WorkspaceFrame'
import './workspace-shell.scss'

type Props = {
  children: ReactNode
  companies: WorkspaceCompany[]
  currentCompany: WorkspaceCompany
  canEditContent: boolean
  canManageSite: boolean
}

export function WorkspaceShell(props: Props) {
  return <WorkspaceFrame {...props} key={props.currentCompany.slug} />
}
