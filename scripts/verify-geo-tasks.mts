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

import { geoTaskSchemaSQL } from '../src/platform/geo/task-schema'
import { createGeoTaskStore } from '../src/platform/geo/task-store'
import { createGeoAIStore } from '../src/platform/geo/ai-store'
import { parseGeoTask } from '../src/platform/geo/tasks'
import { parseGeoAIInput } from '../src/platform/geo/question-ai'

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
  const empty=await pool.query("SELECT to_regclass('public.tenants') AS tenants")
  if(empty.rows[0].tenants) throw new Error('Scratch database is not empty.')
  await pool.query(`CREATE TABLE public.tenants(id integer PRIMARY KEY);
    INSERT INTO public.tenants VALUES(101),(202);
    CREATE TABLE public.media(id integer PRIMARY KEY,tenant_id integer NOT NULL REFERENCES public.tenants(id),
      alt text,filename text,url text,thumbnail_u_r_l text,mime_type text,filesize integer);
    INSERT INTO public.media VALUES
      (1001,101,'设备图','a.jpg','https://fixture.example/a.jpg','','image/jpeg',100),
      (2001,202,'客户乙','b.jpg','https://fixture.example/b.jpg','','image/jpeg',100);`)
  await pool.query(geoKeywordsSchemaSQL);await pool.query(geoMaterialSchemaSQL);await pool.query(geoTaskSchemaSQL)
  const fingerprint=async()=>JSON.stringify((await pool.query(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS hash FROM public.media t`)).rows)
  const before=await fingerprint()
  const values=parseGeoValues({brand:'测试电气',core:'配电柜',aliases:'测试品牌',website:'https://fixture.example/',blog:'',terms:Array.from({length:10},(_,i)=>`类型${i}配电柜`)})
  const configA=(await createGeoKeywordStore(pool,101,1).create(randomUUID(),values)).item
  const configB=(await createGeoKeywordStore(pool,202,1).create(randomUUID(),values)).item
  const groupA=await createGeoMaterialStore(pool,101,1).save(randomUUID(),{name:'设备',description:'',mediaIds:[1001]})
  const groupB=await createGeoMaterialStore(pool,202,1).save(randomUUID(),{name:'设备',description:'',mediaIds:[2001]})
  assert.ok(groupA);assert.ok(groupB)
  const taskValues=parseGeoTask({name:'配电柜选型',optimizationID:configA.id,optimizationVersion:1,locale:'zh',
    questions:[{id:randomUUID(),term:'配电柜',intent:'default',original:'配电柜如何选型？'}],
    materialGroupID:groupA.id,materialGroupVersion:1,imagesPerArticle:1,direction:'技术解读',length:'short',mode:'deduplicate',count:1})
  const a=createGeoTaskStore(pool,101,1),b=createGeoTaskStore(pool,202,1),id=randomUUID()
  const first=await a.save(id,taskValues)
  assert.equal(first.status,'waiting_sources');assert.equal(first.version,1)
  assert.equal((await a.save(id,taskValues)).version,1)
  assert.equal(await b.find(id),null);assert.equal((await b.list('',1)).total,0)
  await assert.rejects(()=>b.save(id,taskValues,1),rejectCode('NOT_FOUND'))
  await assert.rejects(()=>a.save(id,{...taskValues,name:'改动请求'}),rejectCode('IDEMPOTENCY_CONFLICT'))
  await assert.rejects(()=>a.save(randomUUID(),{...taskValues,optimizationID:configB.id}),rejectCode('CONFIG_CHANGED'))
  await assert.rejects(()=>a.save(randomUUID(),{...taskValues,materialGroupID:groupB.id}),rejectCode('GROUP_CHANGED'))
  await assert.rejects(()=>a.save(id,{...taskValues,imagesPerArticle:2},1),rejectCode('INSUFFICIENT_IMAGES'))
  assert.equal((await a.find(id))?.version,1)
  checks.push('任务重复新增幂等；跨客户读取、修改、关联配置或素材组均拒绝；失败保留原任务')
  const page:GeoSourcePage={url:'https://fixture.example/products/cabinet',kind:'site',title:'产品页',excerpt:'真实设备参数说明',terms:[configA.terms[0]],status:'available',reason:''}
  await createGeoSourceStore(pool,101).replace(configA,[page])
  const second=await a.save(id,taskValues,1)
  assert.equal(second.status,'ready');assert.equal(second.version,2)
  assert.equal((second.snapshot.sources as unknown[]).length,1)
  const race=await Promise.allSettled([a.save(id,{...taskValues,name:'甲'},2),a.save(id,{...taskValues,name:'乙'},2)])
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT')
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM platform_geo.task_revisions WHERE tenant_id=101 AND task_id=$1',[id])).rows[0].count,3)
  const snapshotBefore=JSON.stringify((await a.find(id))?.snapshot)
  await createGeoMaterialStore(pool,101,1).save(groupA.id,{name:'新分组名',description:'',mediaIds:[1001]},1)
  assert.equal(JSON.stringify((await a.find(id))?.snapshot),snapshotBefore)
  await assert.rejects(()=>a.save(id,taskValues,3),rejectCode('GROUP_CHANGED'))
  checks.push('来源缺失/就绪真实区分；任务快照不随素材修改；并发CAS仅一个成功；修订完整保存')
  const ai=createGeoAIStore(pool,101,1),aiB=createGeoAIStore(pool,202,1)
  const input=parseGeoAIInput({kind:'expand',optimizationVersion:1,terms:['配电柜'],intent:'default',locale:'en'},configA)
  const opID=randomUUID()
  const claims=await Promise.all([ai.claim(opID,input,'fixture'),ai.claim(opID,input,'fixture')])
  assert.equal(claims.filter(c=>c.claimed).length,1)
  await assert.rejects(()=>ai.claim(opID,{...input,intent:'supplier'},'fixture'),rejectCode('IDEMPOTENCY_CONFLICT'))
  const parallelID=randomUUID();assert.equal((await ai.claim(parallelID,input,'fixture')).claimed,true);await ai.finish(parallelID,'failed',null,'FIXTURE')
  assert.equal((await aiB.recent(configA.id)).length,0)
  await assert.rejects(()=>aiB.claim(randomUUID(),input,'fixture'),rejectCode('CONFIG_CHANGED'))
  const usage={inputTokens:100,outputTokens:20,totalTokens:120,cacheHitInputTokens:null,cacheMissInputTokens:null}
  await ai.usage(opID,usage)
  const result={questions:taskValues.questions}
  await ai.finish(opID,'succeeded',result,null)
  const replay=await ai.claim(opID,input,'fixture')
  assert.equal(replay.claimed,false);assert.equal(replay.operation.state,'succeeded');assert.equal(replay.operation.usage?.totalTokens,120)
  for(let call=0;call<25;call++){const extra=randomUUID();assert.equal((await ai.claim(extra,input,'fixture')).claimed,true);await ai.finish(extra,'succeeded',result,null)}
  checks.push('AI并发同键只领取一次；不同内容同键拒绝；不同请求可并行且每日调用超过20次仍可正常领取；用量、结果可取回且不重复调用')
  const interrupted=randomUUID();await ai.claim(interrupted,input,'fixture')
  await pool.query("UPDATE platform_geo.ai_operations SET created_at=now()-interval '11 minutes' WHERE tenant_id=101 AND id=$1",[interrupted])
  assert.equal((await ai.recent(configA.id)).find(o=>o.id===interrupted)?.state,'unknown')
  const next=randomUUID();await ai.claim(next,input,'fixture')
  assert.equal((await ai.claim(interrupted,input,'fixture')).operation.state,'unknown')
  await ai.finish(next,'failed',null,'PROVIDER_429')
  checks.push('中断调用标为未知，原请求不会被重新领取；失败状态可核查')
  await pool.query(`CREATE FUNCTION platform_geo.reject_test_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reject_test_revision BEFORE INSERT ON platform_geo.task_revisions FOR EACH ROW EXECUTE FUNCTION platform_geo.reject_test_revision()`)
  const rollbackID=randomUUID()
  await assert.rejects(()=>a.save(rollbackID,{...taskValues,materialGroupVersion:2}))
  assert.equal(await a.find(rollbackID),null)
  assert.equal(await fingerprint(),before)
  checks.push('修订插入失败整体回滚；原media内容摘要不变；没有真实AI或外部抓取')
  const report={passed:true,database,scratchOnly:true,actualAIRequests:0,checks}
  await writeFile('docs/geo/evidence/step-04/postgres-verification.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}finally{await pool.end()}
