import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoPublishSchemaSQL } from '../platform/geo/publish-schema'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoPublishSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户发布意图及发布事件记录，不自动删除GEO数据。')
}
