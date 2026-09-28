import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "cases" ADD COLUMN "featured" boolean DEFAULT false;
    ALTER TABLE "cases" ADD COLUMN "sort_order" numeric DEFAULT 0;
    ALTER TABLE "_cases_v" ADD COLUMN "version_featured" boolean DEFAULT false;
    ALTER TABLE "_cases_v" ADD COLUMN "version_sort_order" numeric DEFAULT 0;
    CREATE INDEX "cases_sort_order_idx" ON "cases" USING btree ("sort_order");
    CREATE INDEX "_cases_v_version_sort_order_idx" ON "_cases_v" USING btree ("version_sort_order");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "cases_sort_order_idx";
    DROP INDEX "_cases_v_version_sort_order_idx";
    ALTER TABLE "cases" DROP COLUMN "featured";
    ALTER TABLE "cases" DROP COLUMN "sort_order";
    ALTER TABLE "_cases_v" DROP COLUMN "version_featured";
    ALTER TABLE "_cases_v" DROP COLUMN "version_sort_order";
  `)
}
