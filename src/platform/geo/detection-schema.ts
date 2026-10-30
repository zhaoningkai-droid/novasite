/** 第一步只保存任务和本地验收证据，不启动外部模型调用。 */
export const geoDetectionSchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.detection_runs (
 id uuid PRIMARY KEY, tenant_id integer NOT NULL, actor_id integer NOT NULL,
 request_id uuid NOT NULL, input_hash text NOT NULL, name varchar(100) NOT NULL,
 optimization_id uuid NOT NULL, optimization_version integer NOT NULL,
 config_snapshot jsonb NOT NULL, questions_snapshot jsonb NOT NULL,
 source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 mode text NOT NULL DEFAULT 'storage_test' CHECK(mode='storage_test'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id),
 FOREIGN KEY(tenant_id,optimization_id,optimization_version)
 REFERENCES platform_geo.optimization_revisions(tenant_id,optimization_id,version),
 CHECK(jsonb_typeof(questions_snapshot)='array')
);
CREATE INDEX IF NOT EXISTS geo_detection_runs_recent
 ON platform_geo.detection_runs(tenant_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS platform_geo.detection_jobs (
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,run_id uuid NOT NULL,
 question_id uuid NOT NULL,question_snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','evidence_saved')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,run_id,question_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES platform_geo.detection_runs(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_detection_jobs_run
 ON platform_geo.detection_jobs(tenant_id,run_id,created_at,id);
CREATE TABLE IF NOT EXISTS platform_geo.detection_attempts (
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,job_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id integer NOT NULL,
 provider text NOT NULL CHECK(provider='local_fixture'),
 surface text NOT NULL CHECK(surface='local_test'),
 model text NOT NULL DEFAULT 'storage-fixture-v1',
 evidence_origin text NOT NULL CHECK(evidence_origin='synthetic_fixture'),
 raw_answer text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,request_id),UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES platform_geo.detection_jobs(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS platform_geo.detection_evidence (
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,attempt_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('request','response')),
 content_type text NOT NULL DEFAULT 'application/json',
 payload bytea NOT NULL,byte_length integer NOT NULL CHECK(byte_length>0),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,attempt_id,kind),
 FOREIGN KEY(tenant_id,attempt_id) REFERENCES platform_geo.detection_attempts(tenant_id,id),
 CHECK(octet_length(payload)=byte_length),CHECK(byte_length<=5242880)
);
CREATE TABLE IF NOT EXISTS platform_geo.detection_citations (
 id uuid PRIMARY KEY,tenant_id integer NOT NULL,attempt_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>=0),
 original_url text NOT NULL,title text NOT NULL,
 answer_start integer NOT NULL CHECK(answer_start>=0),
 answer_end integer NOT NULL CHECK(answer_end>answer_start),
 quoted_segment text NOT NULL,provider_pointer text NOT NULL,
 offset_unit text NOT NULL DEFAULT 'utf16' CHECK(offset_unit='utf16'),
 evidence_origin text NOT NULL CHECK(evidence_origin='synthetic_fixture'),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,attempt_id,ordinal),
 FOREIGN KEY(tenant_id,attempt_id) REFERENCES platform_geo.detection_attempts(tenant_id,id)
);
CREATE OR REPLACE FUNCTION platform_geo.prevent_detection_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Detection evidence is append-only' USING ERRCODE='55000';
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['detection_runs','detection_attempts','detection_evidence','detection_citations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('platform_geo.'||t)::regclass
    AND tgname='geo_detection_append_only') THEN
   EXECUTE format('CREATE TRIGGER geo_detection_append_only BEFORE UPDATE OR DELETE ON platform_geo.%I
     FOR EACH ROW EXECUTE FUNCTION platform_geo.prevent_detection_evidence_mutation()',t);
  END IF;
 END LOOP;
END $$;
`
