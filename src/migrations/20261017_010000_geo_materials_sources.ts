import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoMaterialSchemaSQL } from '../platform/geo/material-schema'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoMaterialSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户素材组与来源索引，不自动删除GEO数据。')
}
