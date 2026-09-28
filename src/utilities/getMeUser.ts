import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import type { User } from '../payload-types'
import config from '@payload-config'

export const getMeUser = async (args?: {
  nullUserRedirect?: string
  validUserRedirect?: string
}): Promise<{
  token: string
  user: User
}> => {
  const { nullUserRedirect, validUserRedirect } = args || {}
  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')?.value
  const payload = await getPayload({ config })
  let authenticatedUser: User | null = null
  if (token) {
    try {
      const authResult = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
      authenticatedUser = authResult.user as User | null
    } catch {
      authenticatedUser = null
    }
  }
  // JWT claims can be older than a just-changed role or password. Load the
  // current record so permission changes take effect immediately.
  const user = authenticatedUser
    ? await payload.findByID({ collection: 'users', id: authenticatedUser.id, overrideAccess: true })
    : undefined

  const expiresAt = user?.expiresAt
  const userExpired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now())

  if (validUserRedirect && authenticatedUser && user && !userExpired) {
    redirect(validUserRedirect)
  }

  if (nullUserRedirect && (!authenticatedUser || !user || userExpired)) {
    const loginRedirect = nullUserRedirect.startsWith('/admin/login')
      ? `/login?redirect=${encodeURIComponent(nullUserRedirect.split('redirect=')[1] || '/workspace/companies')}`
      : nullUserRedirect
    redirect(loginRedirect)
  }

  // Token will exist here because if it doesn't the user will be redirected
  return {
    token: token!,
    user: userExpired ? undefined as never : user as User,
  }
}
