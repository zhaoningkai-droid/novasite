import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export const translationRetryScheduleSQL = `
  ALTER TABLE platform_jobs.product_translation ADD COLUMN IF NOT EXISTS next_run_at timestamptz;
  CREATE INDEX IF NOT EXISTS product_translation_due
    ON platform_jobs.product_translation(next_run_at, created_at) WHERE status='queued';
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`SET LOCAL lock_timeout = '5s'`)
  await db.execute(sql.raw(translationRetryScheduleSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep pending retry times and checkpoints available for a later upgrade.
}
