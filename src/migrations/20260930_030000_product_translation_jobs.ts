import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Isolated queue storage: no existing business tables or customer columns are changed. */
export const productTranslationSchemaSQL = `
    CREATE SCHEMA IF NOT EXISTS platform_jobs;
    CREATE TABLE IF NOT EXISTS platform_jobs.product_translation (
      id uuid PRIMARY KEY,
      tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      product_id integer NOT NULL,
      actor_id integer NOT NULL,
      source_locale varchar(8) NOT NULL,
      source_hash varchar(64) NOT NULL,
      targets jsonb NOT NULL,
      source jsonb NOT NULL,
      states jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','partial','failed')),
      lease_owner uuid,
      lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS product_translation_active_product ON platform_jobs.product_translation(tenant_id,product_id) WHERE status IN ('queued','running');
    CREATE INDEX IF NOT EXISTS product_translation_company ON platform_jobs.product_translation(tenant_id,product_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS product_translation_pending ON platform_jobs.product_translation(status,created_at);
  `

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(productTranslationSchemaSQL))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Keep job history and results on rollback. Turn off the worker and feature flag first.
  await db.execute(
    sql`UPDATE platform_jobs.product_translation SET status='failed',lease_owner=NULL,lease_until=NULL WHERE status IN ('queued','running')`,
  )
}
