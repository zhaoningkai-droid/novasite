/** Real SQL verification, only against a freshly created, explicitly named scratch database. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { geoMaterialSchemaSQL } from '../src/platform/geo/material-schema'
import { createGeoMaterialStore } from '../src/platform/geo/material-store'
import { createGeoSourceStore } from '../src/platform/geo/source-store'
import type { GeoSourcePage } from '../src/platform/geo/source-discovery'
import { writeFile } from 'node:fs/promises'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { geoKeywordsSchemaSQL } from '../src/platform/geo/schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { parseGeoValues } from '../src/platform/geo/keywords'

const database = process.env.GEO_TEST_DATABASE_NAME || ''
if (!/^novasite_geo_verify_[0-9]+$/u.test(database)) throw new Error('An explicit scratch database is required.')
const url = new URL(process.env.DATABASE_URL || '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Only local scratch storage is allowed.')
if (decodeURIComponent(url.pathname.slice(1)) === database) throw new Error('Scratch storage cannot be the application database.')
url.pathname = `/${database}`
const require = createRequire(import.meta.url)
const vendorRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = vendorRequire('pg') as { Pool: new (options: Record<string, unknown>) => PostgresAdapter['pool'] }
const pool = new pg.Pool({ connectionString: url.toString(), max: 5 })
const checks: string[] = []
const rejectCode = (code: string) => (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code
try {
  const empty = await pool.query("SELECT to_regclass('public.tenants') AS tenants")
  if (empty.rows[0].tenants) throw new Error('Scratch database is not empty; refusing to reuse it.')
  await pool.query(`CREATE TABLE public.tenants(id integer PRIMARY KEY);
    INSERT INTO public.tenants VALUES(101),(202);
    CREATE TABLE public.media(id integer PRIMARY KEY,tenant_id integer NOT NULL REFERENCES public.tenants(id),
      alt text,filename text,url text,thumbnail_u_r_l text,mime_type text,filesize integer);
    INSERT INTO public.media VALUES
      (1001,101,'图一','a.jpg','https://fixture.example/a.jpg','','image/jpeg',100),
      (1002,101,'图二','b.webp','https://fixture.example/b.webp','','image/webp',200),
      (1003,101,'文档','c.pdf','https://fixture.example/c.pdf','','application/pdf',100),
      (2001,202,'其他客户','other.jpg','https://other.example/other.jpg','','image/jpeg',100)`)
  const fingerprint = async () => (await pool.query("SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) AS value FROM public.media m")).rows[0].value
  const mediaBefore = await fingerprint()
  await pool.query(geoKeywordsSchemaSQL)
  await pool.query(geoMaterialSchemaSQL)
  await pool.query(geoMaterialSchemaSQL)
  const a = createGeoMaterialStore(pool,101,1), b = createGeoMaterialStore(pool,202,2)
  const id = randomUUID(), values = { name:'产品图片',description:'测试',mediaIds:[1001,1002] }
  const created = await a.save(id,values)
  assert.equal(created?.version,1)
  assert.deepEqual(created?.mediaIds,[1001,1002])
  assert.equal((await a.save(id,values))?.version,1)
  await b.save(randomUUID(),{...values,mediaIds:[2001]})
  await assert.rejects(()=>a.save(randomUUID(),values),rejectCode('23505'))
  assert.equal(await b.find(id),null)
  await assert.rejects(()=>b.save(id,{...values,mediaIds:[2001]},1),rejectCode('NOT_FOUND'))
  await assert.rejects(()=>b.archive(id,1,true),rejectCode('NOT_FOUND'))
  checks.push('分组真实创建/重试/读取；同客户重名拒绝、跨客户同名合法；跨客户详情/修改/归档拒绝')
  for (const mediaIds of [[2001],[1003],[1001,1001]])
    await assert.rejects(()=>a.save(id,{...values,mediaIds},1),rejectCode('INVALID_MEDIA'))
  assert.equal((await a.find(id))?.version,1)
  assert.deepEqual((await a.find(id))?.mediaIds,[1001,1002])
  await assert.rejects(()=>pool.query('INSERT INTO platform_geo.material_items VALUES($1,$2::uuid,$3,$4)',[101,id,2001,99]),rejectCode('23514'))
  checks.push('跨客户媒体、非图片、重复图片拒绝；失败不改原分组；数据库触发器也阻止跨客户图片绑定')
  const reordered = await a.save(id,{...values,mediaIds:[1002,1001]},1)
  assert.deepEqual(reordered?.mediaIds,[1002,1001])
  const race = await Promise.allSettled([
    a.save(id,{...values,description:'版本甲'},2),a.save(id,{...values,description:'版本乙'},2),
  ])
  assert.equal(race.filter((r)=>r.status==='fulfilled').length,1)
  assert.equal((race.find((r)=>r.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT')
  const archived = await a.archive(id,3,true)
  assert.equal(archived?.archived,true)
  assert.equal((await a.list('',1)).total,0)
  assert.equal((await a.list('',1,true)).total,1)
  await a.archive(id,4,false)
  assert.equal((await a.list('',1)).total,1)
  assert.equal(await fingerprint(),mediaBefore)
  checks.push('图片顺序持久化、并发版本冲突、分组归档和恢复；原media记录与内容摘要完全不变')
  const keys = createGeoKeywordStore(pool,101,1)
  const keyValues = parseGeoValues({brand:'测试',core:'配电柜',aliases:'',website:'https://fixture.example/',blog:'',
    terms:Array.from({length:10},(_,i)=>`类型${i}配电柜`)})
  const config = (await keys.create(randomUUID(),keyValues)).item
  const sources = createGeoSourceStore(pool,101), otherSources = createGeoSourceStore(pool,202)
  const page: GeoSourcePage = {url:'https://fixture.example/products/a',kind:'site',title:'产品',
    excerpt:'产品说明',terms:[config.terms[0]],status:'available',reason:''}
  await sources.replace(config,[page])
  assert.equal((await sources.list(config.id,1)).length,1)
  assert.equal((await otherSources.list(config.id,1)).length,0)
  await assert.rejects(()=>otherSources.replace(config,[page]),rejectCode('FORBIDDEN'))
  await assert.rejects(()=>sources.replace(config,[{...page,url:'https://other.example/a'}]),rejectCode('INVALID_SOURCE'))
  assert.equal((await sources.list(config.id,1)).length,1)
  await keys.update(config.id,1,{...keyValues,aliases:['新别名']})
  await assert.rejects(()=>sources.replace(config,[page]),rejectCode('VERSION_CONFLICT'))
  assert.equal((await sources.list(config.id,2)).length,0)
  checks.push('来源索引按客户及配置版本隔离，拒绝别客户/别域名/旧版本写入，失败保留旧索引')
  const report={status:'passed',environment:'isolated scratch PostgreSQL',applicationDatabaseChanged:false,checks}
  await writeFile('docs/geo/evidence/step-03/postgres-verification.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
} finally { await pool.end() }
