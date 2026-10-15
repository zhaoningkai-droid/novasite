import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE tenants_locales ADD COLUMN IF NOT EXISTS branding_header_text varchar;
    CREATE SEQUENCE IF NOT EXISTS site_navigation_item_translation_key_seq MINVALUE 1 MAXVALUE 67108862;
    ALTER TABLE site_navigation_items ADD COLUMN IF NOT EXISTS sort_order numeric;
    ALTER TABLE site_navigation_items ADD COLUMN IF NOT EXISTS translation_key numeric DEFAULT nextval('site_navigation_item_translation_key_seq');
    ALTER TABLE site_navigation_items ADD COLUMN IF NOT EXISTS modified_at timestamp(3) with time zone;
    UPDATE site_navigation_items SET sort_order = CASE WHEN _order = 1 THEN 99 ELSE GREATEST(0, 100 - _order * 10) END WHERE sort_order IS NULL;
    UPDATE site_navigation_items SET translation_key = nextval('site_navigation_item_translation_key_seq') WHERE translation_key IS NULL;
    UPDATE site_navigation_items AS item SET modified_at = nav.updated_at FROM site_navigation AS nav WHERE nav.id = item._parent_id AND item.modified_at IS NULL;
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('此迁移保存客户的 Logo 展示文字和导航排序，不提供删除字段的自动回滚；可恢复旧应用版本并保留新增字段。')
}
