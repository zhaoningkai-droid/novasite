import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoDetectionSchemaSQL } from '../platform/geo/detection-schema'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoDetectionSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('检测任务和原始证据不可自动删除；回滚应用时保留存储。')
}
