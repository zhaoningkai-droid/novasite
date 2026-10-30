'use client'
import { useK607Site } from './TemplateData'
import { useSourceReveals } from './MotionEffects'
import { DemoAnchor } from '../DemoLink'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, Mail, Phone } from 'lucide-react'
import { Header, Footer } from './HomePage'
export function SiteFrame({ children }: { children: ReactNode }) {
  useSourceReveals()
  const site = useK607Site()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 500)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <>
      <DemoAnchor className="skip-link" href="#main">
        跳至主要内容
      </DemoAnchor>
      <Header />
      <main id="main" className="inner-main">
        {children}
      </main>
      <Footer />
      {scrolled && (
        <div className="floating-contact">
          <DemoAnchor
            href={`tel:${site ? site.contact.phone || '' : '123456789'}`}
            aria-label="电话"
          >
            <Phone size={21} />
          </DemoAnchor>
          <DemoAnchor
            href={`mailto:${site ? site.contact.email || '' : '123456789@gmail.com'}`}
            aria-label="邮箱"
          >
            <Mail size={21} />
          </DemoAnchor>
          <button
            aria-label="返回顶部"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ArrowUp size={21} />
          </button>
        </div>
      )}
    </>
  )
}
