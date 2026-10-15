import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Fresh installations must match the existing account and locale model.
 * Adds no template-specific setting, and never removes saved customer data. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expires_at" timestamp(3) with time zone`)
  for (const type of [
    '_locales', 'enum__cases_v_published_locale', 'enum__news_v_published_locale',
    'enum__pages_v_published_locale', 'enum__posts_v_published_locale',
    'enum__products_v_published_locale', 'enum_product_specifications_locale_code',
    'enum_tenants_default_locale', 'enum_tenants_enabled_locales',
  ]) {
    for (const locale of ['es', 'ar', 'de']) {
      // Both identifiers and labels are fixed migration constants, not request data.
      await db.execute(sql.raw(`ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS '${locale}'`))
    }
  }
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Retain account expiry and locale values when downgrading application code.
}
