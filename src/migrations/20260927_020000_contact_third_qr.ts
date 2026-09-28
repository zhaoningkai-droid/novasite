import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "contact_wechat_international_q_r_code_id" integer;
    CREATE INDEX IF NOT EXISTS "tenants_contact_wechat_international_q_r_code_idx"
      ON "tenants" USING btree ("contact_wechat_international_q_r_code_id");
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_contact_wechat_international_q_r_code_id_media_id_fk') THEN
        ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_wechat_international_q_r_code_id_media_id_fk"
          FOREIGN KEY ("contact_wechat_international_q_r_code_id") REFERENCES "media"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "contact_wechat_international_q_r_code_id";`)
}
