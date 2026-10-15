import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Prepared migration only. Operator approval and backup are required before applying. */
export const translationUsageSchemaSQL = `
  CREATE SCHEMA IF NOT EXISTS platform_jobs;
  CREATE TABLE IF NOT EXISTS platform_jobs.translation_usage (
    id uuid PRIMARY KEY,
    tenant_id integer NOT NULL CHECK (tenant_id>0),
    job_id uuid REFERENCES platform_jobs.product_translation(id) ON DELETE SET NULL,
    request_group uuid NOT NULL,
    reservation_owner uuid NOT NULL,
    model varchar(100) NOT NULL,
    accounting_day date NOT NULL,
    accounting_month date NOT NULL,
    reserved_units bigint NOT NULL CHECK (reserved_units>0),
    charged_units bigint NOT NULL CHECK (charged_units>=0),
    status varchar(16) NOT NULL CHECK (status IN ('reserved','known','unknown')),
    input_tokens bigint CHECK (input_tokens>=0),
    output_tokens bigint CHECK (output_tokens>=0),
    cache_hit_input_tokens bigint CHECK (cache_hit_input_tokens>=0),
    cache_miss_input_tokens bigint CHECK (cache_miss_input_tokens>=0),
    created_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    CHECK (accounting_month=date_trunc('month',accounting_day::timestamp)::date),
    CHECK ((status='known' AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND charged_units=input_tokens+output_tokens AND settled_at IS NOT NULL)
      OR (status IN ('reserved','unknown') AND input_tokens IS NULL AND output_tokens IS NULL AND charged_units=reserved_units)),
    CHECK ((cache_hit_input_tokens IS NULL AND cache_miss_input_tokens IS NULL)
      OR (status='known' AND cache_hit_input_tokens IS NOT NULL AND cache_miss_input_tokens IS NOT NULL AND cache_hit_input_tokens+cache_miss_input_tokens=input_tokens))
  );
  CREATE INDEX IF NOT EXISTS translation_usage_period ON platform_jobs.translation_usage(accounting_month,accounting_day);
  CREATE INDEX IF NOT EXISTS translation_usage_company_period ON platform_jobs.translation_usage(tenant_id,accounting_month,accounting_day);
  CREATE INDEX IF NOT EXISTS translation_usage_group ON platform_jobs.translation_usage(request_group);
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(translationUsageSchemaSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Turn off the feature and worker before reverting code. Keep usage history;
  // deleting a company or translation job must never reset a global budget.
}
