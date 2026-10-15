import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds optional, tenant-owned fields for the executive homepage. This migration
 * never seeds sample content; all new columns and repeaters start empty.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_advantages_enabled" boolean;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_marks_enabled" boolean;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_certificates_enabled" boolean;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_intro_background_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_intro_overlay" numeric DEFAULT 0.6;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_video_poster_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_faq_enabled" boolean;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_faq_limit" numeric DEFAULT 6;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_footer_background_image_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_footer_background_overlay" numeric DEFAULT 0.65;

    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_advantages_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_certificates_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_intro_button_label" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_strength_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_cases_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_categories_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_products_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_news_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_faq_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_description" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_button" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_description" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_button" varchar;

    CREATE TABLE IF NOT EXISTS "tenants_fixed_pages_homepage_executive_home_advantages" (
      "_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL,
      "icon" varchar, "sort_order" numeric DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "tenants_fixed_pages_homepage_executive_home_advantages_locales" (
      "title" varchar, "description" varchar, "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL, "_parent_id" varchar NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "tenants_fixed_pages_homepage_executive_home_marks" (
      "_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL,
      "image_id" integer, "sort_order" numeric DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "tenants_fixed_pages_homepage_executive_home_marks_locales" (
      "label" varchar, "id" serial PRIMARY KEY NOT NULL, "_locale" "_locales" NOT NULL, "_parent_id" varchar NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "tenants_exec_certs" (
      "_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL,
      "image_id" integer NOT NULL, "sort_order" numeric DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "tenants_exec_certs_locales" (
      "name" varchar, "alt" varchar, "id" serial PRIMARY KEY NOT NULL, "_locale" "_locales" NOT NULL, "_parent_id" varchar NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "tenants_exec_strength_gallery" (
      "_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL,
      "image_id" integer NOT NULL, "sort_order" numeric DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "tenants_exec_strength_gallery_locales" (
      "caption" varchar, "alt" varchar, "id" serial PRIMARY KEY NOT NULL, "_locale" "_locales" NOT NULL, "_parent_id" varchar NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "tenants" ADD CONSTRAINT "tenants_exec_intro_background_media_fk" FOREIGN KEY ("fixed_pages_homepage_executive_home_intro_background_id") REFERENCES "public"."media"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "tenants" ADD CONSTRAINT "tenants_exec_video_poster_media_fk" FOREIGN KEY ("fixed_pages_homepage_executive_home_video_poster_id") REFERENCES "public"."media"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "tenants" ADD CONSTRAINT "tenants_exec_footer_background_media_fk" FOREIGN KEY ("fixed_pages_footer_background_image_id") REFERENCES "public"."media"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "tenants_fixed_pages_homepage_executive_home_advantages" ADD CONSTRAINT "tenants_exec_advantages_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
      ALTER TABLE "tenants_fixed_pages_homepage_executive_home_advantages_locales" ADD CONSTRAINT "tenants_exec_advantages_locales_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_fixed_pages_homepage_executive_home_advantages"("id") ON DELETE cascade;
      ALTER TABLE "tenants_fixed_pages_homepage_executive_home_marks" ADD CONSTRAINT "tenants_exec_marks_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
      ALTER TABLE "tenants_fixed_pages_homepage_executive_home_marks_locales" ADD CONSTRAINT "tenants_exec_marks_locales_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_fixed_pages_homepage_executive_home_marks"("id") ON DELETE cascade;
      ALTER TABLE "tenants_exec_certs" ADD CONSTRAINT "tenants_exec_certificates_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
      ALTER TABLE "tenants_exec_certs_locales" ADD CONSTRAINT "tenants_exec_certificates_locales_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_exec_certs"("id") ON DELETE cascade;
      ALTER TABLE "tenants_exec_strength_gallery" ADD CONSTRAINT "tenants_exec_strength_gallery_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
      ALTER TABLE "tenants_exec_strength_gallery_locales" ADD CONSTRAINT "tenants_exec_strength_gallery_locales_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_exec_strength_gallery"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "tenants_fixed_pages_homepage_executive_home_marks" ADD CONSTRAINT "tenants_exec_marks_image_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null;
      ALTER TABLE "tenants_exec_certs" ADD CONSTRAINT "tenants_exec_certificates_image_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE restrict;
      ALTER TABLE "tenants_exec_strength_gallery" ADD CONSTRAINT "tenants_exec_strength_gallery_image_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE restrict;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS "tenants_exec_advantages_order_idx" ON "tenants_fixed_pages_homepage_executive_home_advantages" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "tenants_exec_advantages_parent_idx" ON "tenants_fixed_pages_homepage_executive_home_advantages" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "tenants_exec_advantages_locale_parent_uq" ON "tenants_fixed_pages_homepage_executive_home_advantages_locales" USING btree ("_locale", "_parent_id");
    CREATE INDEX IF NOT EXISTS "tenants_exec_marks_order_idx" ON "tenants_fixed_pages_homepage_executive_home_marks" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "tenants_exec_marks_parent_idx" ON "tenants_fixed_pages_homepage_executive_home_marks" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "tenants_exec_marks_locale_parent_uq" ON "tenants_fixed_pages_homepage_executive_home_marks_locales" USING btree ("_locale", "_parent_id");
    CREATE INDEX IF NOT EXISTS "tenants_exec_certificates_order_idx" ON "tenants_exec_certs" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "tenants_exec_certificates_parent_idx" ON "tenants_exec_certs" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "tenants_exec_certificates_locale_parent_uq" ON "tenants_exec_certs_locales" USING btree ("_locale", "_parent_id");
    CREATE INDEX IF NOT EXISTS "tenants_exec_strength_gallery_order_idx" ON "tenants_exec_strength_gallery" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "tenants_exec_strength_gallery_parent_idx" ON "tenants_exec_strength_gallery" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "tenants_exec_strength_gallery_locale_parent_uq" ON "tenants_exec_strength_gallery_locales" USING btree ("_locale", "_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const populated = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM "tenants_fixed_pages_homepage_executive_home_advantages" LIMIT 1
    ) OR EXISTS (
      SELECT 1 FROM "tenants_fixed_pages_homepage_executive_home_marks" LIMIT 1
    ) OR EXISTS (
      SELECT 1 FROM "tenants_exec_certs" LIMIT 1
    ) OR EXISTS (
      SELECT 1 FROM "tenants_exec_strength_gallery" LIMIT 1
    ) OR EXISTS (
      SELECT 1 FROM "tenants"
      WHERE "fixed_pages_homepage_executive_home_intro_background_id" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_video_poster_id" IS NOT NULL
        OR "fixed_pages_footer_background_image_id" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_advantages_enabled" IS TRUE
        OR "fixed_pages_homepage_executive_home_marks_enabled" IS TRUE
        OR "fixed_pages_homepage_executive_home_certificates_enabled" IS TRUE
        OR "fixed_pages_homepage_executive_home_faq_enabled" IS TRUE
        OR "fixed_pages_homepage_executive_home_intro_overlay" IS DISTINCT FROM 0.6
        OR "fixed_pages_homepage_executive_home_faq_limit" IS DISTINCT FROM 6
        OR "fixed_pages_footer_background_overlay" IS DISTINCT FROM 0.65
    ) OR EXISTS (
      SELECT 1 FROM "tenants_locales"
      WHERE "fixed_pages_homepage_executive_home_advantages_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_certificates_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_intro_button_label" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_strength_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_cases_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_categories_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_products_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_news_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_faq_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_case_c_t_a_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_case_c_t_a_description" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_case_c_t_a_button" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_product_c_t_a_title" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_product_c_t_a_description" IS NOT NULL
        OR "fixed_pages_homepage_executive_home_product_c_t_a_button" IS NOT NULL
    ) AS "has_content"
  `)
  const rows = Array.isArray(populated) ? populated : (populated as { rows?: Array<{ has_content?: boolean }> }).rows || []
  if (rows.some((row) => row.has_content)) {
    throw new Error('Executive homepage settings contain tenant content. Export/preserve that content before rolling back this migration.')
  }

  await db.execute(sql`
    DROP TABLE IF EXISTS "tenants_exec_strength_gallery_locales" CASCADE;
    DROP TABLE IF EXISTS "tenants_exec_strength_gallery" CASCADE;
    DROP TABLE IF EXISTS "tenants_exec_certs_locales" CASCADE;
    DROP TABLE IF EXISTS "tenants_exec_certs" CASCADE;
    DROP TABLE IF EXISTS "tenants_fixed_pages_homepage_executive_home_marks_locales" CASCADE;
    DROP TABLE IF EXISTS "tenants_fixed_pages_homepage_executive_home_marks" CASCADE;
    DROP TABLE IF EXISTS "tenants_fixed_pages_homepage_executive_home_advantages_locales" CASCADE;
    DROP TABLE IF EXISTS "tenants_fixed_pages_homepage_executive_home_advantages" CASCADE;
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_exec_intro_background_media_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_exec_video_poster_media_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_exec_footer_background_media_fk";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_advantages_enabled";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_marks_enabled";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_certificates_enabled";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_intro_background_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_intro_overlay";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_video_poster_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_faq_enabled";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_faq_limit";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_footer_background_image_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_footer_background_overlay";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_advantages_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_certificates_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_intro_button_label";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_strength_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_cases_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_categories_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_products_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_news_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_faq_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_description";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_case_c_t_a_button";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_title";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_description";
    ALTER TABLE "tenants_locales" DROP COLUMN IF EXISTS "fixed_pages_homepage_executive_home_product_c_t_a_button";
  `)
}
