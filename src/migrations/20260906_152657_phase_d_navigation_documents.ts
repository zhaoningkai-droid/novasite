import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_navigation_locale_code" AS ENUM('en', 'zh', 'ru', 'id');
  CREATE TABLE "site_navigation_items_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_navigation_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_navigation_quick_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar DEFAULT '主导航' NOT NULL,
  	"locale_code" "enum_site_navigation_locale_code" NOT NULL,
  	"footer_intro" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants_site_navigation_children_locales" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "tenants_site_navigation_locales" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "tenants_fixed_pages_footer_quick_links_locales" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "site_navigation_id" integer;
  ALTER TABLE "site_navigation_items_children" ADD CONSTRAINT "site_navigation_items_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_navigation_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_navigation_items" ADD CONSTRAINT "site_navigation_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_navigation_quick_links" ADD CONSTRAINT "site_navigation_quick_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_navigation" ADD CONSTRAINT "site_navigation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_navigation_items_children_order_idx" ON "site_navigation_items_children" USING btree ("_order");
  CREATE INDEX "site_navigation_items_children_parent_id_idx" ON "site_navigation_items_children" USING btree ("_parent_id");
  CREATE INDEX "site_navigation_items_order_idx" ON "site_navigation_items" USING btree ("_order");
  CREATE INDEX "site_navigation_items_parent_id_idx" ON "site_navigation_items" USING btree ("_parent_id");
  CREATE INDEX "site_navigation_quick_links_order_idx" ON "site_navigation_quick_links" USING btree ("_order");
  CREATE INDEX "site_navigation_quick_links_parent_id_idx" ON "site_navigation_quick_links" USING btree ("_parent_id");
  CREATE INDEX "site_navigation_tenant_idx" ON "site_navigation" USING btree ("tenant_id");
  CREATE INDEX "site_navigation_updated_at_idx" ON "site_navigation" USING btree ("updated_at");
  CREATE INDEX "site_navigation_created_at_idx" ON "site_navigation" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_site_navigation_fk" FOREIGN KEY ("site_navigation_id") REFERENCES "public"."site_navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_site_navigation_id_idx" ON "payload_locked_documents_rels" USING btree ("site_navigation_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_navigation_items_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_navigation_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_navigation_quick_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_navigation" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "site_navigation_items_children" CASCADE;
  DROP TABLE "site_navigation_items" CASCADE;
  DROP TABLE "site_navigation_quick_links" CASCADE;
  DROP TABLE "site_navigation" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_site_navigation_fk";
  
  DROP INDEX "payload_locked_documents_rels_site_navigation_id_idx";
  ALTER TABLE "tenants_site_navigation_children_locales" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "tenants_site_navigation_locales" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "tenants_fixed_pages_footer_quick_links_locales" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "site_navigation_id";
  DROP TYPE "public"."enum_site_navigation_locale_code";`)
}
