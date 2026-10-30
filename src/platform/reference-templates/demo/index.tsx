import { notFound } from 'next/navigation'
import { DemoLinks } from './DemoLink'
import { HomePage as K607Home } from './k607/HomePage'
import { SiteFrame as K607Frame } from './k607/SiteFrame'
import { PageChrome } from './k607/PageChrome'
import { ProductPage } from './k607/ProductPages'
import { EditorialPage } from './k607/EditorialPages'
import { CorporatePage } from './k607/CorporatePages'
import chrome from './k607/page-chrome.json'
import { HomePage as K712Home } from './k712/HomePage'
import { SiteFrame as K712Frame } from './k712/SiteFrame'
import { InnerPage } from './k712/InnerPages'
import pages from './k712/inner-data.json'
import { referenceCode, type ReferenceKey } from '../keys'
import './k607/base.css'
import './k712/base.css'
import './k712/inner.css'
import './isolation.css'
export function ReferenceDemo({templateKey,locale,path=[],page}:{templateKey:ReferenceKey;locale:string;path?:string[];page?:string}) {
 // The source clones contain Chinese content. Do not advertise unimplemented translations.
 if(locale!=='zh')notFound()
 const code=referenceCode(templateKey), base=`/template-demo/${templateKey}/zh`
 let url='/'+path.join('/');if(url!=='/'&&!url.endsWith('.html'))url+='/'
 if(url==='/contact.html')url='/contact/'
 if(url!=='/' && !(code==='k607'?url in chrome:url in pages||url.replace(/\/$/,'') in pages))notFound()
 return <div className={`clone-demo-root clone-demo-${code}`} data-template={templateKey} lang="zh-CN"><aside className="reference-demo-notice">模板效果演示 · 样例不导入客户站 · 表单仅作本地演示</aside><DemoLinks base={base}>{code==='k607'?(url==='/'?<K607Home/>:<K607Frame>{/^\/(about|contact|faq)(\/|\.html)/.test(url)?<CorporatePage path={url}/>:<><PageChrome path={url}/>{url.startsWith('/product')?<ProductPage path={url} page={page}/>:<EditorialPage path={url} page={page}/>}</>}</K607Frame>):<K712Frame home={url==='/'}><main id="main">{url==='/'?<K712Home/>:<InnerPage path={url} query={page}/>}</main></K712Frame>}</DemoLinks></div>
}
