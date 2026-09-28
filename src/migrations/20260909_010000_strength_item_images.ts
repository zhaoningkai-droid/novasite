import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE "public"."enum_tenants_fixed_pages_homepage_video_source" AS ENUM('external', 'local'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "branding_mobile_hero_image_u_r_l" varchar;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "branding_navigation_banner_u_r_l" varchar;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_banners" jsonb;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_video_source" "enum_tenants_fixed_pages_homepage_video_source" DEFAULT 'external';
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_video_media_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_featured_news_category_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_intro_image_id" integer;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_homepage_inquiry_required_fields" jsonb;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "fixed_pages_footer_social_links" jsonb;
    ALTER TABLE "tenants_fixed_pages_homepage_strength_items" ADD COLUMN IF NOT EXISTS "image_id" integer;
    DO $$ BEGIN
      ALTER TABLE "tenants_fixed_pages_homepage_strength_items" ADD CONSTRAINT "tenants_homepage_strength_items_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "tenants" ADD CONSTRAINT "tenants_homepage_video_media_fk" FOREIGN KEY ("fixed_pages_homepage_video_media_id") REFERENCES "public"."media"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "tenants" ADD CONSTRAINT "tenants_homepage_featured_news_fk" FOREIGN KEY ("fixed_pages_homepage_featured_news_category_id") REFERENCES "public"."news_categories"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "tenants" ADD CONSTRAINT "tenants_homepage_intro_image_fk" FOREIGN KEY ("fixed_pages_homepage_intro_image_id") REFERENCES "public"."media"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "tenants_homepage_strength_items_image_idx" ON "tenants_fixed_pages_homepage_strength_items" USING btree ("image_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_homepage_video_media_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_homepage_featured_news_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_homepage_intro_image_fk";
    ALTER TABLE "tenants_fixed_pages_homepage_strength_items" DROP CONSTRAINT IF EXISTS "tenants_homepage_strength_items_image_id_fk";
    DROP INDEX IF EXISTS "tenants_homepage_strength_items_image_idx";
    ALTER TABLE "tenants_fixed_pages_homepage_strength_items" DROP COLUMN IF EXISTS "image_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "branding_mobile_hero_image_u_r_l";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "branding_navigation_banner_u_r_l";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_banners";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_video_source";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_video_media_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_featured_news_category_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_intro_image_id";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_homepage_inquiry_required_fields";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "fixed_pages_footer_social_links";
  `)
}
