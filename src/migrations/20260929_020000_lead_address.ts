import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "address" varchar(300);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const populated = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM "leads" WHERE "address" IS NOT NULL AND "address" <> '' LIMIT 1
    ) AS "has_data"
  `)
  const rows = Array.isArray(populated)
    ? populated
    : (populated as { rows?: Array<{ has_data?: boolean }> }).rows || []
  if (rows.some((row) => row.has_data)) {
    throw new Error(
      'Inquiry records contain visitor addresses. Export and preserve them before rolling back this migration.',
    )
  }

  await db.execute(sql`ALTER TABLE "leads" DROP COLUMN IF EXISTS "address";`)
}
