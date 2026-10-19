export const geoMaterialHierarchySQL = `
  ALTER TABLE platform_geo.material_groups
    ADD COLUMN IF NOT EXISTS entry_type varchar(12) NOT NULL DEFAULT 'group';
  ALTER TABLE platform_geo.material_groups ADD COLUMN IF NOT EXISTS parent_group_id uuid;
  ALTER TABLE platform_geo.material_groups
    DROP CONSTRAINT IF EXISTS material_groups_tenant_id_normalized_name_key;
  DO $block$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='geo_material_entry_type_check'
        AND conrelid='platform_geo.material_groups'::regclass) THEN
      ALTER TABLE platform_geo.material_groups ADD CONSTRAINT geo_material_entry_type_check
        CHECK(entry_type IN ('folder','group'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='geo_material_folder_parent_check'
        AND conrelid='platform_geo.material_groups'::regclass) THEN
      ALTER TABLE platform_geo.material_groups ADD CONSTRAINT geo_material_folder_parent_check
        CHECK(entry_type <> 'folder' OR parent_group_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='geo_material_parent_fk'
        AND conrelid='platform_geo.material_groups'::regclass) THEN
      ALTER TABLE platform_geo.material_groups ADD CONSTRAINT geo_material_parent_fk
        FOREIGN KEY(tenant_id,parent_group_id)
        REFERENCES platform_geo.material_groups(tenant_id,id);
    END IF;
  END $block$;
  CREATE INDEX IF NOT EXISTS geo_material_groups_parent
    ON platform_geo.material_groups(tenant_id,parent_group_id,archived,normalized_name);
  CREATE UNIQUE INDEX IF NOT EXISTS geo_material_groups_parent_name
    ON platform_geo.material_groups(tenant_id,entry_type,
      (coalesce(parent_group_id,'00000000-0000-0000-0000-000000000000'::uuid)),normalized_name);
  CREATE OR REPLACE FUNCTION platform_geo.check_material_parent() RETURNS trigger
    LANGUAGE plpgsql AS $fn$ DECLARE parent_kind text; BEGIN
      IF NEW.parent_group_id IS NULL THEN RETURN NEW; END IF;
      IF NEW.entry_type <> 'group' THEN
        RAISE EXCEPTION 'Only GEO material groups can have a folder parent' USING ERRCODE='23514';
      END IF;
      SELECT entry_type INTO parent_kind FROM platform_geo.material_groups
        WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_group_id FOR SHARE;
      IF parent_kind IS DISTINCT FROM 'folder' THEN
        RAISE EXCEPTION 'GEO material group parent must be a folder in the same tenant' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $fn$;
  DROP TRIGGER IF EXISTS geo_material_parent_guard ON platform_geo.material_groups;
  CREATE TRIGGER geo_material_parent_guard BEFORE INSERT OR UPDATE OF entry_type,parent_group_id,tenant_id
    ON platform_geo.material_groups FOR EACH ROW EXECUTE FUNCTION platform_geo.check_material_parent();
  CREATE OR REPLACE FUNCTION platform_geo.check_material_group_kind() RETURNS trigger
    LANGUAGE plpgsql AS $fn$ BEGIN
      PERFORM id FROM platform_geo.material_groups
        WHERE tenant_id=NEW.tenant_id AND id=NEW.group_id AND entry_type='group' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'GEO material item requires a material group' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $fn$;
  DROP TRIGGER IF EXISTS geo_material_group_kind_guard ON platform_geo.material_items;
  CREATE TRIGGER geo_material_group_kind_guard BEFORE INSERT OR UPDATE
    ON platform_geo.material_items FOR EACH ROW EXECUTE FUNCTION platform_geo.check_material_group_kind();
`

export const geoMaterialSchemaSQL = `
  CREATE TABLE IF NOT EXISTS platform_geo.material_groups (
    id uuid PRIMARY KEY,
    tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name varchar(50) NOT NULL,
    normalized_name varchar(100) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1 CHECK(version>0),
    archived boolean NOT NULL DEFAULT false,
    created_by integer NOT NULL,
    updated_by integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,id), UNIQUE(tenant_id,normalized_name)
  );
  CREATE INDEX IF NOT EXISTS geo_material_groups_company_updated
    ON platform_geo.material_groups(tenant_id,archived,updated_at DESC);
  CREATE TABLE IF NOT EXISTS platform_geo.material_items (
    tenant_id integer NOT NULL,
    group_id uuid NOT NULL,
    media_id integer NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
    sort_order integer NOT NULL,
    PRIMARY KEY(tenant_id,group_id,media_id),
    FOREIGN KEY(tenant_id,group_id)
      REFERENCES platform_geo.material_groups(tenant_id,id) ON DELETE CASCADE
  );
  CREATE OR REPLACE FUNCTION platform_geo.check_material_tenant() RETURNS trigger
    LANGUAGE plpgsql AS $fn$ BEGIN
      PERFORM id FROM public.media WHERE id=NEW.media_id AND tenant_id=NEW.tenant_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'GEO material tenant mismatch' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $fn$;
  DROP TRIGGER IF EXISTS geo_material_tenant_guard ON platform_geo.material_items;
  CREATE TRIGGER geo_material_tenant_guard BEFORE INSERT OR UPDATE
    ON platform_geo.material_items FOR EACH ROW EXECUTE FUNCTION platform_geo.check_material_tenant();
  ${geoMaterialHierarchySQL}
  CREATE TABLE IF NOT EXISTS platform_geo.source_pages (
    tenant_id integer NOT NULL,
    optimization_id uuid NOT NULL,
    optimization_version integer NOT NULL,
    url_hash varchar(64) NOT NULL,
    url varchar(2048) NOT NULL,
    kind varchar(8) NOT NULL CHECK(kind IN ('site','blog')),
    title text NOT NULL DEFAULT '',
    excerpt text NOT NULL DEFAULT '',
    terms jsonb NOT NULL DEFAULT '[]'::jsonb,
    status varchar(16) NOT NULL CHECK(status IN ('pending','available','invalid')),
    reason varchar(300) NOT NULL DEFAULT '',
    checked_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(tenant_id,optimization_id,optimization_version,url_hash),
    FOREIGN KEY(tenant_id,optimization_id)
      REFERENCES platform_geo.optimizations(tenant_id,id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS geo_source_pages_current
    ON platform_geo.source_pages(tenant_id,optimization_id,optimization_version,status);
`
