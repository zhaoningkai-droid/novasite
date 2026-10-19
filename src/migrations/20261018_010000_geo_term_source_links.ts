import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

/** Adds the per-customer, per-term citation URLs without rewriting existing GEO data. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE platform_geo.optimizations
      ADD COLUMN IF NOT EXISTS term_links jsonb NOT NULL DEFAULT '[]'::jsonb;
  `)
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'geo_optimization_term_links_array'
          AND conrelid = 'platform_geo.optimizations'::regclass
      ) THEN
        ALTER TABLE platform_geo.optimizations
          ADD CONSTRAINT geo_optimization_term_links_array
          CHECK (jsonb_typeof(term_links) = 'array');
      END IF;
    END $$;
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('回退应用时保留客户GEO子链接配置，不自动删除GEO数据。')
}
