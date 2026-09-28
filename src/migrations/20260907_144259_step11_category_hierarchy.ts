import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "case_categories" ADD COLUMN "parent_id" integer;
  ALTER TABLE "news_categories" ADD COLUMN "parent_id" integer;
  ALTER TABLE "categories" ADD COLUMN "sort_order" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "case_categories" ADD CONSTRAINT "case_categories_parent_id_case_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."case_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_parent_id_news_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."news_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "case_categories_parent_idx" ON "case_categories" USING btree ("parent_id");
  CREATE INDEX "news_categories_parent_idx" ON "news_categories" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "case_categories" DROP CONSTRAINT "case_categories_parent_id_case_categories_id_fk";
  
  ALTER TABLE "news_categories" DROP CONSTRAINT "news_categories_parent_id_news_categories_id_fk";
  
  DROP INDEX "case_categories_parent_idx";
  DROP INDEX "news_categories_parent_idx";
  ALTER TABLE "case_categories" DROP COLUMN "parent_id";
  ALTER TABLE "news_categories" DROP COLUMN "parent_id";
  ALTER TABLE "categories" DROP COLUMN "sort_order";`)
}
