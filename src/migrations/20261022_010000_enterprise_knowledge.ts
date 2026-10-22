import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { knowledgeSchemaSQL } from '../platform/knowledge/schema'

/** Adds isolated knowledge storage without rewriting any customer CMS/GEO data. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(knowledgeSchemaSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留企业知识库资料，不自动删除客户文件和分段。')
}
