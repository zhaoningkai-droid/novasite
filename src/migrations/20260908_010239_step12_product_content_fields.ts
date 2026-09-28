import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "products_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "products_tags_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "_products_v_version_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_tags_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "products" ADD COLUMN "sort_order" numeric DEFAULT 0;
  ALTER TABLE "products_locales" ADD COLUMN "detail_h_t_m_l" varchar;
  ALTER TABLE "products_locales" ADD COLUMN "keywords" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_sort_order" numeric DEFAULT 0;
  ALTER TABLE "_products_v_locales" ADD COLUMN "version_detail_h_t_m_l" varchar;
  ALTER TABLE "_products_v_locales" ADD COLUMN "version_keywords" varchar;
  ALTER TABLE "products_tags" ADD CONSTRAINT "products_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_tags_locales" ADD CONSTRAINT "products_tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_tags" ADD CONSTRAINT "_products_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_tags_locales" ADD CONSTRAINT "_products_v_version_tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v_version_tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_tags_order_idx" ON "products_tags" USING btree ("_order");
  CREATE INDEX "products_tags_parent_id_idx" ON "products_tags" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_tags_locales_locale_parent_id_unique" ON "products_tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_version_tags_order_idx" ON "_products_v_version_tags" USING btree ("_order");
  CREATE INDEX "_products_v_version_tags_parent_id_idx" ON "_products_v_version_tags" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_products_v_version_tags_locales_locale_parent_id_unique" ON "_products_v_version_tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_sort_order_idx" ON "products" USING btree ("sort_order");
  CREATE INDEX "_products_v_version_version_sort_order_idx" ON "_products_v" USING btree ("version_sort_order");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_tags_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_tags_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_tags" CASCADE;
  DROP TABLE "products_tags_locales" CASCADE;
  DROP TABLE "_products_v_version_tags" CASCADE;
  DROP TABLE "_products_v_version_tags_locales" CASCADE;
  DROP INDEX "products_sort_order_idx";
  DROP INDEX "_products_v_version_version_sort_order_idx";
  ALTER TABLE "products" DROP COLUMN "sort_order";
  ALTER TABLE "products_locales" DROP COLUMN "detail_h_t_m_l";
  ALTER TABLE "products_locales" DROP COLUMN "keywords";
  ALTER TABLE "_products_v" DROP COLUMN "version_sort_order";
  ALTER TABLE "_products_v_locales" DROP COLUMN "version_detail_h_t_m_l";
  ALTER TABLE "_products_v_locales" DROP COLUMN "version_keywords";`)
}
