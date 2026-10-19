/** Only additive GEO tables. Existing tenant/media/content tables are never modified. */
export const geoTaskSchemaSQL = `
CREATE TABLE IF NOT EXISTS platform_geo.creation_tasks (
 id uuid PRIMARY KEY, tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 optimization_id uuid NOT NULL, material_group_id uuid NOT NULL,
 name text NOT NULL, settings jsonb NOT NULL, snapshot jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('ready','waiting_sources')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by integer NOT NULL, updated_by integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,optimization_id) REFERENCES platform_geo.optimizations(tenant_id,id),
 FOREIGN KEY(tenant_id,material_group_id) REFERENCES platform_geo.material_groups(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_tasks_tenant_updated ON platform_geo.creation_tasks(tenant_id,updated_at DESC);
ALTER TABLE platform_geo.creation_tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS geo_tasks_tenant_active_updated
 ON platform_geo.creation_tasks(tenant_id,updated_at DESC) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS platform_geo.task_revisions (
 tenant_id integer NOT NULL, task_id uuid NOT NULL, version integer NOT NULL,
 settings jsonb NOT NULL, snapshot jsonb NOT NULL, status text NOT NULL,
 actor_id integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,task_id,version),
 FOREIGN KEY(tenant_id,task_id) REFERENCES platform_geo.creation_tasks(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS platform_geo.ai_operations (
 id uuid PRIMARY KEY, tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 optimization_id uuid NOT NULL, optimization_version integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('expand','translate')),
 input_hash text NOT NULL, input jsonb NOT NULL, result jsonb,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','unknown')),
 model text NOT NULL, usage jsonb, error_code text, actor_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 FOREIGN KEY(tenant_id,optimization_id) REFERENCES platform_geo.optimizations(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS geo_ai_tenant_created ON platform_geo.ai_operations(tenant_id,created_at DESC);
`
