import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE platform_geo.publish_plans
        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      CREATE INDEX IF NOT EXISTS geo_publish_plan_tenant_active_updated
        ON platform_geo.publish_plans(tenant_id, updated_at DESC)
        WHERE archived_at IS NULL;
    `),
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('归档字段用于保留GEO发布计划及执行记录，不自动删除。')
}
