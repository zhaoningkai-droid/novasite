import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    ALTER TABLE platform_geo.articles ALTER COLUMN job_id DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN task_id DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN task_version DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN question_id DROP NOT NULL;
  `),
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'GEO articles may contain manually authored records; keep the compatible nullable links.',
  )
}
