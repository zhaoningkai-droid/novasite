import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Register the reusable template in the shared catalog without creating or changing tenants. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "templates" (
      "name",
      "key",
      "version",
      "schema_version",
      "industry",
      "description",
      "visual_hero_style",
      "visual_card_style",
      "visual_navigation_style",
      "status"
    ) VALUES (
      '商务工业 · 专业',
      'executive-industrial-pro-v1',
      '1.0.0',
      1,
      'general-b2b',
      '古建场景演示与多页面工业网站展示。演示资料与客户站点数据相互隔离。',
      'industrial',
      'elevated',
      'dark',
      'published'
    )
    ON CONFLICT ("key") DO NOTHING;

    WITH registered_template AS (
      SELECT "id" FROM "templates" WHERE "key" = 'executive-industrial-pro-v1'
    )
    INSERT INTO "templates_capabilities" ("order", "parent_id", "value")
    SELECT capability."order", registered_template."id", capability."value"::"enum_templates_capabilities"
    FROM registered_template
    CROSS JOIN (VALUES
      (0, 'products'),
      (1, 'blog'),
      (2, 'news'),
      (3, 'cases'),
      (4, 'rfq'),
      (5, 'seo'),
      (6, 'multilingual')
    ) AS capability("order", "value")
    WHERE NOT EXISTS (
      SELECT 1
      FROM "templates_capabilities" AS existing_capability
      WHERE existing_capability."parent_id" = registered_template."id"
        AND existing_capability."value"::text = capability."value"
    );
  `)
}

/** Keep the catalog record on rollback because it may already be referenced by tenant sites. */
export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // This data migration is intentionally non-destructive. Remove a template only through the
  // template library's lifecycle controls, where tenant and history references can be checked.
}
