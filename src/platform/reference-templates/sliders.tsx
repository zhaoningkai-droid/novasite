'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import Swiper from 'swiper'
import type { Banner } from '@/platform/new-templates/Carousel'
import { templateCopy } from '@/platform/new-templates/copy'
import type { SiteLocale } from '@/platform/site-locales'
import { WaterRipples, useSourceReveals } from './MotionEffects'
export function SourceReveals({children}:{children:ReactNode}) {
 useSourceReveals()
 return <>{children}</>
}
export function SourceSlider({children,kind,columns=3,auto=false}:{children:ReactNode;kind:string;columns?:number;auto?:boolean}) {
 const root=useRef<HTMLDivElement>(null),previous=useRef<HTMLButtonElement>(null),next=useRef<HTMLButtonElement>(null),dots=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!root.current)return;const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;const s=new Swiper(root.current,{slidesPerView:columns,spaceBetween:20,watchOverflow:true,speed:reduced?0:700,simulateTouch:true,grabCursor:true,loop:false,autoplay:auto&&!reduced?{delay:3300,disableOnInteraction:false}:false,navigation:{prevEl:previous.current!,nextEl:next.current!},pagination:{el:dots.current!,clickable:true},breakpoints:{0:{slidesPerView:1,spaceBetween:10},640:{slidesPerView:Math.min(2,columns),spaceBetween:15},989:{slidesPerView:columns,spaceBetween:20}}});return()=>s.destroy(true,true)},[columns,auto])
 return <div className={`rt-source-slider ${kind}`}><div ref={root} className="swiper-container"><div className="swiper-wrapper">{children}</div></div><div className="rt-source-slider-controls"><button ref={previous} aria-label="←">←</button><div ref={dots} className="swiper-pagination"/><button ref={next} aria-label="→">→</button></div></div>
}
export function SourceBanner({banners,company,locale,k712=false}:{banners:Banner[];company:string;locale:SiteLocale;k712?:boolean}) {
 const root=useRef<HTMLDivElement>(null),s=useRef<Swiper|null>(null),dots=useRef<HTMLDivElement>(null);const t=templateCopy(locale)
 useEffect(()=>{if(!root.current||!banners.length)return;const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;const slider=new Swiper(root.current,{effect:k712?'fade':'slide',loop:banners.length>1,speed:reduced?0:1000,simulateTouch:true,grabCursor:true,watchOverflow:true,autoplay:banners.length>1&&!reduced?{delay:k712?3600:5000,disableOnInteraction:false}:false,pagination:{el:dots.current!,clickable:true}});s.current=slider;return()=>{s.current=null;slider.destroy(true,true)}},[banners.length,k712])
 if(!banners.length)return <div className="rt-empty-banner"><h1>{company}</h1></div>
 return <div className={`rt-source-banner ${k712?'rt-source-banner712':'hero'}`} id={k712?'banner':undefined}><div className="swiper-container" ref={root}><div className="swiper-wrapper">{banners.map((b,i)=><div className="swiper-slide" key={i}><picture>{b.mobileImage?<source media="(max-width:767px)" srcSet={b.mobileImage}/>:null}{b.desktopImage||b.mobileImage?<img src={b.desktopImage||b.mobileImage} alt={b.title||company} draggable={false} fetchPriority={i===0?'high':'auto'}/>:null}</picture>{b.title||b.description?<div className="rt-source-banner-copy"><h1>{b.title}</h1><p>{b.description}</p>{b.href?<a href={b.href}>{t.detail} →</a>:null}</div>:null}</div>)}</div>{banners.length>1?<><button className="rt-banner-previous" aria-label={t.previous} onClick={()=>s.current?.slidePrev()}>‹</button><button className="rt-banner-next" aria-label={t.next} onClick={()=>s.current?.slideNext()}>›</button><div className="swiper-pagination" ref={dots}/></>:null}</div></div>
}
export function RipplePanel({children}:{children:ReactNode}){return <section className="consultation"><WaterRipples/>{children}</section>}
