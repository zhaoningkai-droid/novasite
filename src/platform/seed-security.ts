import { userHasRole } from '@/access/roles'

/** Destructive and demo seed code is opt-in and never runs in production. */
export const seedEnvironmentAllowsExecution = (): boolean => {
  const environment = process.env.NODE_ENV

  return Boolean(
    environment &&
      environment !== 'production' &&
      process.env.NOVASITE_ENABLE_SEED === 'true',
  )
}

export const userCanRunSeed = (user: unknown): boolean =>
  userHasRole(user, ['super-admin'])

export const assertSeedEnvironmentAllowsExecution = (): void => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed operations are disabled in production.')
  }

  if (!seedEnvironmentAllowsExecution()) {
    throw new Error(
      'Seed operations are disabled. Use a non-production NODE_ENV and explicitly set NOVASITE_ENABLE_SEED=true.',
    )
  }
}

export const assertSeedAdministrator = (user: unknown): void => {
  if (!userCanRunSeed(user)) {
    throw new Error('Seed operations require the platform administrator role.')
  }
}

export const assertSeedExecutionAllowed = (user: unknown): void => {
  assertSeedEnvironmentAllowsExecution()
  assertSeedAdministrator(user)
}
