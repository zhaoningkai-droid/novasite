import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export const translationAssistantSQL = `
  ALTER TABLE platform_jobs.field_translation_preview
    ALTER COLUMN product_id DROP NOT NULL,
    DROP CONSTRAINT field_translation_preview_field_check,
    ADD CONSTRAINT field_translation_preview_scope_check CHECK (
      (field='assistant' AND product_id IS NULL) OR
      (field IN ('title','summary') AND product_id IS NOT NULL)
    );
  CREATE INDEX field_translation_preview_assistant_latest
    ON platform_jobs.field_translation_preview(tenant_id,actor_id,created_at DESC,id DESC)
    WHERE field='assistant';
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`SET LOCAL lock_timeout = '5s'`)
  await db.execute(sql.raw(translationAssistantSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep assistant jobs and allow the worker to finish them before an app rollback.
}
