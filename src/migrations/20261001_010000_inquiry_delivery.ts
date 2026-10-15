import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** Add internal delivery records; never alter or replace existing customer tables. */
export const inquiryDeliverySchemaSQL = `
  CREATE SCHEMA IF NOT EXISTS platform_jobs;
  CREATE TABLE IF NOT EXISTS platform_jobs.inquiry_requests (
    tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    request_key uuid NOT NULL,
    fingerprint varchar(64) NOT NULL,
    client_hash varchar(64) NOT NULL,
    lead_id integer REFERENCES public.leads(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, request_key)
  );
  CREATE INDEX IF NOT EXISTS inquiry_request_rate_window
    ON platform_jobs.inquiry_requests(tenant_id,client_hash,created_at);
  CREATE TABLE IF NOT EXISTS platform_jobs.inquiry_notifications (
    id uuid PRIMARY KEY,
    tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    lead_id integer NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
    status varchar(16) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','sending','retry','accepted','failed','ambiguous','disabled')),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_owner uuid,
    lease_until timestamptz,
    error_code varchar(64),
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS inquiry_notification_pending
    ON platform_jobs.inquiry_notifications(status,next_attempt_at,created_at);
  CREATE INDEX IF NOT EXISTS inquiry_notification_company
    ON platform_jobs.inquiry_notifications(tenant_id,created_at DESC);
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(inquiryDeliverySchemaSQL))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Disable persistence/notifications and stop workers first. Retain deduplication
  // tombstones, inquiries and history; a schema rollback must not erase customer data.
  await db.execute(sql`UPDATE platform_jobs.inquiry_notifications SET status='ambiguous',error_code='WORKER_STOPPED',lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE status='sending'`)
}
