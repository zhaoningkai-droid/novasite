import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "news" ADD COLUMN "featured" boolean DEFAULT false;
    ALTER TABLE "news" ADD COLUMN "sort_order" numeric DEFAULT 0;
    ALTER TABLE "_news_v" ADD COLUMN "version_featured" boolean DEFAULT false;
    ALTER TABLE "_news_v" ADD COLUMN "version_sort_order" numeric DEFAULT 0;
    CREATE INDEX "news_sort_order_idx" ON "news" USING btree ("sort_order");
    CREATE INDEX "_news_v_version_sort_order_idx" ON "_news_v" USING btree ("version_sort_order");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "news_sort_order_idx";
    DROP INDEX "_news_v_version_sort_order_idx";
    ALTER TABLE "news" DROP COLUMN "featured";
    ALTER TABLE "news" DROP COLUMN "sort_order";
    ALTER TABLE "_news_v" DROP COLUMN "version_featured";
    ALTER TABLE "_news_v" DROP COLUMN "version_sort_order";
  `)
}
