import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export const partialTenantLocalesSQL = `
  ALTER TABLE public.tenants_locales ALTER COLUMN branding_company_name DROP NOT NULL;
  ALTER TABLE public.tenants_fixed_pages_homepage_strength_items_locales ALTER COLUMN label DROP NOT NULL;
  ALTER TABLE public.tenants_fixed_pages_about_modules_locales
    ALTER COLUMN title DROP NOT NULL,
    ALTER COLUMN description DROP NOT NULL;
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`SET LOCAL lock_timeout = '5s'`)
  await db.execute(sql.raw(partialTenantLocalesSQL))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The previous application can read partial locales. Restoring NOT NULL would
  // require filling missing translations and must be a separate data decision.
}
