import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Nullable and without a default: existing company content is not rewritten.
  await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS seo_google_analytics_property_id varchar;`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留 GA4 配置列；不自动删除客户的统计设置。')
}
