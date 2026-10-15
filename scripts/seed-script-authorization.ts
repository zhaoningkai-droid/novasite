import type { Payload } from 'payload'

import {
  assertSeedAdministrator,
  assertSeedEnvironmentAllowsExecution,
} from '../src/platform/seed-security'

/** Local data-writing scripts require an explicit opt-in and an existing super-admin. */
export const authorizeSeedScript = async (payload: Payload): Promise<void> => {
  assertSeedEnvironmentAllowsExecution()

  const rawUserID = process.env.NOVASITE_SEED_ADMIN_USER_ID
  if (!rawUserID || !/^[1-9]\d*$/.test(rawUserID)) {
    throw new Error('Set NOVASITE_SEED_ADMIN_USER_ID to an existing platform administrator.')
  }

  const user = await payload.findByID({
    collection: 'users',
    id: Number(rawUserID),
    depth: 0,
    overrideAccess: true,
    select: { roles: true },
  })

  assertSeedAdministrator(user)
}
