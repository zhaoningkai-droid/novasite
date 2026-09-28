import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tenants_site_navigation_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_site_navigation_children_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_site_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_site_navigation_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_fixed_pages_footer_quick_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "tenants_fixed_pages_footer_quick_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_company_intro" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_strength" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_featured_products" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_video" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_video_u_r_l" varchar;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_news" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_homepage_show_cases" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_about_show_strength" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "fixed_pages_contact_page_show_inquiry_form" boolean DEFAULT true;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_hero_eyebrow" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_hero_title" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_hero_description" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_company_intro_title" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_homepage_company_intro" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_about_title" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_about_intro" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_about_certificates" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_contact_page_title" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_contact_page_intro" varchar;
  ALTER TABLE "tenants_locales" ADD COLUMN "fixed_pages_footer_intro" varchar;
  ALTER TABLE "tenants_site_navigation_children" ADD CONSTRAINT "tenants_site_navigation_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_site_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_site_navigation_children_locales" ADD CONSTRAINT "tenants_site_navigation_children_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_site_navigation_children"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_site_navigation" ADD CONSTRAINT "tenants_site_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_site_navigation_locales" ADD CONSTRAINT "tenants_site_navigation_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_site_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_fixed_pages_footer_quick_links" ADD CONSTRAINT "tenants_fixed_pages_footer_quick_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_fixed_pages_footer_quick_links_locales" ADD CONSTRAINT "tenants_fixed_pages_footer_quick_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_fixed_pages_footer_quick_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_site_navigation_children_order_idx" ON "tenants_site_navigation_children" USING btree ("_order");
  CREATE INDEX "tenants_site_navigation_children_parent_id_idx" ON "tenants_site_navigation_children" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tenants_site_navigation_children_locales_locale_parent_id_un" ON "tenants_site_navigation_children_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tenants_site_navigation_order_idx" ON "tenants_site_navigation" USING btree ("_order");
  CREATE INDEX "tenants_site_navigation_parent_id_idx" ON "tenants_site_navigation" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tenants_site_navigation_locales_locale_parent_id_unique" ON "tenants_site_navigation_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tenants_fixed_pages_footer_quick_links_order_idx" ON "tenants_fixed_pages_footer_quick_links" USING btree ("_order");
  CREATE INDEX "tenants_fixed_pages_footer_quick_links_parent_id_idx" ON "tenants_fixed_pages_footer_quick_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tenants_fixed_pages_footer_quick_links_locales_locale_parent" ON "tenants_fixed_pages_footer_quick_links_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tenants_site_navigation_children" CASCADE;
  DROP TABLE "tenants_site_navigation_children_locales" CASCADE;
  DROP TABLE "tenants_site_navigation" CASCADE;
  DROP TABLE "tenants_site_navigation_locales" CASCADE;
  DROP TABLE "tenants_fixed_pages_footer_quick_links" CASCADE;
  DROP TABLE "tenants_fixed_pages_footer_quick_links_locales" CASCADE;
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_company_intro";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_strength";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_featured_products";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_video";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_video_u_r_l";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_news";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_homepage_show_cases";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_about_show_strength";
  ALTER TABLE "tenants" DROP COLUMN "fixed_pages_contact_page_show_inquiry_form";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_hero_eyebrow";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_hero_title";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_hero_description";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_company_intro_title";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_homepage_company_intro";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_about_title";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_about_intro";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_about_certificates";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_contact_page_title";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_contact_page_intro";
  ALTER TABLE "tenants_locales" DROP COLUMN "fixed_pages_footer_intro";`)
}
