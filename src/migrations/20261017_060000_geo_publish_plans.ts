import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoPlanSchemaSQL } from '../platform/geo/plan-schema'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoPlanSchemaSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留GEO发布计划与执行记录，不自动删除客户数据。')
}
