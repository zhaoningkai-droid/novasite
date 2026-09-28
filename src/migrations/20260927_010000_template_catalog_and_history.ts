import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Add metadata for the reference library plus tenant-scoped, reversible template changes. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_templates_industry" ADD VALUE IF NOT EXISTS 'home-interior';
    ALTER TYPE "public"."enum_templates_industry" ADD VALUE IF NOT EXISTS 'auto-parts';

    ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "schema_version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "reference_code" varchar;
    ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "reference_u_r_l" varchar;
    CREATE INDEX IF NOT EXISTS "templates_reference_code_idx" ON "templates" USING btree ("reference_code");

    DO $$ BEGIN
      CREATE TYPE "public"."enum_site_template_changes_operation" AS ENUM('apply', 'rollback');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "site_template_changes" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "operation" "enum_site_template_changes_operation" NOT NULL,
      "from_template_id" integer,
      "to_template_id" integer,
      "from_version" varchar,
      "to_version" varchar,
      "from_revision" numeric NOT NULL,
      "to_revision" numeric NOT NULL,
      "before_settings" jsonb NOT NULL,
      "after_settings" jsonb NOT NULL,
      "reverts_change_id" integer,
      "actor_id" integer,
      "actor_email" varchar,
      "idempotency_key" varchar NOT NULL,
      "request_hash" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "site_template_changes" ADD CONSTRAINT "site_template_changes_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "site_template_changes" ADD CONSTRAINT "site_template_changes_from_template_fk"
        FOREIGN KEY ("from_template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "site_template_changes" ADD CONSTRAINT "site_template_changes_to_template_fk"
        FOREIGN KEY ("to_template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "site_template_changes" ADD CONSTRAINT "site_template_changes_reverts_change_fk"
        FOREIGN KEY ("reverts_change_id") REFERENCES "public"."site_template_changes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "site_template_changes" ADD CONSTRAINT "site_template_changes_actor_fk"
        FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "site_template_changes_idempotency_key_idx"
      ON "site_template_changes" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "site_template_changes_tenant_idx"
      ON "site_template_changes" USING btree ("tenant_id");
    CREATE INDEX IF NOT EXISTS "site_template_changes_from_template_idx"
      ON "site_template_changes" USING btree ("from_template_id");
    CREATE INDEX IF NOT EXISTS "site_template_changes_to_template_idx"
      ON "site_template_changes" USING btree ("to_template_id");
    CREATE INDEX IF NOT EXISTS "site_template_changes_reverts_change_idx"
      ON "site_template_changes" USING btree ("reverts_change_id");
    CREATE INDEX IF NOT EXISTS "site_template_changes_actor_idx"
      ON "site_template_changes" USING btree ("actor_id");
    CREATE INDEX IF NOT EXISTS "site_template_changes_updated_at_idx"
      ON "site_template_changes" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "site_template_changes_created_at_idx"
      ON "site_template_changes" USING btree ("created_at");

    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "template_revision" numeric DEFAULT 0 NOT NULL;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "template_settings" jsonb DEFAULT '{}'::jsonb;
  `)
}

/** Keep PostgreSQL enum additions in place; remove only structures introduced by this migration. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "site_template_changes";
    DROP TYPE IF EXISTS "public"."enum_site_template_changes_operation";
    DROP INDEX IF EXISTS "templates_reference_code_idx";
    ALTER TABLE "templates" DROP COLUMN IF EXISTS "reference_u_r_l";
    ALTER TABLE "templates" DROP COLUMN IF EXISTS "reference_code";
    ALTER TABLE "templates" DROP COLUMN IF EXISTS "schema_version";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "template_settings";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "template_revision";
  `)
}
