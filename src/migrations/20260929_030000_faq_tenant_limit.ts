import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION enforce_faq_tenant_limit()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      existing_count integer;
    BEGIN
      IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
      END IF;

      PERFORM 1 FROM "tenants" WHERE "id" = NEW.tenant_id FOR UPDATE;
      SELECT count(*) INTO existing_count FROM "faqs" WHERE "tenant_id" = NEW.tenant_id;
      IF existing_count >= 25 THEN
        RAISE EXCEPTION 'Each company can have at most 25 FAQs.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS "faqs_tenant_limit_trigger" ON "faqs";
    CREATE TRIGGER "faqs_tenant_limit_trigger"
      BEFORE INSERT ON "faqs"
      FOR EACH ROW EXECUTE FUNCTION enforce_faq_tenant_limit();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "faqs_tenant_limit_trigger" ON "faqs";
    DROP FUNCTION IF EXISTS enforce_faq_tenant_limit();
  `)
}
