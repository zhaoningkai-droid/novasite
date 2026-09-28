import { postgresAdapter } from '@payloadcms/db-postgres'

export function createDatabaseAdapter() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required.')

  return postgresAdapter({ pool: { connectionString } })
}
