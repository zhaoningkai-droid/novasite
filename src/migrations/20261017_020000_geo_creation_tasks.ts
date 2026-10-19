import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoTaskSchemaSQL } from '../platform/geo/task-schema'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoTaskSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户创作任务、问题快照与调用记录，不自动删除GEO数据。')
}
