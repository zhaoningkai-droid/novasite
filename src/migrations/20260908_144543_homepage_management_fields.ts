import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Completes the homepage-management model after step 18 and 19. Those
 * migrations already create the strength and about-module tables, so this
 * migration deliberately adds only fields not yet in the versioned schema.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_tenants_fixed_pages_homepage_video_source" AS ENUM('external', 'local');
    ALTER TABLE "tenants" ADD COLUMN "branding_mobile_hero_image_u_r_l" varchar;
    ALTER TABLE "tenants" ADD COLUMN "branding_navigation_banner_u_r_l" varchar;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_banners" jsonb;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_video_source" "enum_tenants_fixed_pages_homepage_video_source" DEFAULT 'external';
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_video_media_id" integer;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_featured_news_category_id" integer;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_intro_image_id" integer;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_inquiry_required_fields" jsonb;
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_footer_social_links" jsonb;
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_fixed_pages_homepage_video_media_id_media_id_fk" FOREIGN KEY ("fixed_pages_homepage_video_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_fixed_pages_homepage_featured_news_category_id_news_categories_id_fk" FOREIGN KEY ("fixed_pages_homepage_featured_news_category_id") REFERENCES "public"."news_categories"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_fixed_pages_homepage_intro_image_id_media_id_fk" FOREIGN KEY ("fixed_pages_homepage_intro_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "tenants_fixed_pages_homepage_video_media_idx" ON "tenants" USING btree ("fixed_pages_homepage_video_media_id");
    CREATE INDEX "tenants_fixed_pages_homepage_featured_news_category_idx" ON "tenants" USING btree ("fixed_pages_homepage_featured_news_category_id");
    CREATE INDEX "tenants_fixed_pages_homepage_intro_image_idx" ON "tenants" USING btree ("fixed_pages_homepage_intro_image_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" DROP CONSTRAINT "tenants_fixed_pages_homepage_video_media_id_media_id_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT "tenants_fixed_pages_homepage_featured_news_category_id_news_categories_id_fk";
    ALTER TABLE "tenants" DROP CONSTRAINT "tenants_fixed_pages_homepage_intro_image_id_media_id_fk";
    DROP INDEX "tenants_fixed_pages_homepage_video_media_idx";
    DROP INDEX "tenants_fixed_pages_homepage_featured_news_category_idx";
    DROP INDEX "tenants_fixed_pages_homepage_intro_image_idx";
    ALTER TABLE "tenants" DROP COLUMN "branding_mobile_hero_image_u_r_l";
    ALTER TABLE "tenants" DROP COLUMN "branding_navigation_banner_u_r_l";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_banners";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_video_source";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_video_media_id";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_featured_news_category_id";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_intro_image_id";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_inquiry_required_fields";
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_footer_social_links";
    DROP TYPE "public"."enum_tenants_fixed_pages_homepage_video_source";
  `)
}
