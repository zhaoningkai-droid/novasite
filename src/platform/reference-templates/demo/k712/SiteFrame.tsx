'use client'
import { DemoAnchor } from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react'
import Link from '../DemoLink'
import { useK712Site } from './TemplateData'
import sampleFrame from './frame-data.json'
import './frame.css'
function useFrame() {
  const site = useK712Site()
  if (!site) return { site: null, frame: sampleFrame }
  const menu = site.links.map((l) => ({
    text: l.label,
    href: l.href,
    children: (l.children || []).map((c) => ({ text: c.label, href: c.href, children: [] })),
  }))
  const names: Record<string, string> = {
    zh: '简体中文',
    en: 'English',
    es: 'Español',
    ar: 'العربية',
    ru: 'Русский',
    id: 'Bahasa Indonesia',
    de: 'Deutsch',
  }
  return {
    site,
    frame: {
      ...sampleFrame,
      logo: site.logo || '',
      headerImage: sampleFrame.headerImage,
      menu,
      languages: site.languages.map((code) => ({
        text: names[code] || code,
        href: site.base.replace(/\/[^/]+$/, '/' + code),
        image:
          sampleFrame.languages.find((l) => l.text === (names[code] || code))?.image ||
          sampleFrame.languages[0].image,
        hidden: false,
      })),
      columns: [
        {
          title: '快速导航',
          contact: false,
          links: (site.quickLinks.length ? site.quickLinks : site.links).map((l) => ({
            text: l.label,
            href: l.href,
          })),
        },
        ...site.links
          .filter((l) => l.children?.length)
          .slice(0, 2)
          .map((l) => ({
            title: l.label,
            contact: false,
            links: (l.children || []).map((c) => ({ text: c.label, href: c.href })),
          })),
        { title: site.company, contact: true, links: [] },
      ],
    },
  }
}
type MenuItem = {
  text: string
  href: string
  children: MenuItem[]
}
function Menu({ items, mobile = false }: { items: MenuItem[]; mobile?: boolean }) {
  const [open, setOpen] = useState<string[]>([])
  return (
    <ul className={mobile ? 'main-menu-list mobile-list' : 'main-menu-list'}>
      {items.map((item) => (
        <li className={`dropdown on ${item.children.length ? 'has-children' : ''}`} key={item.href}>
          <DemoAnchor href={item.href} title={item.text}>
            <i className="iconfont icon-lingxing" />
            <span>{item.text}</span>
            {mobile && item.children.length > 0 && (
              <button
                aria-label={`展开${item.text}`}
                aria-expanded={open.includes(item.href)}
                onClick={(e) => {
                  e.preventDefault()
                  setOpen((v) =>
                    v.includes(item.href) ? v.filter((x) => x !== item.href) : [...v, item.href],
                  )
                }}
              >
                <i className="iconfont icon-jiantou_liebiaozhankai_o" />
              </button>
            )}
          </DemoAnchor>
          {item.children.length > 0 && (
            <ul
              className="yiji"
              style={mobile ? { display: open.includes(item.href) ? 'block' : 'none' } : undefined}
            >
              {item.children.map((child) => (
                <li className={child.children.length ? 'has-children' : ''} key={child.href + child.text}>
                  <div className="li_item">
                    <DemoAnchor href={child.href}>{child.text}</DemoAnchor>
                    {child.children.length > 0 && (
                      <button
                        aria-label={`展开${child.text}`}
                        aria-expanded={open.includes(child.href)}
                        onClick={() =>
                          setOpen((v) =>
                            v.includes(child.href)
                              ? v.filter((x) => x !== child.href)
                              : [...v, child.href],
                          )
                        }
                      >
                        <i className="iconfont icon-jiantou_liebiaozhankai_o" />
                      </button>
                    )}
                  </div>
                  {child.children.length > 0 && (
                    <ul
                      className={`erji ${open.includes(child.href) ? 'show' : ''}`}
                      style={
                        mobile
                          ? { display: open.includes(child.href) ? 'block' : 'none' }
                          : undefined
                      }
                    >
                      {child.children.map((c) => (
                        <li key={c.href + c.text}>
                          <DemoAnchor href={c.href}>{c.text}</DemoAnchor>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
export function Header({ home = false }: { home?: boolean }) {
  const { site, frame } = useFrame()
  const [menu, setMenu] = useState(false),
    [scrolled, setScrolled] = useState(false)
  const [langs, setLangs] = useState(false),
    [allLangs, setAllLangs] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    document.body.classList.toggle('locked', menu)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('keydown', esc)
    return () => {
      document.body.classList.remove('locked')
      document.removeEventListener('keydown', esc)
    }
  }, [menu])
  return (
    <>
      <style>{frame.headerStyles}</style>
      <header
        id="header"
        className={`header-transparent fixed-top ${scrolled ? 'header-scrolled' : ''}`}
        data-home={home}
      >
        <div className="main-header-content">
          <div className="main-header-logo">
            <Link href="/" aria-label={(site?.company || 'Hegr') + ' 首页'}>
              {frame.logo ? (
                <img src={frame.logo} alt={site?.company || 'Hegr'} />
              ) : (
                <strong>{site?.headerText || site?.company}</strong>
              )}
            </Link>
          </div>
          <button
            className="mobile-nav-toggler"
            aria-label="打开导航菜单"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <i className="iconfont icon-menu2" />
          </button>
          <div className="main-header-right">
            {frame.headerImage && <img src={frame.headerImage} className="primg" alt="" />}
            <div className="main-menu-wrapper">
              <Menu items={frame.menu} />
            </div>
            <div className="main-header-other">
              <div className="head_lang">
                <div className={`language-switcher ${langs ? 'keep-open' : ''}`}>
                  <button
                    className="language-btn"
                    aria-label="语言选择"
                    aria-expanded={langs}
                    onClick={() => setLangs((v) => !v)}
                  >
                    <span className="globe-icon">
                      <img src={frame.languages[0]?.image} width="20" alt="" />
                    </span>
                    <span>
                      {site
                        ? frame.languages.find((l) => l.href === site.base)?.text || site.locale
                        : '简体中文'}
                    </span>
                    <span className="arrow-icon">▼</span>
                  </button>
                  <div className="language-dropdown">
                    <div className="language-list">
                      {frame.languages
                        .filter((l) => allLangs || !l.hidden)
                        .map((l) => (
                          <div className="language-item" key={l.href}>
                            <img src={l.image} alt="" />
                            <DemoAnchor href={l.href}>{l.text}</DemoAnchor>
                          </div>
                        ))}
                    </div>
                    <button className="more-languages" onClick={() => setAllLangs((v) => !v)}>
                      {allLangs ? '收起语言' : '更多语言'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div
        className={`mobile-nav-wrapper ${menu ? 'expanded' : ''}`}
        role={menu ? 'dialog' : undefined}
        aria-label="网站导航"
        aria-hidden={!menu}
        inert={!menu}
      >
        <div className="mobile-nav-overlay mobile-nav-toggler" onClick={() => setMenu(false)} />
        <div className="mobile-nav-content">
          <button
            className="mobile-nav-close mobile-nav-toggler"
            aria-label="关闭导航菜单"
            onClick={() => setMenu(false)}
          >
            <i className="iconfont icon-chahao" />
          </button>
          <div className="mobile-nav-container">
            <Menu items={frame.menu} mobile />
          </div>
        </div>
      </div>
    </>
  )
}
export function Footer() {
  const { site, frame } = useFrame()
  return (
    <>
      <style>{frame.footerStyles}</style>
      <div className="footerr">
        <div className="wal">
          {frame.columns.map((col) => (
            <div className={`foot_item ${col.contact ? 'foot1' : 'wepnone'}`} key={col.title}>
              <div className="foot_tit">
                <b>{col.title}</b>
                <em />
              </div>
              {col.contact ? (
                <>
                  <p>
                    <DemoAnchor href={`tel:${site ? site.contact.phone || '' : '123456789'}`}>
                      电话：{site ? site.contact.phone : '123456789'}
                    </DemoAnchor>
                  </p>
                  <p>
                    <DemoAnchor
                      href={
                        site
                          ? `https://wa.me/${(site.contact.whatsapp || '').replace(/[^0-9]/g, '')}`
                          : 'https://api.whatsapp.com/send?phone=45454545'
                      }
                    >
                      WhatsApp：{site ? site.contact.whatsapp : '45454545'}
                    </DemoAnchor>
                  </p>
                  <p>
                    <DemoAnchor
                      href={`mailto:${site ? site.contact.email || '' : '123456789@gmail.com'}`}
                    >
                      邮箱：{site ? site.contact.email : '123456789@gmail.com'}
                    </DemoAnchor>
                  </p>
                  <p>地址： {site ? site.contact.address : '河北省石家庄市桥西区石家庄站2层'}</p>
                </>
              ) : (
                <ul>
                  {col.links.map((a) => (
                    <li key={a.href + a.text}>
                      <DemoAnchor href={a.href}>{a.text}</DemoAnchor>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="foot_bot">
        <div className="wal">
          <p>
            版权所有 © {new Date().getFullYear()} {site ? site.company : 'Hegr'}{' '}
          </p>
        </div>
      </div>
    </>
  )
}
export function Suspension({ home = false }: { home?: boolean }) {
  const { site } = useFrame()
  return (
    <div id="suspension">
      <ul>
        <li className="tel">
          <DemoAnchor href={`tel:${site ? site.contact.phone || '' : '123456789'}`}>
            <span className="fa fa-phone" />
            <span className="txt">{site ? site.contact.phone : '123456789'}</span>
          </DemoAnchor>
        </li>
        <li className="email">
          <DemoAnchor href={`mailto:${site ? site.contact.email || '' : '123456789@gmail.com'}`}>
            <span className="fa fa-envelope" />
            <span className="txt">{site ? site.contact.email : '123456789@gmail.com'}</span>
          </DemoAnchor>
        </li>
        <li className="ewm" tabIndex={0}>
          <span className="fa fa-whatsapp" />
          <div className="ewm-box">
            <DemoAnchor
              href={
                site
                  ? `https://wa.me/${(site.contact.whatsapp || '').replace(/[^0-9]/g, '')}`
                  : 'https://api.whatsapp.com/send?phone=45454545'
              }
            >
              {site ? site.contact.whatsapp : '45454545'}
            </DemoAnchor>
          </div>
        </li>
        <li className="backtop" id="scroll">
          <button
            aria-label="返回顶部"
            onClick={() => {
              if (home) window.dispatchEvent(new CustomEvent('k712:section', { detail: 0 }))
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className="fa fa-angle-double-up" />
          </button>
        </li>
      </ul>
    </div>
  )
}
export function SiteFrame({
  children,
  home = false,
}: {
  children: React.ReactNode
  home?: boolean
}) {
  return (
    <>
      <DemoAnchor className="k712-skip" href="#main">
        跳至主要内容
      </DemoAnchor>
      <Header home={home} />
      {children}
      {!home && <Footer />}
      <Suspension home={home} />
    </>
  )
}
