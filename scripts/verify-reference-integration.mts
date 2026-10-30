// Read-only acceptance scenarios from the user's template/demo/tenant separation requirements.
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {getPayload} from 'payload'
import config from '../src/payload.config'
import {loadIndustryTenantPage} from '../src/platform/industry-templates/tenant'
import {ReferencePage} from '../src/platform/reference-templates/Page'
import {referenceKeys} from '../src/platform/reference-templates/keys'
import type {Tenant} from '../src/payload-types'
const payload=await getPayload({config}),results:unknown[]=[]
try {
 const {docs:sites}=await payload.find({collection:'tenants',depth:2,limit:100,overrideAccess:true,locale:'zh'})
 const site=sites.find(s=>s.slug==='huadong-fasteners')||sites[0];assert(site)
 const empty:Tenant={...site,id:-999999,slug:'empty-readonly-check',branding:{companyName:'EMPTY CHECK'},fixedPages:{},contact:{}}
 for(const key of referenceKeys){
  for(const [label,company] of [['customer',site],['empty',empty]] as const){
   for(const path of [[],['products'],['news'],['cases'],['blog'],['about'],['faqs'],['contact']]){
    const model=await loadIndustryTenantPage({site:company,locale:'zh',base:`/s/${company.slug}/zh`,path,template:{key}})
    const html=renderToStaticMarkup(React.createElement(ReferencePage,{model,templateKey:key}))
    assert(!/Hegr|Heger|中国商贸有限公司|123456789@gmail|\/sites\/k(?:607|712)\//i.test(html),'Source demo content leaked into a tenant page')
    if(label==='empty'){assert(!model.products?.length&&!model.cases?.length&&!model.news?.length&&!model.cards?.length);assert(!model.intro&&!model.video&&!model.images?.length)}
    results.push({key,kind:label,path:'/'+path.join('/'),bytes:Buffer.byteLength(html),sampleLeak:false})
   }
  }
  for(const collection of ['products','news','cases','posts'] as const){
   const docs=await payload.find({collection,limit:1,depth:0,locale:'zh',overrideAccess:true,where:{and:[{tenant:{equals:site.id}},{_status:{equals:'published'}}]}})
   if(!docs.docs[0])continue
   const section=collection==='posts'?'blog':collection
   const model=await loadIndustryTenantPage({site,locale:'zh',base:`/s/${site.slug}/zh`,path:[section,docs.docs[0].slug],template:{key}})
   const html=renderToStaticMarkup(React.createElement(ReferencePage,{model,templateKey:key}))
   assert(html.includes(docs.docs[0].title.replaceAll('&','&amp;')))
   results.push({key,kind:'customer-detail',section,actualTitle:docs.docs[0].title,bytes:Buffer.byteLength(html)})
  }
 }
 await mkdir('docs/evidence/k607-k712-integration-20261028',{recursive:true});await writeFile('docs/evidence/k607-k712-integration-20261028/tenant-render-check.json',JSON.stringify({mode:'read-only server rendering, no tenant selection/content writes; excludes browser interactions and real inquiry sending',results},null,2))
 console.log('Read-only tenant render scenarios passed:',results.length)
 await payload.destroy();process.exit(0)
}catch(e){console.error(e);await payload.destroy();process.exit(1)}
