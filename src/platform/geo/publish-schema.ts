export const geoPublishSchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.publish_intents(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,article_id uuid NOT NULL,article_version integer NOT NULL,
 collection text NOT NULL CHECK(collection IN ('news','posts')),locale text NOT NULL,input_hash text NOT NULL,
 snapshot jsonb NOT NULL,target jsonb NOT NULL,publish_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','published','failed','unknown','cancelled')),
 actor_id integer NOT NULL,attempts integer NOT NULL DEFAULT 0,lease_owner uuid,lease_until timestamptz,
 target_id integer,target_url text,error_code text,message text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,article_id,article_version)
   REFERENCES platform_geo.article_revisions(tenant_id,article_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS geo_publish_target_unique ON platform_geo.publish_intents
 (tenant_id,article_id,article_version,collection,locale) WHERE state<>'cancelled';
CREATE INDEX IF NOT EXISTS geo_publish_due ON platform_geo.publish_intents(state,publish_at);
CREATE UNIQUE INDEX IF NOT EXISTS geo_publish_running_tenant ON platform_geo.publish_intents(tenant_id) WHERE state='running';
CREATE TABLE IF NOT EXISTS platform_geo.publish_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id integer NOT NULL,intent_id uuid NOT NULL,
 event text NOT NULL,actor_id integer NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,intent_id) REFERENCES platform_geo.publish_intents(tenant_id,id)
);
`
