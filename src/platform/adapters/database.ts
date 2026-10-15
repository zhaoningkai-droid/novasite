import { postgresAdapter } from '@payloadcms/db-postgres'
import { createDatabasePoolOptions } from './database-pool'

export function createDatabaseAdapter() {
  return postgresAdapter({
    pool: createDatabasePoolOptions(),
    // Formal runtime schema changes belong to the separately approved migrator.
    ...(process.env.NODE_ENV === 'production' ? { push: false } : {}),
  })
}
