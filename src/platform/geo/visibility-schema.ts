export const geoVisibilitySchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.tracking_sets(
 tenant_id integer NOT NULL,optimization_id uuid NOT NULL,version integer NOT NULL DEFAULT 1,
 questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(questions)='array'),
 actor_id integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,optimization_id),
 FOREIGN KEY(tenant_id,optimization_id) REFERENCES platform_geo.optimizations(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS platform_geo.observation_batches(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,request_id uuid NOT NULL,input_hash text NOT NULL,optimization_id uuid NOT NULL,
 optimization_version integer NOT NULL,question_set_version integer NOT NULL,
 question_set_snapshot jsonb NOT NULL,optimization_snapshot jsonb NOT NULL,
 platform text NOT NULL,model text NOT NULL DEFAULT '',
 browsing_mode text NOT NULL CHECK(browsing_mode IN ('connected','disconnected','unknown')),
 language text NOT NULL,region text NOT NULL,method text NOT NULL DEFAULT 'manual' CHECK(method='manual'),
 actor_id integer NOT NULL,sampled_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,optimization_id) REFERENCES platform_geo.optimizations(tenant_id,id),
 CONSTRAINT geo_observation_revision_fk FOREIGN KEY(tenant_id,optimization_id,optimization_version)
   REFERENCES platform_geo.optimization_revisions(tenant_id,optimization_id,version)
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_observation_revision_fk'
   AND conrelid='platform_geo.observation_batches'::regclass) THEN
   ALTER TABLE platform_geo.observation_batches ADD CONSTRAINT geo_observation_revision_fk
     FOREIGN KEY(tenant_id,optimization_id,optimization_version)
     REFERENCES platform_geo.optimization_revisions(tenant_id,optimization_id,version);
 END IF;
END $$;
ALTER TABLE platform_geo.observation_batches ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE platform_geo.observation_batches ADD COLUMN IF NOT EXISTS input_hash text;
UPDATE platform_geo.observation_batches SET request_id=id WHERE request_id IS NULL;
UPDATE platform_geo.observation_batches SET input_hash='legacy:'||id::text WHERE input_hash IS NULL;
ALTER TABLE platform_geo.observation_batches ALTER COLUMN request_id SET NOT NULL;
ALTER TABLE platform_geo.observation_batches ALTER COLUMN input_hash SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS geo_observation_request_unique
 ON platform_geo.observation_batches(tenant_id,request_id);
CREATE INDEX IF NOT EXISTS geo_observation_batches_recent
 ON platform_geo.observation_batches(tenant_id,optimization_id,sampled_at DESC);
CREATE TABLE IF NOT EXISTS platform_geo.observations(
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,batch_id uuid NOT NULL,question_id uuid NOT NULL,
 question text NOT NULL,query_type text NOT NULL CHECK(query_type IN ('brand_self','discovery')),
 result_state text NOT NULL CHECK(result_state IN ('detected','not_mentioned','failed')),
 raw_answer text NOT NULL DEFAULT '',matched_aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
 recommendation_context text NOT NULL CHECK(recommendation_context IN
   ('recommended','mentioned','not_recommended','unclear','not_applicable')),
 grounding_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
 citations jsonb NOT NULL DEFAULT '[]'::jsonb,
 failure_message text NOT NULL DEFAULT '',actor_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES platform_geo.observation_batches(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_observations_recent
 ON platform_geo.observations(tenant_id,batch_id,created_at DESC);
`
