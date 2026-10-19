/** Actual Payload + PostgreSQL in a schema-only scratch DB. No application data, files, AI or network source calls. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import type {PostgresAdapter} from '@payloadcms/db-postgres'
import {geoPublishSchemaSQL} from '../src/platform/geo/publish-schema'
import {geoPlanSchemaSQL} from '../src/platform/geo/plan-schema'
import {createGeoKeywordStore} from '../src/platform/geo/keyword-store'
import {createGeoMaterialStore} from '../src/platform/geo/material-store'
import {createGeoSourceStore} from '../src/platform/geo/source-store'
import {createGeoTaskStore} from '../src/platform/geo/task-store'
import {createGeoArticleStore} from '../src/platform/geo/article-store'
import {createGeoPublishStore,createGeoPublishQueue} from '../src/platform/geo/publish-store'
import {createGeoPlanStore,dispatchOneGeoPlan} from '../src/platform/geo/plan-store'
import {parseGeoPlanConfig} from '../src/platform/geo/plans'
import {runOneGeoArticle} from '../src/platform/geo/article-runner'
import {parseGeoValues,GeoError} from '../src/platform/geo/keywords'
import {parseGeoTask} from '../src/platform/geo/tasks'
import {validateGeoArticle,type ArticleContext} from '../src/platform/geo/articles'
const database=process.env.GEO_TEST_DATABASE_NAME||'',url=new URL(process.env.DATABASE_URL||'')
if(!/^novasite_geo_verify_[0-9]+$/u.test(database)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))===database||process.env.NODE_ENV!=='production')throw new Error('Explicit local scratch database and production adapter required.')
url.pathname=`/${database}`;process.env.DATABASE_URL=url.toString()
const {getPayload}=await import('payload'),{default:config}=await import('../src/payload.config')
const payload=await getPayload({config}),pool=(payload.db as unknown as PostgresAdapter).pool,checks:string[]=[]
const code=(value:string)=>(e:unknown)=>e instanceof GeoError&&e.code===value
try{
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM public.tenants')).rows[0].n),0,'Scratch must be schema-only and empty')
  await pool.query(geoPublishSchemaSQL)
  await pool.query(geoPlanSchemaSQL)
  const user=await payload.create({collection:'users',data:{email:'geo-fixture@example.invalid',password:randomUUID(),roles:['super-admin'],name:'GEO fixture only'},overrideAccess:true})
  const makeTenant=(name:string)=>payload.create({collection:'tenants',locale:'zh',overrideAccess:true,data:{name,slug:name,status:'published',defaultLocale:'zh',enabledLocales:['zh','en'],branding:{companyName:name}}})
  const aTenant=await makeTenant('geo-fixture-a'),bTenant=await makeTenant('geo-fixture-b')
  const newsCategory=await payload.create({collection:'news-categories',locale:'zh',user,overrideAccess:false,data:{tenant:aTenant.id,name:'配电柜',slug:'cabinet',sortOrder:0}})
  const blogCategory=await payload.create({collection:'categories',locale:'zh',user,overrideAccess:false,data:{tenant:aTenant.id,title:'设备知识',slug:'equipment',sortOrder:0}})
  const foreignCategory=await payload.create({collection:'news-categories',locale:'zh',user,overrideAccess:false,data:{tenant:bTenant.id,name:'乙设备',slug:'b',sortOrder:0}})
  const media=(await pool.query(`INSERT INTO public.media(tenant_id,alt,filename,url,mime_type,filesize) VALUES($1,'配电柜示意图','fixture.jpg','/api/media/file/fixture.jpg','image/jpeg',100) RETURNING id`,[aTenant.id])).rows[0].id
  const values=parseGeoValues({brand:'测试电气',core:'配电柜',aliases:'测试电气/测试设备',terms:Array.from({length:10},(_,i)=>`类型${i}配电柜`),website:'https://fixture.example/',blog:''})
  const opt=(await createGeoKeywordStore(pool,aTenant.id,user.id).create(randomUUID(),values)).item
  const group=await createGeoMaterialStore(pool,aTenant.id,user.id).save(randomUUID(),{name:'配电柜组',description:'',mediaIds:[media]});assert.ok(group)
  const source={url:'https://fixture.example/products/cabinet',kind:'site' as const,title:'配电柜资料',excerpt:'配电柜选型应核对安装环境以及设备资料，结合现场条件确认设备的安装与维护要求。'.repeat(10),terms:[values.terms[0]],status:'available' as const,reason:''}
  await createGeoSourceStore(pool,aTenant.id).replace(opt,[source])
  const settings=parseGeoTask({name:'测试文章',optimizationID:opt.id,optimizationVersion:1,locale:'zh',questions:[{id:randomUUID(),term:values.terms[0],original:'配电柜如何选型？',intent:'default'}],materialGroupID:group.id,materialGroupVersion:1,imagesPerArticle:1,direction:'产品介绍',length:'short',mode:'deduplicate',count:1})
  const task=await createGeoTaskStore(pool,aTenant.id,user.id).save(randomUUID(),settings),articles=createGeoArticleStore(pool,aTenant.id,user.id)
  await articles.enqueue(randomUUID(),task.id,1,1)
  await runOneGeoArticle(pool,{key:'fixture-only',model:'fixture',authorize:async()=>true,refresh:async(_p,_t,c)=>c,
    generate:async(c:ArticleContext)=>({content:validateGeoArticle({title:'配电柜安装资料',summary:'配电柜安装与维护条件。',html:`<h2>安装条件</h2><p>${source.excerpt}<a href="${source.url}">配电柜资料</a></p><p><img src="${c.materialGroup.images[0].url}"></p>`},c),warnings:[]})})
  const articleID=(await articles.list('',1,null)).items[0].id,first=await articles.find(articleID);assert.ok(first)
  let article=await articles.save(articleID,1,first,first.context,true,'已经逐项核对引用资料与设备示意图片。')
  const {loadGeoPublishTarget}=await import('../src/platform/geo/publish-target'),{commitGeoPublication}=await import('../src/platform/geo/publish-adapter'),{runOneGeoPublication}=await import('../src/platform/geo/publish-runner')
  const store=createGeoPublishStore(pool,aTenant.id,user.id),other=createGeoPublishStore(pool,bTenant.id,user.id),queue=createGeoPublishQueue(pool)
  const target=await loadGeoPublishTarget(payload,user,aTenant.id,'news',newsCategory.id,'zh')
  await assert.rejects(()=>loadGeoPublishTarget(payload,user,aTenant.id,'news',foreignCategory.id,'zh'),code('INVALID_CATEGORY'))
  await assert.rejects(()=>loadGeoPublishTarget(payload,user,aTenant.id,'news',newsCategory.id,'en'),code('PUBLISH_LANGUAGE'))
  const input={articleID,version:article.version,collection:'news' as const,categoryID:newsCategory.id,publishAt:null}
  const id=randomUUID();await store.enqueue(id,input,target,article)
  assert.equal((await store.enqueue(id,input,target,article)).id,id)
  await assert.rejects(()=>store.enqueue(id,{...input,categoryID:foreignCategory.id},target,article),code('IDEMPOTENCY_CONFLICT'))
  await assert.rejects(()=>store.enqueue(randomUUID(),input,target,article),code('ALREADY_REQUESTED'))
  assert.equal(await other.find(id),null);assert.deepEqual(await other.events(id),[])
  await assert.rejects(()=>other.action(id,'cancel'),code('ACTION_NOT_ALLOWED'))
  checks.push('实际Payload分类权限：拒绝异客户分类和非默认语言；相同请求重放不重复；不同内容复用编号和逻辑重复拒绝；记录/事件/操作按客户隔离')
  const before=Number((await pool.query('SELECT count(*) n FROM public.news')).rows[0].n)
  await runOneGeoPublication(payload,{authorize:async()=>null,refresh:async(_p,_t,c)=>c})
  assert.equal((await store.find(id))?.error_code,'ACTOR_REVOKED');assert.equal(Number((await pool.query('SELECT count(*) n FROM public.news')).rows[0].n),before)
  await store.action(id,'retry')
  await runOneGeoPublication(payload,{authorize:async()=>user,refresh:async(_p,_t,c)=>c})
  const published=await store.find(id);assert.equal(published?.state,'published');assert.ok(published?.target_id);assert.ok(published.target_url)
  const news=await payload.findByID({collection:'news',id:published.target_id,locale:'zh',fallbackLocale:false,depth:1,overrideAccess:false,user})
  assert.equal(news._status,'published');assert.equal(news.title,article.title);assert.equal(typeof news.tenant==='object'?news.tenant?.id:news.tenant,aTenant.id)
  const {richTextToHTML}=await import('../src/platform/rich-text');const rendered=richTextToHTML(news.content);assert.ok(rendered.includes(source.url));assert.ok(rendered.includes('<img'));
  const serialized=JSON.stringify(news.content);assert.ok(serialized.includes(source.url));assert.ok(serialized.includes('upload'))
  assert.equal((await store.events(id)).at(-1)?.event,'published')
  await assert.rejects(()=>store.action(id,'retry'),code('ACTION_NOT_ALLOWED'));await assert.rejects(()=>store.action(id,'cancel'),code('ACTION_NOT_ALLOWED'))
  checks.push('实际Payload/Postgres新闻发布与回读成功，保留来源链接与素材组图片；被撤销权限不写CMS；成功记录不可重试或取消覆盖')
  const blogTarget=await loadGeoPublishTarget(payload,user,aTenant.id,'posts',blogCategory.id,'zh'),blogID=randomUUID()
  await store.enqueue(blogID,{...input,collection:'posts',categoryID:blogCategory.id},blogTarget,article)
  await runOneGeoPublication(payload,{authorize:async()=>user,refresh:async(_p,_t,c)=>c})
  const blog=await store.find(blogID);assert.equal(blog?.state,'published');assert.ok(blog?.target_id)
  const post=await payload.findByID({collection:'posts',id:blog.target_id,locale:'zh',fallbackLocale:false,depth:0,overrideAccess:false,user})
  assert.equal(post.title,article.title);assert.equal(post._status,'published');assert.ok(JSON.stringify(post.content).includes(source.url))
  checks.push('实际Payload Blog创建、分类、版本/搜索插件钩子及默认语言回读成功；没有禁用现有CMS钩子或修改集合')
  // New revision allows a distinct publication without overwriting the first CMS record.
  article=await articles.save(article.id,article.version,{...article,title:'配电柜资料更新'},article.context,true,'已经核对新版标题与现有资料。')
  const nextInput={...input,version:article.version},nextID=randomUUID()
  await store.enqueue(nextID,{...nextInput,publishAt:new Date(Date.now()+120000).toISOString()},target,article)
  assert.equal(await queue.claim(),null);await store.action(nextID,'cancel')
  const newID=randomUUID();await store.enqueue(newID,nextInput,target,article);const claimed=await queue.claim();assert.equal(claimed?.id,newID);assert.ok(claimed)
  assert.equal(await queue.claim(),null)
  const versionsBefore=(await pool.query('SELECT count(*)::int AS n FROM public._news_v')).rows[0].n
  await pool.query(`CREATE FUNCTION platform_geo.reject_publish_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='published' THEN RAISE EXCEPTION 'fixture event failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_publish_event BEFORE INSERT ON platform_geo.publish_events FOR EACH ROW EXECUTE FUNCTION platform_geo.reject_publish_event()`)
  await assert.rejects(()=>commitGeoPublication(payload,user,claimed,article),code('TARGET_WRITE_FAILED'))
  assert.equal(Number((await pool.query('SELECT count(*) n FROM public.news')).rows[0].n),before+1)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public._news_v')).rows[0].n,versionsBefore)
  assert.equal((await store.find(newID))?.state,'running');assert.equal((await store.events(newID)).some(e=>e.event==='published'),false)
  await pool.query('DROP TRIGGER reject_publish_event ON platform_geo.publish_events;DROP FUNCTION platform_geo.reject_publish_event()')
  await queue.fail(claimed,false,'FIXTURE','已验证事务回滚')
  checks.push('单次定时未到不领取；取消后可重新确认；同客户串行；实际Payload事务中事件插入失败会同时回滚新新闻、CMS版本和发布成功状态，无半成功')
  await store.action(newID,'retry');const stale=await queue.claim();assert.ok(stale)
  await pool.query("UPDATE platform_geo.publish_intents SET lease_until=now()-interval '1 second' WHERE id=$1",[newID]);assert.equal(await queue.claim(),null)
  assert.equal((await store.find(newID))?.state,'unknown')
  await assert.rejects(()=>store.action(newID,'retry'),code('ACTION_NOT_ALLOWED'))
  await store.action(newID,'retry',true);const fresh=await queue.claim();assert.ok(fresh)
  await assert.rejects(()=>commitGeoPublication(payload,user,stale,article),code('LEASE_LOST'))
  await queue.fail(fresh,false,'FIXTURE','完成测试')
  const unchanged=await payload.findByID({collection:'news',id:news.id,locale:'zh',depth:0,overrideAccess:false,user});assert.equal(unchanged.title,news.title)
  checks.push('失效租约转未知且不自动重发；未知需明确确认才能重试；旧执行者不能写入；新修订和失败测试不改变先前已发内容')
  article=await articles.save(article.id,article.version,{...article,title:'配电柜排程核对稿'},article.context,true,'已核对计划测试稿及其默认语言和引用来源。')
  const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]))
  const startDate=`${dateParts.year}-${dateParts.month}-${dateParts.day}`
  const endDate=new Date(Date.parse(`${startDate}T00:00:00Z`)+60*86400_000).toISOString().slice(0,10)
  const planConfig=(planTarget:typeof target)=>{
    const parsed=parseGeoPlanConfig({sourceMode:'articles',sourceIDs:[article.id],targets:[{collection:planTarget.collection,categoryID:planTarget.categoryID}],
      distribution:'all',approvalMode:planTarget.collection==='news'?'manual':'auto',maxArticles:2,
      schedule:{timezone:'Asia/Shanghai',startDate,endDate,weekdays:[0,1,2,3,4,5,6],windowStart:'00:00',windowEnd:'23:45',intervalMinutes:15}},'zh')
    parsed.targets=[planTarget];return parsed
  }
  const planA=createGeoPlanStore(pool,aTenant.id,user.id),planB=createGeoPlanStore(pool,bTenant.id,user.id)
  const manualPlan=await planA.save(randomUUID(),'人工审核测试计划',planConfig(target))
  const automaticPlan=await planA.save(randomUUID(),'自动确认测试计划',planConfig(blogTarget))
  const firstPreview=await planA.preview(planConfig(target))
  assert.ok(firstPreview.nextRunAt);assert.equal(firstPreview.timezone,'Asia/Shanghai')
  assert.equal(firstPreview.articleCount,1);assert.equal(firstPreview.itemCount,1)
  assert.equal(firstPreview.items[0].articleID,article.id);assert.equal(firstPreview.items[0].target.categoryID,newsCategory.id)
  const taskPreviewConfig=parseGeoPlanConfig({...planConfig(target),sourceMode:'tasks',sourceIDs:[task.id],targets:[
    {collection:'news',categoryID:newsCategory.id},{collection:'posts',categoryID:blogCategory.id}]},'zh')
  taskPreviewConfig.targets=[target,blogTarget]
  const allPreview=await planA.preview(taskPreviewConfig)
  assert.equal(allPreview.itemCount,2,'One-to-many preview assigns each article to both selected collections')
  const roundRobinPreview=await planA.preview({...taskPreviewConfig,distribution:'round_robin'})
  assert.equal(roundRobinPreview.itemCount,1,'Round-robin preview assigns one target per article')
  assert.equal(roundRobinPreview.items[0].target.collection,'news')
  await assert.rejects(()=>planB.save(randomUUID(),'跨客户来源测试',planConfig(target)))
  await planA.action(manualPlan.id,'activate',manualPlan.version)
  await planA.action(automaticPlan.id,'activate',automaticPlan.version)
  await pool.query(`UPDATE platform_geo.publish_plans SET next_run_at=clock_timestamp()-interval '1 second'
    WHERE tenant_id=$1 AND id=ANY($2::uuid[])`,[aTenant.id,[manualPlan.id,automaticPlan.id]])
  const authPlan=async(actorID:number,tenantID:number)=>actorID===user.id&&tenantID===aTenant.id?user:null
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  const planRuns=await pool.query(`SELECT p.name,r.state,count(i.id)::int AS items
    FROM platform_geo.publish_plans p JOIN platform_geo.publish_plan_runs r ON r.tenant_id=p.tenant_id AND r.plan_id=p.id
    LEFT JOIN platform_geo.publish_plan_items i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE p.tenant_id=$1 AND p.id=ANY($2::uuid[]) GROUP BY p.name,r.state ORDER BY p.name`,[aTenant.id,[manualPlan.id,automaticPlan.id]])
  assert.deepEqual(planRuns.rows.map(row=>[row.name,row.state,Number(row.items)]).sort(),[
    ['人工审核测试计划','awaiting_review',1],['自动确认测试计划','queued',1]].sort())
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),false,'A due occurrence is dispatched once')
  assert.equal((await planB.list(1)).total,0)
  assert.equal(Number((await pool.query(`SELECT count(*)::int AS n FROM platform_geo.publish_intents
    WHERE tenant_id=$1 AND article_id=$2::uuid AND article_version=$3 AND collection='posts' AND state='queued'`,
  [aTenant.id,article.id,article.version])).rows[0].n),1)
  const manualEntry=(await pool.query(`SELECT r.id AS run_id,i.id AS item_id FROM platform_geo.publish_plan_runs r
    JOIN platform_geo.publish_plan_items i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE r.tenant_id=$1 AND r.plan_id=$2::uuid AND i.state='awaiting_review'`,[aTenant.id,manualPlan.id])).rows[0]
  assert.ok(manualEntry)
  await planA.skipItem(manualEntry.run_id,manualEntry.item_id)
  const skippedPlan=(await planA.list(1)).items.find(item=>item.id===manualPlan.id)
  assert.equal(skippedPlan?.runs[0]?.state,'skipped')
  assert.equal(skippedPlan?.runs[0]?.items[0]?.state,'skipped')
  assert.equal(skippedPlan?.runs[0]?.events[0]?.event,'skipped')
  assert.equal(Number((await pool.query(`SELECT count(*)::int AS n FROM platform_geo.publish_intents
    WHERE tenant_id=$1 AND article_id=$2::uuid AND article_version=$3 AND collection='news'`,
  [aTenant.id,article.id,article.version])).rows[0].n),0,'Skipping a manual-review item never queues a publication')
  const manualPublisher=createGeoPublishStore(pool,aTenant.id,user.id)
  await pool.query(`UPDATE platform_geo.publish_plans SET next_run_at=clock_timestamp()-interval '1 second'
    WHERE tenant_id=$1 AND id=$2::uuid`,[aTenant.id,manualPlan.id])
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  const nextManual=(await pool.query(`SELECT r.id AS run_id,i.id AS item_id FROM platform_geo.publish_plan_runs r
    JOIN platform_geo.publish_plan_items i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE r.tenant_id=$1 AND r.plan_id=$2::uuid AND i.state='awaiting_review'
    ORDER BY r.scheduled_at DESC LIMIT 1`,[aTenant.id,manualPlan.id])).rows[0]
  assert.ok(nextManual)
  await manualPublisher.enqueue(nextManual.item_id,{articleID:article.id,version:article.version,collection:'news',categoryID:newsCategory.id,publishAt:null},target,article)
  const approvedPlan=(await planA.list(1)).items.find(item=>item.id===manualPlan.id)
  assert.equal(approvedPlan?.runs[0]?.state,'queued')
  assert.equal(approvedPlan?.runs[0]?.items[0]?.state,'queued')
  assert.equal(approvedPlan?.runs[0]?.items[0]?.intent_id,nextManual.item_id)
  await manualPublisher.action(nextManual.item_id,'cancel')
  const cancelledPlan=(await planA.list(1)).items.find(item=>item.id===manualPlan.id)
  assert.equal(cancelledPlan?.runs[0]?.state,'cancelled')
  assert.equal(cancelledPlan?.runs[0]?.items[0]?.state,'cancelled')
  await pool.query(`UPDATE platform_geo.publish_plans SET next_run_at=clock_timestamp()-interval '1 second'
    WHERE tenant_id=$1 AND id=$2::uuid`,[aTenant.id,manualPlan.id])
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  const raceItem=(await pool.query(`SELECT r.id AS run_id,i.id AS item_id FROM platform_geo.publish_plan_runs r
    JOIN platform_geo.publish_plan_items i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE r.tenant_id=$1 AND r.plan_id=$2::uuid AND i.state='awaiting_review'
    ORDER BY r.scheduled_at DESC LIMIT 1`,[aTenant.id,manualPlan.id])).rows[0]
  assert.ok(raceItem)
  const race=await Promise.allSettled([
    planA.skipItem(raceItem.run_id,raceItem.item_id),
    manualPublisher.enqueue(raceItem.item_id,{articleID:article.id,version:article.version,collection:'news',categoryID:newsCategory.id,publishAt:null},target,article),
  ])
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1,'Only approval or skip may win the row lock')
  const finalRace=(await pool.query(`SELECT i.state,i.intent_id,r.state AS run_state FROM platform_geo.publish_plan_items i
    JOIN platform_geo.publish_plan_runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id
    WHERE i.tenant_id=$1 AND i.id=$2::uuid`,[aTenant.id,raceItem.item_id])).rows[0]
  if(finalRace.state==='skipped'){
    assert.equal(finalRace.intent_id,null);assert.equal(finalRace.run_state,'skipped')
    assert.equal(Number((await pool.query('SELECT count(*)::int AS n FROM platform_geo.publish_intents WHERE tenant_id=$1 AND id=$2::uuid',[aTenant.id,raceItem.item_id])).rows[0].n),0)
  }else{
    assert.equal(finalRace.state,'queued');assert.equal(finalRace.intent_id,raceItem.item_id);assert.equal(finalRace.run_state,'queued')
  }
  checks.push('计划调度集成：客户时区下逐篇/目标/时间预览、文章/任务来源、一篇多发/轮转分配、多客户隔离、审核/跳过并发序列化、自动计划仅入现有队列及重复派发保护')

  const autoTask=await createGeoTaskStore(pool,aTenant.id,user.id).save(randomUUID(),parseGeoTask({...settings,name:'自动创作执行验证',mode:'repeat'}))
  const autoConfig={...planConfig(target),sourceMode:'tasks' as const,sourceIDs:[autoTask.id],approvalMode:'auto' as const,maxArticles:1,
    schedule:{cadence:'once' as const,runAt:null,timezone:'Asia/Shanghai',startDate:new Date().toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10)}}
  const autoPlan=await planA.save(randomUUID(),'自动生成后发布',autoConfig)
  await planA.action(autoPlan.id,'activate',autoPlan.version)
  await pool.query("UPDATE platform_geo.publish_plans SET next_run_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2::uuid",[aTenant.id,autoPlan.id])
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  const autoRun=(await pool.query("SELECT * FROM platform_geo.publish_plan_runs WHERE tenant_id=$1 AND plan_id=$2::uuid",[aTenant.id,autoPlan.id])).rows[0]
  assert.equal(autoRun.state,'preparing')
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),false,'Waiting AI must not requeue jobs or dispatch twice')
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND task_id=$2::uuid",[aTenant.id,autoTask.id])).rows[0].n),1)
  await runOneGeoArticle(pool,{key:'fixture-only',model:'fixture',authorize:async()=>true,refresh:async(_p,_t,c)=>c,
    generate:async(c:ArticleContext)=>({content:validateGeoArticle({title:'配电柜自动创作资料',summary:'配电柜安装条件。',html:`<h2>安装条件</h2><p>${source.excerpt}<a href="${source.url}">配电柜资料</a></p><p><img src="${c.materialGroup.images[0].url}"></p>`},c),warnings:[]})})
  assert.equal((await pool.query('SELECT status FROM platform_geo.articles WHERE tenant_id=$1 AND task_id=$2::uuid',[aTenant.id,autoTask.id])).rows[0].status,'ready')
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),true)
  assert.equal(await dispatchOneGeoPlan(pool,{authorize:authPlan,canAuto:()=>true}),false)
  for(let index=0;index<8;index++)if(!await runOneGeoPublication(payload,{authorize:async()=>user,refresh:async(_p,_t,c)=>c}))break
  const result=(await pool.query(`SELECT i.state,p.target_id FROM platform_geo.publish_plan_items i
    JOIN platform_geo.publish_intents p ON p.tenant_id=i.tenant_id AND p.id=i.intent_id
    WHERE i.tenant_id=$1 AND i.run_id=$2::uuid`,[aTenant.id,autoRun.id])).rows[0]
  assert.equal(result.state,'published');assert.ok(result.target_id)
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM platform_geo.publish_plan_events WHERE tenant_id=$1 AND run_id=$2::uuid AND event='generation_requested'",[aTenant.id,autoRun.id])).rows[0].n),1)
  checks.push('自动计划真实SQL衔接：没有文章时原子入生成队列；等待AI不重复调用；合格正文自动可发布；同一排期继续发布；同客户限定与重复派发保护')
  const report={passed:true,database,scratchOnly:true,schemaOnlyClone:true,actualPayloadCMS:true,actualCustomerPublications:0,fixturePublications:{initialNews:1,initialBlog:1,automaticPlanNews:1},
    planFixtures:{manual:'awaiting_review_then_skipped_then_queued',automatic:'queued',crossTenant:'rejected',duplicateDispatch:'prevented',reviewSkipRace:'serialized'},actualAIRequests:0,actualSourceRequests:0,checks}
  const reportDirectory=process.env.GEO_TEST_REPORT_DIR || 'docs/geo/evidence/step-07'
  await mkdir(reportDirectory,{recursive:true})
  await writeFile(`${reportDirectory}/postgres-verification.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{await payload.destroy()}
process.exit(0)
