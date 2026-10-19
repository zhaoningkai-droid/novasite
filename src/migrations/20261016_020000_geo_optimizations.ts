import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoKeywordsSchemaSQL } from '../platform/geo/schema'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoKeywordsSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户GEO配置与版本记录，不自动删除GEO数据。')
}
