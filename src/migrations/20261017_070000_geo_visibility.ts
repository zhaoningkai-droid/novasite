import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoVisibilitySchemaSQL } from '../platform/geo/visibility-schema'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoVisibilitySchemaSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留GEO问题集与观测证据，不自动删除客户数据。')
}
