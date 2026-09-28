'use client'

import { createContext, useContext, type ReactNode } from 'react'

type Permissions = { canEditContent: boolean; canManageSite: boolean }
const WorkspacePermissions = createContext<Permissions>({
  canEditContent: false, canManageSite: false,
})
export function WorkspacePermissionsProvider({ children, ...permissions }:
  Permissions & { children: ReactNode }) {
  return <WorkspacePermissions.Provider value={permissions}>{children}</WorkspacePermissions.Provider>
}
export const useWorkspacePermissions = () => useContext(WorkspacePermissions)
