'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { SiteLocale } from '@/platform/site-locales'
import type { IndustryLink } from '@/platform/industry-templates/model'
import { templateLocaleHref } from '@/platform/new-templates/links'
import { templateCopy } from '@/platform/new-templates/copy'
const names:Record<SiteLocale,string>={zh:'简体中文',en:'English',es:'Español',ar:'العربية',de:'Deutsch',id:'Bahasa Indonesia',ru:'Русский'}
export function ReferenceHeader({company,headerText,tagline,logo,base,locale,languages,links}:{company:string;headerText?:string;tagline?:string|null;logo?:string;base:string;locale:SiteLocale;languages:SiteLocale[];links:IndustryLink[]}) {
 const [open,setOpen]=useState(false),[language,setLanguage]=useState(false);const path=usePathname(),query=useSearchParams();const t=templateCopy(locale)
 useEffect(()=>{setOpen(false);setLanguage(false)},[path])
 useEffect(()=>{if(!open)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old}},[open])
 return <header className="rt-header" onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setLanguage(false)}}}><a className="rt-logo" href={base}>{logo?<img src={logo} alt={company}/>:<strong>{headerText||company}</strong>}{tagline?<small>{tagline}</small>:null}</a><button className="rt-menu-button" aria-expanded={open} aria-label={t.links} onClick={()=>setOpen(!open)}>{open?'×':'☰'}</button><nav className={`rt-nav ${open?'rt-open':''}`} aria-label={t.links}>{links.map((l,i)=><div className="rt-nav-item" key={i}><a href={l.href}>{l.label}</a>{l.children?.length?<details><summary aria-label={l.label}>⌄</summary><div className="rt-subnav">{l.children.map((c,j)=><a href={c.href} key={j}>{c.label}</a>)}</div></details>:null}</div>)}</nav><div className="rt-language"><button onClick={()=>setLanguage(!language)} aria-expanded={language}>◎ {names[locale]} ⌄</button>{language?<div>{languages.map(lang=><a key={lang} href={templateLocaleHref(base,lang)+(path.startsWith(base)?path.slice(base.length):'')+(query.size?'?'+query:'')}>{names[lang]}</a>)}</div>:null}</div></header>
}
export function QRImages({items}:{items:{label:string;image:string}[]}) {
 const [selected,setSelected]=useState<(typeof items)[number]|null>(null);const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(selected)dialog.current?.showModal()},[selected])
 if(!items.length)return null
 return <><div className="rt-qrs">{items.map(item=><button key={item.label} onClick={()=>setSelected(item)}><img src={item.image} alt={item.label}/><span>{item.label}</span></button>)}</div><dialog className="rt-qr-dialog" ref={dialog} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}>{selected?<><button onClick={()=>dialog.current?.close()} aria-label="关闭">×</button><img src={selected.image} alt={selected.label}/><p>{selected.label}</p></>:null}</dialog></>
}
export function CardSlider({children,label}:{children:ReactNode;label:string}) {
 const track=useRef<HTMLDivElement>(null)
 return <div className="rt-slider"><div ref={track} className="rt-slider-track">{children}</div><div className="rt-slider-controls"><button aria-label={label+' ←'} onClick={()=>track.current?.scrollBy({left:-(track.current.clientWidth),behavior:'smooth'})}>←</button><button aria-label={label+' →'} onClick={()=>track.current?.scrollBy({left:track.current.clientWidth,behavior:'smooth'})}>→</button></div></div>
}
export function ImmersiveHome({children,labels,source=false}:{children:ReactNode;labels:string[];source?:boolean}) {
 const root=useRef<HTMLDivElement>(null),[active,setActive]=useState(0),current=useRef(0)
 const move=(next:number)=>{const value=Math.max(0,Math.min(labels.length-1,next));current.current=value;setActive(value)}
 useEffect(()=>{
  const element=root.current;if(!element)return;let lockedUntil=0,total=0,last=0,touchY=0,touchX=0
  const desktop=()=>window.innerWidth>=989&&!matchMedia('(prefers-reduced-motion: reduce)').matches
  const blocked=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest('input,textarea,select,button,a,[contenteditable],dialog,.rt-subnav,.rt-language'))
  const consume=(direction:number)=>{if(performance.now()<lockedUntil)return;const next=Math.max(0,Math.min(labels.length-1,current.current+direction));if(next!==current.current){lockedUntil=performance.now()+750;move(next)}}
  const wheel=(event:WheelEvent)=>{
   if(!desktop()||event.ctrlKey||blocked(event.target)||Math.abs(event.deltaX)>Math.abs(event.deltaY)||window.scrollY>2)return
   if(current.current===labels.length-1&&event.deltaY>0||current.current===0&&event.deltaY<0)return
   // Yield to genuine scrollable inner content while letting wheel events leave native video.
   let node=event.target instanceof Element?event.target:null
   while(node&&node!==element){const html=node as HTMLElement;const overflow=getComputedStyle(node).overflowY;if(/auto|scroll/.test(overflow)&&html.scrollHeight>html.clientHeight+2&&((event.deltaY>0&&html.scrollTop+html.clientHeight<html.scrollHeight-2)||(event.deltaY<0&&html.scrollTop>0)))return;node=node.parentElement}
   event.preventDefault();const now=performance.now();if(now<lockedUntil){total=0;return}if(now-last>180||total*event.deltaY<0)total=0;last=now;total+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);if(Math.abs(total)>=12){consume(Math.sign(total));total=0}
  }
  const keyboard=(e:KeyboardEvent)=>{if(!desktop()||blocked(e.target)||e.target instanceof Element&&e.target.closest('video')||window.scrollY>2)return;const direction=['ArrowDown','PageDown',' '].includes(e.key)?1:['ArrowUp','PageUp'].includes(e.key)?-1:0;if(direction){e.preventDefault();consume(direction)}if(e.key==='Home'){e.preventDefault();move(0)}if(e.key==='End'){e.preventDefault();move(labels.length-1)}}
  const start=(e:TouchEvent)=>{touchY=e.touches[0].clientY;touchX=e.touches[0].clientX}
  const end=(e:TouchEvent)=>{if(!desktop()||blocked(e.target)||window.scrollY>2)return;const y=touchY-e.changedTouches[0].clientY,x=touchX-e.changedTouches[0].clientX;if(Math.abs(y)>50&&Math.abs(y)>Math.abs(x)*1.2)consume(Math.sign(y))}
  const resize=()=>{if(!desktop())element.style.removeProperty('transform')}
  window.addEventListener('wheel',wheel,{passive:false,capture:true});window.addEventListener('keydown',keyboard);element.addEventListener('touchstart',start,{passive:true});element.addEventListener('touchend',end,{passive:true});window.addEventListener('resize',resize)
  return()=>{window.removeEventListener('wheel',wheel,true);window.removeEventListener('keydown',keyboard);element.removeEventListener('touchstart',start);element.removeEventListener('touchend',end);window.removeEventListener('resize',resize)}
 },[labels.length])
 const go=(i:number)=>{window.scrollTo({top:0});move(i)}
 return <><div className={`rt-fullpage ${source?'k712-home-shell rt-source-scenes':''}`}><div ref={root} id={source?'homePg':undefined} className="rt-immersive" style={{transform:`translate3d(0,-${active*100}vh,0)`}}>{children}</div></div><nav className="rt-scene-nav" aria-label="Sections">{labels.map((label,i)=><button key={i} aria-label={label} aria-current={i===active?'step':undefined} onClick={()=>go(i)}><span/>{label}</button>)}</nav></>
}
export function Reveal({children}:{children:ReactNode}) {
 const root=useRef<HTMLDivElement>(null)
 useEffect(()=>{const elements=root.current?.querySelectorAll('.rt-reveal');if(!elements||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('rt-visible');observer.unobserve(e.target)}}),{threshold:.08});elements.forEach(e=>observer.observe(e));return()=>observer.disconnect()},[])
 return <div ref={root}>{children}</div>
}
