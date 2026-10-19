export const geoArticleSchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.generation_requests(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 task_id uuid NOT NULL,task_version integer NOT NULL,input_hash text NOT NULL,actor_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,task_id,task_version) REFERENCES platform_geo.task_revisions(tenant_id,task_id,version)
);
CREATE TABLE IF NOT EXISTS platform_geo.generation_jobs(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,request_id uuid NOT NULL,task_id uuid NOT NULL,task_version integer NOT NULL,
 question_id uuid NOT NULL,dedup_key text NOT NULL,context jsonb NOT NULL,execution jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','unknown')),
 actor_id integer NOT NULL,lease_owner uuid,lease_until timestamptz,current_attempt uuid,error_code text,message text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,dedup_key),UNIQUE(tenant_id,request_id,question_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES platform_geo.generation_requests(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,task_id,task_version) REFERENCES platform_geo.task_revisions(tenant_id,task_id,version)
);
CREATE INDEX IF NOT EXISTS geo_generation_queue ON platform_geo.generation_jobs(state,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS geo_generation_one_tenant ON platform_geo.generation_jobs(tenant_id) WHERE state='running';
CREATE TABLE IF NOT EXISTS platform_geo.generation_attempts(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,job_id uuid NOT NULL,actor_id integer NOT NULL,model text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','unknown')),usage jsonb,error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 FOREIGN KEY(tenant_id,job_id) REFERENCES platform_geo.generation_jobs(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS geo_generation_usage ON platform_geo.generation_attempts(tenant_id,started_at);
CREATE TABLE IF NOT EXISTS platform_geo.articles(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,job_id uuid,task_id uuid,task_version integer,
 question_id uuid,context jsonb NOT NULL,title text NOT NULL,summary text NOT NULL,html text NOT NULL,
 status text NOT NULL CHECK(status IN ('needs_edit','ready')),validation jsonb NOT NULL,warnings jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,review_note text NOT NULL DEFAULT '',reviewed_by integer,reviewed_at timestamptz,
 updated_by integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES platform_geo.generation_jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,task_id,task_version) REFERENCES platform_geo.task_revisions(tenant_id,task_id,version)
);
CREATE INDEX IF NOT EXISTS geo_articles_tenant_updated ON platform_geo.articles(tenant_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_geo.article_revisions(
 tenant_id integer NOT NULL,article_id uuid NOT NULL,version integer NOT NULL,snapshot jsonb NOT NULL,
 actor_id integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,article_id,version),
 FOREIGN KEY(tenant_id,article_id) REFERENCES platform_geo.articles(tenant_id,id) ON DELETE CASCADE
);
`
