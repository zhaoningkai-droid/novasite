import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "tenants_fixed_pages_about_modules" ("_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL, "image_id" integer, "sort_order" numeric DEFAULT 0);
    CREATE TABLE "tenants_fixed_pages_about_modules_locales" ("title" varchar NOT NULL, "description" varchar NOT NULL, "id" serial PRIMARY KEY NOT NULL, "_locale" "_locales" NOT NULL, "_parent_id" varchar NOT NULL);
    ALTER TABLE "tenants_fixed_pages_about_modules" ADD CONSTRAINT "tenants_about_modules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "tenants_fixed_pages_about_modules" ADD CONSTRAINT "tenants_about_modules_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "tenants_fixed_pages_about_modules_locales" ADD CONSTRAINT "tenants_about_modules_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants_fixed_pages_about_modules"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "tenants_about_modules_order_idx" ON "tenants_fixed_pages_about_modules" USING btree ("_order");
    CREATE INDEX "tenants_about_modules_parent_id_idx" ON "tenants_fixed_pages_about_modules" USING btree ("_parent_id");
    CREATE UNIQUE INDEX "tenants_about_modules_locales_locale_parent_unique" ON "tenants_fixed_pages_about_modules_locales" USING btree ("_locale", "_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "tenants_fixed_pages_about_modules_locales" CASCADE;
    DROP TABLE "tenants_fixed_pages_about_modules" CASCADE;
  `)
}
