import {writeFile,mkdir} from 'node:fs/promises'
import {getPayload} from 'payload'
import config from '../src/payload.config'
const payload=await getPayload({config})
try{
const site=(await payload.find({collection:'tenants',locale:'zh',depth:2,limit:1,overrideAccess:true,where:{slug:{equals:'huadong-fasteners'}}})).docs[0]
const routes:{path:string;locale:string;kind:string;expectedTitle?:string}[]=[];const counts:Record<string,number>={}
for(const locale of site.enabledLocales||['zh']){
 const base=`/s/${site.slug}/${locale}`,tenant={tenant:{equals:site.id}},published={_status:{equals:'published'}}
 for(const section of ['','products','news','cases','blog','about','faqs','contact'])routes.push({path:base+(section?'/'+section:''),locale,kind:section||'home'})
 for(const [collection,section,limit] of [['products','products',12],['news','news',9],['cases','cases',6],['posts','blog',9]] as const){
  const data=await payload.find({collection,locale,depth:0,pagination:false,overrideAccess:true,where:{and:[tenant,published]}});counts[locale+':'+section]=data.totalDocs
  for(const item of data.docs)routes.push({path:`${base}/${section}/${item.slug}`,locale,kind:section+'-detail',expectedTitle:item.title})
  for(let page=2;page<=Math.ceil(data.totalDocs/limit);page++)routes.push({path:`${base}/${section}?page=${page}`,locale,kind:section+'-page'})
  const cc=collection==='products'?'product-categories':collection==='news'?'news-categories':collection==='cases'?'case-categories':'categories'
  const cats=await payload.find({collection:cc,locale,depth:0,pagination:false,overrideAccess:true,where:tenant})
  for(const cat of cats.docs)routes.push({path:`${base}/${section}?category=${encodeURIComponent(cat.slug||'')}`,locale,kind:section+'-category'})
 }
}
await mkdir('.private/k607-k712-tenant-acceptance-20261028',{recursive:true});await writeFile('.private/k607-k712-tenant-acceptance-20261028/tenant-before.json',JSON.stringify(site,null,2),{mode:0o600});await writeFile('docs/evidence/k607-k712-tenant-acceptance-20261028/routes.json',JSON.stringify({siteID:site.id,slug:site.slug,locales:site.enabledLocales,counts,routes},null,2));console.log('Enumerated',routes.length,'routes in',site.enabledLocales?.length,'locales');await payload.destroy();process.exit(0)
}catch(e){console.error(e);await payload.destroy();process.exit(1)}
