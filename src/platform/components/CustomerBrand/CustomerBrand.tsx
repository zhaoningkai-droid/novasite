import Link from 'next/link'
import type { MouseEventHandler } from 'react'
import styles from './customer-brand.module.css'

/** Customer data only. Demo headers keep their own identity and presentation. */
export function CustomerBrand({ companyName, headerText = '', logo, href, className = '', onClick }: {
  companyName: string
  headerText?: string | null
  logo?: string | null
  href: string
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  const text = headerText?.trim() || ''
  return <Link aria-label={companyName} className={`${className} ${styles.brand} ${text ? styles.withText : styles.logoOnly}`} href={href} onClick={onClick}>
    {logo ? <img className={styles.image} src={logo} width={280} height={72} alt="" /> : null}
    {text ? <span className={styles.text}>{text}</span> : null}
  </Link>
}
