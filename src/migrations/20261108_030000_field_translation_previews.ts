import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export const fieldTranslationPreviewsSQL = `
  CREATE TABLE IF NOT EXISTS platform_jobs.field_translation_preview (
    id uuid PRIMARY KEY,
    tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    field text NOT NULL CHECK (field IN ('title','summary')),
    source_locale varchar(8) NOT NULL,
    target_locale varchar(8) NOT NULL CHECK (target_locale<>source_locale),
    input_hash text NOT NULL,
    source_text text NOT NULL CHECK (char_length(source_text) BETWEEN 1 AND 8000),
    result text CHECK (char_length(result)<=32000),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','unknown')),
    message text,
    checkpoint jsonb,
    provider_in_flight boolean NOT NULL DEFAULT false,
    lease_owner uuid,
    lease_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '7 days')
  );
  CREATE INDEX IF NOT EXISTS field_translation_preview_lookup
    ON platform_jobs.field_translation_preview(tenant_id,actor_id,product_id,field,source_locale,target_locale,created_at DESC);
  CREATE INDEX IF NOT EXISTS field_translation_preview_pending
    ON platform_jobs.field_translation_preview(created_at) WHERE status IN ('queued','running');
  CREATE INDEX IF NOT EXISTS field_translation_preview_expires ON platform_jobs.field_translation_preview(expires_at);
  CREATE UNIQUE INDEX IF NOT EXISTS field_translation_preview_running_tenant
    ON platform_jobs.field_translation_preview(tenant_id) WHERE status='running';
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`SET LOCAL lock_timeout = '5s'`)
  await db.execute(sql.raw(fieldTranslationPreviewsSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep previews for a later upgrade or expiry cleanup.
}
