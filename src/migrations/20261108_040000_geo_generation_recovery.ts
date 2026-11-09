import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoGenerationRecoverySQL } from '../platform/geo/article-schema'

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`SET LOCAL lock_timeout = '5s'`)
  await db.execute(sql.raw(geoGenerationRecoverySQL))
}

export async function down(_args: MigrateDownArgs) {
  // Keep retry deadlines and claim timestamps for a later upgrade.
}
