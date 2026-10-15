import { getPayload } from 'payload'

import config from '@payload-config'
import { HomepageBannerEditor } from '@/platform/components/HomepageBannerEditor/HomepageBannerEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function HomepagePage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const tenant = await payload.findByID({ collection: 'tenants', id: company.id, depth: 1, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user })
  const homepage = tenant.fixedPages?.homepage as any
  const about = tenant.fixedPages?.about as any
  const executiveHome = homepage?.executiveHome || {}
  const executiveImages = (items: any[] | undefined) => Array.isArray(items) ? items.map((item: any, index: number) => ({
    alt: item?.alt || '', caption: item?.caption || '', imageID: mediaID(item?.image), imageURL: imageURL(item?.image) || '',
    label: item?.label || '', name: item?.name || '', sortOrder: Number(item?.sortOrder) || index + 1,
  })) : []
  const [products, cases] = await Promise.all([
    payload.find({ collection: 'products', depth: 1, limit: 100, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, where: { and: [{ tenant: { equals: company.id } }, { featured: { equals: true } }, { _status: { equals: 'published' } }] } }),
    payload.find({ collection: 'cases', depth: 1, limit: 100, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, where: { and: [{ tenant: { equals: company.id } }, { featured: { equals: true } }, { _status: { equals: 'published' } }] } }),
  ])
  const imageURL = (media: unknown) => typeof media === 'object' && media && typeof (media as { url?: unknown }).url === 'string' ? (media as { url: string }).url : null
  const mediaID = (media: unknown) => typeof media === 'number' ? media : typeof media === 'object' && media && typeof (media as { id?: unknown }).id === 'number' ? (media as { id: number }).id : undefined
  const savedBanners = Array.isArray(homepage?.banners) ? homepage.banners.map((banner: any, index: number) => ({ desktopImage: banner?.desktopImage || '', desktopMediaID: Number.isInteger(banner?.desktopMediaID) ? banner.desktopMediaID : undefined, description: banner?.description || '', linkType: banner?.linkType === 'internal' || banner?.linkType === 'external' ? banner.linkType : 'none', linkURL: banner?.linkURL || '', mobileImage: banner?.mobileImage || '', mobileMediaID: Number.isInteger(banner?.mobileMediaID) ? banner.mobileMediaID : undefined, navigationImage: banner?.navigationImage || '', navigationMediaID: Number.isInteger(banner?.navigationMediaID) ? banner.navigationMediaID : undefined, sortOrder: Number(banner?.sortOrder) || index + 1, title: banner?.title || '' })) : []
  const recommendedProducts = products.docs.map((product) => ({ id: product.id, imageURL: imageURL(product.gallery?.[0]), title: product.title }))
  const recommendedCases = cases.docs.map((item) => ({ id: item.id, imageURL: imageURL(item.cover), subtitle: item.country || '', title: item.title }))
  const aboutPreview = Array.isArray(about?.modules) ? [...about.modules].sort((left: any, right: any) => (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0)).map((item: any) => ({ description: item?.description || '', imageURL: imageURL(item?.image), title: item?.title || '' })) : []
  const selectedTemplateKey = tenant.selectedTemplate && typeof tenant.selectedTemplate === 'object' ? tenant.selectedTemplate.key : ''
  const initialExecutiveHome = {
    advantages: Array.isArray(executiveHome.advantages) ? executiveHome.advantages.map((item: any, index: number) => ({ description: item?.description || '', icon: item?.icon || '', sortOrder: Number(item?.sortOrder) || index + 1, title: item?.title || '' })) : [],
    advantagesEnabled: executiveHome.advantagesEnabled === true, advantagesTitle: executiveHome.advantagesTitle || '',
    marks: executiveImages(executiveHome.marks), marksEnabled: executiveHome.marksEnabled === true,
    certificates: executiveImages(executiveHome.certificates), certificatesEnabled: executiveHome.certificatesEnabled === true, certificatesTitle: executiveHome.certificatesTitle || '',
    introBackgroundMediaID: mediaID(executiveHome.introBackground), introBackgroundURL: imageURL(executiveHome.introBackground) || '', introOverlay: Number(executiveHome.introOverlay ?? 0.62), introButtonLabel: executiveHome.introButtonLabel || '',
    videoPosterMediaID: mediaID(executiveHome.videoPoster), videoPosterURL: imageURL(executiveHome.videoPoster) || '',
    strengthTitle: executiveHome.strengthTitle || '', strengthGallery: executiveImages(executiveHome.strengthGallery),
    casesTitle: executiveHome.casesTitle || '', categoriesTitle: executiveHome.categoriesTitle || '', productsTitle: executiveHome.productsTitle || '', newsTitle: executiveHome.newsTitle || '',
    faqEnabled: executiveHome.faqEnabled === true, faqTitle: executiveHome.faqTitle || '', faqLimit: Number(executiveHome.faqLimit) || 6,
    caseCTATitle: executiveHome.caseCTATitle || '', caseCTADescription: executiveHome.caseCTADescription || '', caseCTAButton: executiveHome.caseCTAButton || '',
    productCTATitle: executiveHome.productCTATitle || '', productCTADescription: executiveHome.productCTADescription || '', productCTAButton: executiveHome.productCTAButton || '',
  }
  return <HomepageBannerEditor companyID={company.id} aboutPreview={aboutPreview} companySlug={slug} isExecutive={selectedTemplateKey === 'executive-industrial-pro-v1'} initial={{ banners: savedBanners, desktopImage: tenant.branding?.heroImageURL || '', footerLogoMediaID: mediaID(tenant.branding?.logo), footerLogoURL: imageURL(tenant.branding?.logo) || '', introImageID: mediaID(homepage?.introImage), introImageURL: imageURL(homepage?.introImage) || '', mobileImage: (tenant.branding as any)?.mobileHeroImageURL || '', navigationImage: (tenant.branding as any)?.navigationBannerURL || '', heroEyebrow: homepage?.heroEyebrow || '', heroTitle: homepage?.heroTitle || '', heroDescription: homepage?.heroDescription || '', showFeaturedProducts: homepage?.showFeaturedProducts !== false, showNews: homepage?.showNews !== false, showCases: homepage?.showCases !== false, showVideo: homepage?.showVideo === true, videoTitle: homepage?.videoTitle || '', videoDescription: homepage?.videoDescription || '', videoURL: homepage?.videoURL || '', videoMediaID: mediaID(homepage?.videoMedia), videoMediaURL: imageURL(homepage?.videoMedia) || '', showCompanyIntro: homepage?.showCompanyIntro !== false, companyIntroTitle: homepage?.companyIntroTitle || '', companyIntro: homepage?.companyIntro || '', showStrength: homepage?.showStrength !== false, strengthItems: Array.isArray(homepage?.strengthItems) ? homepage.strengthItems.map((item: any) => ({ imageID: mediaID(item.image), imageURL: imageURL(item.image) || '', label: item.label || '', sortOrder: Number(item.sortOrder) || 0, unit: item.unit || '', value: item.value || '' })) : [], showInquiryForm: homepage?.showInquiryForm !== false, inquiryTitle: homepage?.inquiryTitle || '', inquiryDescription: homepage?.inquiryDescription || '', featuredNewsCategoryID: mediaID(homepage?.featuredNewsCategory), inquiryRequiredFields: homepage?.inquiryRequiredFields || {}, footerIntro: tenant.fixedPages?.footer?.intro || '', socialLinks: tenant.fixedPages?.footer?.socialLinks as Record<string, string> || {}, footerBackgroundMediaID: mediaID((tenant.fixedPages?.footer as any)?.backgroundImage), footerBackgroundURL: imageURL((tenant.fixedPages?.footer as any)?.backgroundImage) || '', footerBackgroundOverlay: Number((tenant.fixedPages?.footer as any)?.backgroundOverlay ?? 0.65), executiveHome: initialExecutiveHome }} recommendedCases={recommendedCases} recommendedProducts={recommendedProducts}/>
}
