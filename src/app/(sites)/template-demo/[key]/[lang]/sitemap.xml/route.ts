import { notFound } from 'next/navigation'
import { isReferenceKey } from '@/platform/reference-templates/keys'
import chrome from '@/platform/reference-templates/demo/k607/page-chrome.json'
import pages from '@/platform/reference-templates/demo/k712/inner-data.json'
export async function GET(request:Request,{params}:{params:Promise<{key:string;lang:string}>}) {
 const {key,lang}=await params;if(!isReferenceKey(key)||lang!=='zh')notFound()
 const base=new URL(`/template-demo/${key}/${lang}`,request.url).href
 const paths=['/',...Object.keys(key==='plush-607-v1'?chrome:pages)]
 const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;')
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(paths)].map(path=>`<url><loc>${escape(base+(path==='/'?'':path))}</loc></url>`).join('')+'</urlset>',{headers:{'content-type':'application/xml','x-robots-tag':'noindex'}})
}
