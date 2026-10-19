export const geoPlanSchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.publish_plans(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 version integer NOT NULL DEFAULT 1,config jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('draft','active','paused','ended')) DEFAULT 'draft',
 next_run_at timestamptz,last_run_at timestamptz,actor_id integer NOT NULL,
 dispatch_owner uuid,dispatch_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 UNIQUE(tenant_id,id)
);
ALTER TABLE platform_geo.publish_plans ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS geo_publish_plan_due ON platform_geo.publish_plans(state,next_run_at)
 WHERE state='active';
CREATE INDEX IF NOT EXISTS geo_publish_plan_tenant_active_updated
 ON platform_geo.publish_plans(tenant_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS platform_geo.publish_plan_runs(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,plan_id uuid NOT NULL,plan_version integer NOT NULL,
 scheduled_at timestamptz NOT NULL,state text NOT NULL CHECK(state IN
 ('preparing','awaiting_review','queued','completed','partial','empty','failed','cancelled','skipped')),
 message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,plan_id,scheduled_at),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES platform_geo.publish_plans(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_publish_plan_runs_recent ON platform_geo.publish_plan_runs(tenant_id,plan_id,scheduled_at DESC);
CREATE TABLE IF NOT EXISTS platform_geo.publish_plan_items(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,run_id uuid NOT NULL,article_id uuid NOT NULL,article_version integer NOT NULL,
 target jsonb NOT NULL,target_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('awaiting_review','queued','published','failed','unknown','skipped','cancelled')),
 intent_id uuid,message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES platform_geo.publish_plan_runs(tenant_id,id),
 FOREIGN KEY(tenant_id,article_id,article_version) REFERENCES platform_geo.article_revisions(tenant_id,article_id,version),
 FOREIGN KEY(tenant_id,intent_id) REFERENCES platform_geo.publish_intents(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_publish_plan_items_run ON platform_geo.publish_plan_items(tenant_id,run_id,created_at,id);
CREATE UNIQUE INDEX IF NOT EXISTS geo_publish_plan_item_intent ON platform_geo.publish_plan_items(tenant_id,intent_id)
 WHERE intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS geo_publish_plan_item_article_target ON platform_geo.publish_plan_items
 (tenant_id,article_id,article_version,target_key) WHERE state NOT IN ('cancelled','skipped');
CREATE TABLE IF NOT EXISTS platform_geo.publish_plan_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id integer NOT NULL,plan_id uuid NOT NULL,run_id uuid,
 item_id uuid,actor_id integer NOT NULL,event text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES platform_geo.publish_plans(tenant_id,id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES platform_geo.publish_plan_runs(tenant_id,id),
 FOREIGN KEY(tenant_id,item_id) REFERENCES platform_geo.publish_plan_items(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_publish_plan_events_recent ON platform_geo.publish_plan_events(tenant_id,plan_id,created_at DESC);
`
