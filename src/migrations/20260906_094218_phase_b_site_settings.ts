import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" ADD COLUMN "branding_favicon_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "contact_phone" varchar;
  ALTER TABLE "tenants" ADD COLUMN "contact_wechat_q_r_code_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "contact_whatsapp_q_r_code_id" integer;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_wechat_q_r_code_id_media_id_fk" FOREIGN KEY ("contact_wechat_q_r_code_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_whatsapp_q_r_code_id_media_id_fk" FOREIGN KEY ("contact_whatsapp_q_r_code_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tenants_branding_branding_favicon_idx" ON "tenants" USING btree ("branding_favicon_id");
  CREATE INDEX "tenants_contact_contact_wechat_q_r_code_idx" ON "tenants" USING btree ("contact_wechat_q_r_code_id");
  CREATE INDEX "tenants_contact_contact_whatsapp_q_r_code_idx" ON "tenants" USING btree ("contact_whatsapp_q_r_code_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" DROP CONSTRAINT "tenants_branding_favicon_id_media_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_contact_wechat_q_r_code_id_media_id_fk";
  
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_contact_whatsapp_q_r_code_id_media_id_fk";
  
  DROP INDEX "tenants_branding_branding_favicon_idx";
  DROP INDEX "tenants_contact_contact_wechat_q_r_code_idx";
  DROP INDEX "tenants_contact_contact_whatsapp_q_r_code_idx";
  ALTER TABLE "tenants" DROP COLUMN "branding_favicon_id";
  ALTER TABLE "tenants" DROP COLUMN "contact_phone";
  ALTER TABLE "tenants" DROP COLUMN "contact_wechat_q_r_code_id";
  ALTER TABLE "tenants" DROP COLUMN "contact_whatsapp_q_r_code_id";`)
}
