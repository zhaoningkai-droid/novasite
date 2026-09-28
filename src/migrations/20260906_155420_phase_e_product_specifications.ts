import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_product_specifications_locale_code" AS ENUM('en', 'zh', 'ru', 'id');
  CREATE TABLE "product_specifications_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"group" varchar
  );
  
  CREATE TABLE "product_specifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"product_id" integer NOT NULL,
  	"locale_code" "enum_product_specifications_locale_code" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_specifications_id" integer;
  ALTER TABLE "product_specifications_items" ADD CONSTRAINT "product_specifications_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_specifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "product_specifications_items_order_idx" ON "product_specifications_items" USING btree ("_order");
  CREATE INDEX "product_specifications_items_parent_id_idx" ON "product_specifications_items" USING btree ("_parent_id");
  CREATE INDEX "product_specifications_tenant_idx" ON "product_specifications" USING btree ("tenant_id");
  CREATE INDEX "product_specifications_product_idx" ON "product_specifications" USING btree ("product_id");
  CREATE INDEX "product_specifications_locale_code_idx" ON "product_specifications" USING btree ("locale_code");
  CREATE INDEX "product_specifications_updated_at_idx" ON "product_specifications" USING btree ("updated_at");
  CREATE INDEX "product_specifications_created_at_idx" ON "product_specifications" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_specifications_fk" FOREIGN KEY ("product_specifications_id") REFERENCES "public"."product_specifications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_product_specifications_id_idx" ON "payload_locked_documents_rels" USING btree ("product_specifications_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_specifications_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_specifications" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "product_specifications_items" CASCADE;
  DROP TABLE "product_specifications" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_specifications_fk";
  
  DROP INDEX "payload_locked_documents_rels_product_specifications_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_specifications_id";
  DROP TYPE "public"."enum_product_specifications_locale_code";`)
}
