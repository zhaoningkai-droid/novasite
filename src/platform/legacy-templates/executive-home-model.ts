/** Tenant-owned settings for the executive homepage; this model never contains demo defaults. */
export type ExecutiveMedia = number | { id?: number; alt?: string | null; thumbnailURL?: string | null; url?: string | null } | null

export type ExecutiveImageItem = {
  alt?: string | null
  caption?: string | null
  image?: ExecutiveMedia
  label?: string | null
  name?: string | null
  sortOrder?: number | null
}

export type ExecutiveAdvantage = {
  description?: string | null
  icon?: string | null
  sortOrder?: number | null
  title?: string | null
}

export type ExecutiveHomeSettings = {
  advantages?: ExecutiveAdvantage[] | null
  advantagesEnabled?: boolean | null
  advantagesTitle?: string | null
  categoriesTitle?: string | null
  caseCTAButton?: string | null
  caseCTADescription?: string | null
  caseCTATitle?: string | null
  casesTitle?: string | null
  certificates?: ExecutiveImageItem[] | null
  certificatesEnabled?: boolean | null
  certificatesTitle?: string | null
  faqEnabled?: boolean | null
  faqLimit?: number | null
  faqTitle?: string | null
  introBackground?: ExecutiveMedia
  introButtonLabel?: string | null
  introOverlay?: number | null
  marks?: ExecutiveImageItem[] | null
  marksEnabled?: boolean | null
  newsTitle?: string | null
  productCTAButton?: string | null
  productCTADescription?: string | null
  productCTATitle?: string | null
  productsTitle?: string | null
  strengthGallery?: ExecutiveImageItem[] | null
  strengthTitle?: string | null
  videoPoster?: ExecutiveMedia
}

export type ExecutiveHomeSlide = {
  desktopImage?: string | null
  description?: string | null
  linkType?: 'external' | 'internal' | 'none' | null
  linkURL?: string | null
  mobileImage?: string | null
  sortOrder?: number | null
  title?: string | null
}

export type ExecutiveHomeCard = {
  category?: string | null
  date?: string | null
  description?: string | null
  href: string
  image?: string | null
  imageAlt?: string | null
  label?: string | null
  title: string
  value?: string
  unit?: string
}

export type ExecutiveFAQItem = { answer: string; question: string }

export type ExecutiveTenantHomeData = {
  about: { background: string; buttonLabel: string; overlay: number; text: string; title: string }
  advantages: ExecutiveAdvantage[]
  banners: ExecutiveHomeSlide[]
  cases: ExecutiveHomeCard[]
  categories: ExecutiveHomeCard[]
  certificates: ExecutiveImageItem[]
  companyName: string
  faq: ExecutiveFAQItem[]
  faqTitle: string
  footerBackground: string
  footerOverlay: number
  locale: string
  news: ExecutiveHomeCard[]
  products: ExecutiveHomeCard[]
  settings: ExecutiveHomeSettings
  siteSlug: string
  strengthGallery: ExecutiveImageItem[]
  strengthItems: ExecutiveHomeCard[]
  videoPoster: string
  videoSource: string
  showCases: boolean
  showFAQ: boolean
  showInquiry: boolean
  showNews: boolean
  showProducts: boolean
  showStrength: boolean
  inquiry: { description: string; requiredFields: Record<string, boolean>; title: string }
  contact: { address: string; email: string; phone: string; whatsapp: string; qrCode: string }
}
