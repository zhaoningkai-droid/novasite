/** Isolated schema, following platform_jobs. No public customer tables are altered. */
export const geoKeywordsSchemaSQL = `
  CREATE SCHEMA IF NOT EXISTS platform_geo;
  CREATE TABLE IF NOT EXISTS platform_geo.optimizations (
    id uuid PRIMARY KEY,
    tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    brand varchar(50) NOT NULL,
    normalized_brand varchar(100) NOT NULL,
    aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aliases)='array'),
    core varchar(50) NOT NULL,
    normalized_core varchar(100) NOT NULL,
    terms jsonb NOT NULL CHECK (CASE WHEN jsonb_typeof(terms)='array'
      THEN jsonb_array_length(terms)=10 ELSE false END),
    website varchar(2048) NOT NULL,
    blog varchar(2048) NOT NULL DEFAULT '',
    term_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(term_links)='array'),
    version integer NOT NULL DEFAULT 1 CHECK (version>0),
    created_by integer NOT NULL,
    updated_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT geo_optimization_company_id UNIQUE(tenant_id,id),
    CONSTRAINT geo_optimization_company_terms UNIQUE(tenant_id,normalized_brand,normalized_core)
  );
  ALTER TABLE platform_geo.optimizations
    ADD COLUMN IF NOT EXISTS term_links jsonb NOT NULL DEFAULT '[]'::jsonb
      CHECK (jsonb_typeof(term_links)='array');
  CREATE INDEX IF NOT EXISTS geo_optimization_company_updated
    ON platform_geo.optimizations(tenant_id,updated_at DESC,id);
  CREATE TABLE IF NOT EXISTS platform_geo.optimization_revisions (
    tenant_id integer NOT NULL,
    optimization_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    actor_id integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(tenant_id,optimization_id,version),
    FOREIGN KEY(tenant_id,optimization_id)
      REFERENCES platform_geo.optimizations(tenant_id,id) ON DELETE CASCADE
  );
`
