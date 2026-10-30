import type { ReactNode } from 'react'
import { Suspense } from 'react'
import type { SiteLocale } from '@/platform/site-locales'
import type { IndustryLink, IndustryPageModel } from '@/platform/industry-templates/model'
import { Contact } from '@/platform/industry-templates/Page'
import { templateCopy } from '@/platform/new-templates/copy'
import { ReferenceHeader, QRImages } from './controls'
import type { ReferenceKey } from './keys'
import './tenant.css'
export function ReferenceShell({templateKey,company,tagline,headerText,logo,base,locale,languages,links,quickLinks,footerIntro,children,model}:{templateKey:ReferenceKey;company:string;tagline?:string|null;headerText?:string;logo?:string;base:string;locale:SiteLocale;languages:SiteLocale[];links:IndustryLink[];quickLinks?:IndustryLink[];footerIntro?:string|null;children:ReactNode;model:IndustryPageModel}) {
 const t=templateCopy(locale)
 return <div className={`rt-shell rt-${templateKey==='plush-607-v1'?'607':'712'} clone-demo-${templateKey==='plush-607-v1'?'k607':'k712'}`} data-template={templateKey} lang={locale} dir={locale==='ar'?'rtl':'ltr'}><a className="rt-skip" href="#rt-main">{t.skip}</a>{model.preview?<aside className="rt-preview">{t.preview}</aside>:null}<Suspense fallback={<header className="rt-header">{company}</header>}><ReferenceHeader company={company} headerText={headerText} tagline={tagline} logo={logo} base={base} locale={locale} languages={languages} links={links}/></Suspense>{children}<footer className="rt-footer" id="rt-footer"><div className="rt-wrap rt-footer-grid"><section><h2>{company}</h2>{footerIntro||tagline?<p>{footerIntro||tagline}</p>:null}<Contact model={model}/><QRImages items={model.contact?.qr||[]}/></section><section><h2>{t.links}</h2>{(quickLinks?.length?quickLinks:links).map((l,i)=><a href={l.href} key={i}>{l.label}</a>)}</section><section><h2>{t.products}</h2>{links.find(l=>l.href.split('?')[0]===base+'/products')?.children?.map((l,i)=><a href={l.href} key={i}>{l.label}</a>)}</section></div><p className="rt-copyright">© {new Date().getFullYear()} {company}</p></footer><a className="rt-backtop" href="#rt-main" aria-label={t.home}>↑</a></div>
}
