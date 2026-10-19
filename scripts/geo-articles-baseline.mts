/** Local read-only customer content and GEO baseline, including child/localized/version tables. */
import { createRequire } from 'node:module'
const url = new URL(process.env.DATABASE_URL || '')
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production')
  throw new Error('Local database required.')
const require=createRequire(import.meta.url)
const pg=createRequire(require.resolve('@payloadcms/db-postgres'))('pg') as {
  Client:new(options:object)=>{connect():Promise<void>;end():Promise<void>;query(sql:string):Promise<{rows:Record<string,unknown>[]}>}
}
const client=new pg.Client({connectionString:url.toString()})
await client.connect()
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const roots=['tenants','pages','products','news','cases','posts','media','leads','categories',
    'product_categories','news_categories','case_categories','site_navigation']
  const catalog=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  const tables=catalog.rows.map(r=>String(r.tablename)).filter(name=>roots.some(root=>
    name===root || name.startsWith(root+'_') || name===`_${root}_v` || name.startsWith(`_${root}_v_`)))
  const content:Record<string,unknown>={}
  for(const table of tables){
    const name=table.replaceAll('"','""')
    content[table]=(await client.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS fingerprint
      FROM public."${name}" t`)).rows[0]
  }
  const geo:Record<string,unknown>={}
  for(const table of ['optimizations','optimization_revisions','material_groups','material_items','source_pages','creation_tasks','task_revisions','ai_operations'])
    geo[table]=(await client.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS fingerprint
      FROM platform_geo.${table} t`)).rows[0]
  const storage=(await client.query(`SELECT
    to_regclass('platform_geo.generation_requests') IS NOT NULL AS requests,
    to_regclass('platform_geo.generation_jobs') IS NOT NULL AS jobs,
    to_regclass('platform_geo.generation_attempts') IS NOT NULL AS attempts,
    to_regclass('platform_geo.articles') IS NOT NULL AS articles,
    to_regclass('platform_geo.article_revisions') IS NOT NULL AS revisions`)).rows[0]
  await client.query('COMMIT')
  console.log(JSON.stringify({content,geo,storage},null,2))
}finally{await client.end()}
