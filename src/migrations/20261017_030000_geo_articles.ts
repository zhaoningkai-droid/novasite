import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { geoArticleSchemaSQL } from '../platform/geo/article-schema'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(geoArticleSchemaSQL))
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户文章、生成记录与修订，不自动删除GEO数据。')
}
