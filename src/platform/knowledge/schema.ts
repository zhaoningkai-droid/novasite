/** Additive, tenant-owned storage; never alters customer CMS or GEO tables. */
export const knowledgeSchemaSQL = `
CREATE SCHEMA IF NOT EXISTS platform_knowledge;
CREATE TABLE IF NOT EXISTS platform_knowledge.bases (
 tenant_id integer PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 id uuid NOT NULL UNIQUE, name text NOT NULL, intro text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, updated_by integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_knowledge.documents (
 id uuid PRIMARY KEY, tenant_id integer NOT NULL REFERENCES platform_knowledge.bases(tenant_id) ON DELETE CASCADE,
 title text NOT NULL, filename text NOT NULL, mime_type text NOT NULL, bytes integer NOT NULL,
 digest text NOT NULL, original bytea NOT NULL, text_content text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('processing','ready','failed')), error text,
 enabled boolean NOT NULL DEFAULT true, archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, updated_by integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,digest)
);
CREATE TABLE IF NOT EXISTS platform_knowledge.chunks (
 id uuid PRIMARY KEY, tenant_id integer NOT NULL, document_id uuid NOT NULL, ordinal integer NOT NULL,
 heading text NOT NULL DEFAULT '', content text NOT NULL, context text NOT NULL,
 search_text text NOT NULL, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',search_text)) STORED,
 document_version integer NOT NULL,
 UNIQUE(tenant_id,document_id,ordinal),
 FOREIGN KEY(tenant_id,document_id) REFERENCES platform_knowledge.documents(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS knowledge_documents_scope ON platform_knowledge.documents(tenant_id,archived,updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_chunks_scope ON platform_knowledge.chunks(tenant_id,document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_search ON platform_knowledge.chunks USING gin(search_vector);
`
