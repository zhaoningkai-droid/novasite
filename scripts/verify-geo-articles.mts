/** Real PostgreSQL, explicit scratch database only. All source/model responses are injected fixtures. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { geoKeywordsSchemaSQL } from '../src/platform/geo/schema'
import { geoMaterialSchemaSQL } from '../src/platform/geo/material-schema'
import { geoTaskSchemaSQL } from '../src/platform/geo/task-schema'
import { geoArticleSchemaSQL } from '../src/platform/geo/article-schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { createGeoMaterialStore } from '../src/platform/geo/material-store'
import { createGeoSourceStore } from '../src/platform/geo/source-store'
import { createGeoTaskStore } from '../src/platform/geo/task-store'
import { createGeoArticleStore } from '../src/platform/geo/article-store'
import { createGeoGenerationQueue } from '../src/platform/geo/generation-queue'
import { runOneGeoArticle } from '../src/platform/geo/article-runner'
import { refreshArticleContext } from '../src/platform/geo/article-context'
import { GeoError, parseGeoValues } from '../src/platform/geo/keywords'
import { parseGeoTask } from '../src/platform/geo/tasks'
import { validateGeoArticle, type ArticleContext } from '../src/platform/geo/articles'
import type { GeoSourcePage } from '../src/platform/geo/source-discovery'
const database = process.env.GEO_TEST_DATABASE_NAME || '', url = new URL(process.env.DATABASE_URL || '')
if (!/^novasite_geo_verify_[0-9]+$/u.test(database) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || decodeURIComponent(url.pathname.slice(1)) === database)
  throw new Error('Explicit local scratch database required; refusing application storage.')
url.pathname = `/${database}`
const require = createRequire(import.meta.url), pg = createRequire(require.resolve('@payloadcms/db-postgres'))('pg') as { Pool: new (options: object) => PostgresAdapter['pool'] }
const pool = new pg.Pool({ connectionString: url.toString(), max: 5 }), checks: string[] = []
const code = (expected: string) => (e: unknown) => e instanceof GeoError ? e.code === expected : false
try {
  if ((await pool.query("SELECT to_regclass('public.tenants') AS tenants")).rows[0].tenants) throw new Error('Scratch database is not empty.')
  await pool.query(`CREATE TABLE public.tenants(id integer PRIMARY KEY);INSERT INTO public.tenants VALUES(101),(202);
    CREATE TABLE public.media(id integer PRIMARY KEY,tenant_id integer NOT NULL REFERENCES public.tenants(id),
      alt text,filename text,url text,thumbnail_u_r_l text,mime_type text,filesize integer);
    INSERT INTO public.media VALUES(1001,101,'设备示意图','a.jpg','/api/media/file/a.jpg','','image/jpeg',100),
      (2001,202,'乙设备示意图','b.jpg','/api/media/file/b.jpg','','image/jpeg',100);`)
  for (const sql of [geoKeywordsSchemaSQL,geoMaterialSchemaSQL,geoTaskSchemaSQL,geoArticleSchemaSQL]) await pool.query(sql)
  const fingerprint = async () => JSON.stringify((await pool.query("SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS hash FROM public.media t")).rows)
  const before = await fingerprint()
  const terms = Array.from({length:10},(_,i)=>`类型${i}配电柜`)
  const values = parseGeoValues({brand:'测试电气',core:'配电柜',aliases:'',terms,website:'https://fixture.example/',blog:''})
  const config = (await createGeoKeywordStore(pool,101,1).create(randomUUID(),values)).item
  const group = await createGeoMaterialStore(pool,101,1).save(randomUUID(),{name:'设备',description:'',mediaIds:[1001]});assert.ok(group)
  const page: GeoSourcePage = {url:'https://fixture.example/products/cabinet',kind:'site',title:'设备选型资料',
    excerpt:'配电柜选型应核对安装环境以及设备资料，结合现场条件确认设备的安装与维护要求。'.repeat(10),terms:[terms[0]],status:'available',reason:''}
  await createGeoSourceStore(pool,101).replace(config,[page])
  const settings = parseGeoTask({name:'配电柜文章',optimizationID:config.id,optimizationVersion:1,locale:'zh',questions:[
    {id:randomUUID(),term:'配电柜',intent:'default',original:'配电柜如何选型？'},
    {id:randomUUID(),term:terms[0],intent:'default',original:'低压配电柜如何维护？'}],materialGroupID:group.id,materialGroupVersion:1,
    imagesPerArticle:1,direction:'产品介绍',length:'short',mode:'deduplicate',count:2})
  const taskID=randomUUID(),taskStore=createGeoTaskStore(pool,101,1), task=await taskStore.save(taskID,settings)
  assert.equal(task.status,'ready')
  const taskBefore=JSON.stringify(await taskStore.find(taskID)),a=createGeoArticleStore(pool,101,1),b=createGeoArticleStore(pool,202,1),requestID=randomUUID()
  assert.equal((await a.enqueue(requestID,taskID,1,2)).replayed,false)
  assert.equal((await a.enqueue(requestID,taskID,1,2)).replayed,true)
  await assert.rejects(()=>a.enqueue(requestID,taskID,1,1),code('IDEMPOTENCY_CONFLICT'))
  await assert.rejects(()=>a.enqueue(randomUUID(),taskID,1,1),code('INSUFFICIENT_QUESTIONS'))
  await assert.rejects(()=>b.enqueue(randomUUID(),taskID,1,1),code('NOT_FOUND'))
  await assert.rejects(()=>a.enqueue(randomUUID(),taskID,2,1),code('VERSION_CONFLICT'))
  checks.push('生成请求重放不重复排队；不同内容同键拒绝；相同问题去重；跨客户任务和旧版本拒绝')
  const queue=createGeoGenerationQueue(pool),first=await queue.claim();assert.ok(first)
  assert.equal(await queue.claim(),null)
  await queue.fail(first,false,'FIXTURE','fixture failure')
  let generated=0
  const content=(context:ArticleContext)=>validateGeoArticle({title:'配电柜选型要点',summary:'安装与资料核查。',
    html:`<h2>安装条件</h2><p>${page.excerpt}<a href="${page.url}">${page.title}</a></p><img src="${context.materialGroup.images[0].url}">`},context)
  const options={key:'fixture-only',model:'fixture',authorize:async()=>true,
    refresh:(p:Pick<PostgresAdapter['pool'],'query'>,tenant:number,c:ArticleContext)=>refreshArticleContext(p,tenant,c,async()=>[page]),
    generate:async(c:ArticleContext,o:{onUsage:(value?:{inputTokens:number;outputTokens:number;totalTokens:number;cacheHitInputTokens:null;cacheMissInputTokens:null})=>Promise<void>})=>{
      generated++;await o.onUsage({inputTokens:10,outputTokens:20,totalTokens:30,cacheHitInputTokens:null,cacheMissInputTokens:null})
      return {content:content(c),warnings:[]}
    }}
  await runOneGeoArticle(pool,{...options,authorize:async()=>false})
  assert.equal(generated,0)
  await a.retry(first.id,false)
  await runOneGeoArticle(pool,options)
  assert.equal(generated,1)
  const article=await a.find(first.id);assert.ok(article);assert.equal(article.status,'needs_edit');assert.deepEqual(article.validation,[])
  assert.equal(await b.find(first.id),null);assert.equal(await b.revision(first.id,1),null);assert.deepEqual(await b.jobs(taskID),[])
  await assert.rejects(()=>b.retry(first.id,false),code('RETRY_NOT_ALLOWED'))
  await assert.rejects(()=>a.retry(first.id,false),code('RETRY_NOT_ALLOWED'))
  checks.push('同客户仅一个运行任务；撤销权限时不调用模型；成功必为草稿；跨客户文章/历史/进度不可读取；成功记录不可重试覆盖')
  const ready=await a.save(article.id,1,{title:article.title,summary:article.summary,html:article.html},article.context,true,'已按来源逐项核对公司事实和图片。')
  assert.equal(ready.status,'ready');assert.equal(ready.version,2)
  const without=await a.save(article.id,2,{title:article.title,summary:article.summary,html:article.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gu,'')},article.context,true,'已检查但主动移除引用用于测试。')
  assert.equal(without.status,'needs_edit');assert.ok(without.validation.some(s=>s.includes('引用')))
  const race=await Promise.allSettled([a.save(article.id,3,{title:'编辑甲',summary:'',html:article.html},article.context,false,''),a.save(article.id,3,{title:'编辑乙',summary:'',html:article.html},article.context,false,'')])
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT')
  assert.equal((await a.history(article.id)).length,4)
  const historical=await a.revision(article.id,1);assert.ok(historical)
  await a.save(article.id,4,{title:historical.title,summary:historical.summary,html:historical.html},article.context,false,'')
  assert.equal((await a.find(article.id))?.version,5);assert.equal((await a.revision(article.id,1))?.version,1)
  assert.equal(JSON.stringify(await taskStore.find(taskID)),taskBefore)
  checks.push('人工核查后可发布；删引用阻止可发布；并发CAS只成功一个；历史正文恢复产生新修订，原修订和任务快照不变')
  const failed=(await a.jobs(taskID)).find(j=>j.id!==first.id);assert.ok(failed)
  await a.retry(failed.id,false)
  const interrupted=await queue.claim();assert.ok(interrupted)
  await queue.dispatch(interrupted,interrupted.context,'fixture')
  await assert.rejects(()=>queue.dispatch(interrupted,interrupted.context,'fixture'),code('LEASE_LOST'))
  await pool.query("UPDATE platform_geo.generation_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id=101 AND id=$1",[interrupted.id])
  assert.equal(await queue.claim(),null)
  assert.equal((await a.jobs(taskID)).find(j=>j.id===interrupted.id)?.state,'unknown')
  await assert.rejects(()=>a.retry(interrupted.id,false),code('RETRY_NOT_ALLOWED'))
  await a.retry(interrupted.id,true)
  const next=await queue.claim();assert.ok(next);await queue.dispatch(next,next.context,'fixture')
  await assert.rejects(()=>queue.complete(interrupted,interrupted.context,{content:content(interrupted.context),warnings:[]}),code('LEASE_LOST'))
  await assert.rejects(()=>queue.usage(interrupted),code('LEASE_LOST'))
  await queue.fail(next,false,'PROVIDER_429','fixture failure')
  assert.equal(await a.find(next.id),null)
  await a.retry(next.id,false);const capped=await queue.claim();assert.ok(capped)
  await assert.rejects(()=>queue.dispatch(capped,capped.context,'fixture',1),code('ARTICLE_DAILY_LIMIT'))
  await queue.fail(capped,false,'ARTICLE_DAILY_LIMIT','fixture limit')
  const callsBefore=generated;await a.retry(capped.id,false)
  await runOneGeoArticle(pool,{...options,refresh:async()=>{throw new GeoError('SOURCE_RECHECK_FAILED','fixture source failure')}})
  assert.equal(generated,callsBefore)
  checks.push('调用前持久化attempt；重复dispatch拒绝；调用后中断标未知且不自动重发；明确确认后重试；旧lease不能覆盖结果；日限额和来源失败均阻止模型调用')
  const configB=(await createGeoKeywordStore(pool,202,1).create(randomUUID(),values)).item
  const groupB=await createGeoMaterialStore(pool,202,1).save(randomUUID(),{name:'乙设备',description:'',mediaIds:[2001]});assert.ok(groupB)
  await createGeoSourceStore(pool,202).replace(configB,[page])
  const taskB=randomUUID();await createGeoTaskStore(pool,202,1).save(taskB,{...settings,optimizationID:configB.id,materialGroupID:groupB.id})
  await b.enqueue(randomUUID(),taskB,1,1);await a.retry(capped.id,false)
  const parallel=await Promise.all([queue.claim(),queue.claim()]);assert.ok(parallel[0]);assert.ok(parallel[1]);assert.notEqual(parallel[0].tenant_id,parallel[1].tenant_id);assert.equal(await queue.claim(),null)
  for(const job of parallel){assert.ok(job);await queue.fail(job,false,'FIXTURE','fixture cleanup')}
  checks.push('全局并发最多2个，不同客户可并行；同客户不能并行重复领取')
  await taskStore.save(taskID,{...settings,mode:'repeat',count:1},1)
  await a.enqueue(randomUUID(),taskID,2,1);const rollback=await queue.claim();assert.ok(rollback);await queue.dispatch(rollback,rollback.context,'fixture',100)
  await pool.query(`CREATE FUNCTION platform_geo.reject_test_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reject_test_revision BEFORE INSERT ON platform_geo.article_revisions FOR EACH ROW EXECUTE FUNCTION platform_geo.reject_test_revision()`)
  await assert.rejects(()=>queue.complete(rollback,rollback.context,{content:content(rollback.context),warnings:[]}))
  assert.equal(await a.find(rollback.id),null)
  await queue.fail(rollback,false,'FIXTURE_REVISION','fixture rollback')
  assert.equal(await fingerprint(),before)
  checks.push('文章与初始修订原子保存，修订失败不留下半篇文章；已有media数量和内容摘要不变')
  const report={passed:true,database,scratchOnly:true,actualAIRequests:0,actualSourceRequests:0,injectedModelExecutions:generated,checks}
  await writeFile('docs/geo/evidence/step-05/postgres-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{await pool.end()}
