import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Add the languages already supported by the shared site locale model to navigation storage. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_site_navigation_locale_code" ADD VALUE IF NOT EXISTS 'es'`)
  await db.execute(sql`ALTER TYPE "public"."enum_site_navigation_locale_code" ADD VALUE IF NOT EXISTS 'ar'`)
  await db.execute(sql`ALTER TYPE "public"."enum_site_navigation_locale_code" ADD VALUE IF NOT EXISTS 'de'`)
}

/** PostgreSQL enum labels are retained on rollback to avoid invalidating saved navigation rows. */
export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Intentionally non-destructive: downgrade code can ignore these additive labels safely.
}
