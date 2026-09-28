import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "tenants_fixed_pages_homepage_strength_items" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar NOT NULL,
      "unit" varchar,
      "sort_order" numeric DEFAULT 0
    );
    CREATE TABLE "tenants_fixed_pages_homepage_strength_items_locales" (
      "label" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" varchar NOT NULL
    );
    ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_inquiry_form" boolean DEFAULT true;
    ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_video_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_video_description" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_inquiry_title" varchar;
    ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_inquiry_description" varchar;
    ALTER TABLE "tenants_fixed_pages_homepage_strength_items" ADD CONSTRAINT "tenants_homepage_strength_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "tenants_fixed_pages_homepage_strength_items_locales" ADD CONSTRAINT "tenants_homepage_strength_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_fixed_pages_homepage_strength_items"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "tenants_homepage_strength_items_order_idx" ON "tenants_fixed_pages_homepage_strength_items" USING btree ("_order");
    CREATE INDEX "tenants_homepage_strength_items_parent_id_idx" ON "tenants_fixed_pages_homepage_strength_items" USING btree ("_parent_id");
    CREATE UNIQUE INDEX "tenants_homepage_strength_items_locale_parent_unique" ON "tenants_fixed_pages_homepage_strength_items_locales" USING btree ("_locale", "_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "tenants_fixed_pages_homepage_strength_items_locales" CASCADE;
    DROP TABLE "tenants_fixed_pages_homepage_strength_items" CASCADE;
    ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_inquiry_form";
    ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_video_title";
    ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_video_description";
    ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_inquiry_title";
    ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_inquiry_description";
  `)
}
