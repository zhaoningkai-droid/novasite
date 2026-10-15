'use client'

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe2,
  Menu,
  MessageCircle,
} from 'lucide-react'
import Image from 'next/image'
import { useState, type FormEvent, type MouseEvent } from 'react'

import { ExecutiveQuoteDialog, openExecutiveQuote } from './ExecutiveQuoteDialog'
import { getExecutiveDemoCopy, type ExecutiveDemoLocale } from './executive-demo-data'

type PageKind = 'products' | 'news' | 'cases' | 'about' | 'faqs' | 'contact'
type Props = { locale: ExecutiveDemoLocale; path: string[]; page: number; category?: string }
type DemoItem = {
  name: string
  title: string
  category: string
  meta: string
  image: string
  summary: string
}
type DemoFAQ = { q: string; a: string }

const photo = (id: number, width = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`

function DemoQrArtwork() {
  const size = 21
  const finders = [
    [0, 0],
    [0, 14],
    [14, 0],
  ]
  const modules = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size)
    const column = index % size
    const finder = finders.find(
      ([top, left]) => row >= top && row < top + 7 && column >= left && column < left + 7,
    )
    if (finder) {
      const [top, left] = finder
      const edge = row === top || row === top + 6 || column === left || column === left + 6
      const center = row >= top + 2 && row <= top + 4 && column >= left + 2 && column <= left + 4
      return edge || center
    }
    if (row === 6 || column === 6) return (row + column) % 2 === 0
    return (row * 7 + column * 11 + row * column) % 5 < 2
  })

  return (
    <span className="ed-demo-qr" aria-hidden="true">
      {modules.map((dark, index) => (
        <span
          className={dark ? 'ed-demo-qr__module ed-demo-qr__module--dark' : 'ed-demo-qr__module'}
          key={index}
        />
      ))}
    </span>
  )
}

const productExtra = {
  zh: [
    [
      '灰瓦屋面铺设组合',
      '屋面瓦件',
      35473354,
      '展示坡屋面瓦件的视觉搭配，具体规格须按项目资料确认。',
    ],
    ['传统筒瓦与屋脊节点', '屋面瓦件', 13532047, '以屋面与脊线衔接为重点的古建构件演示。'],
    ['青瓦檐口滴水件', '檐下细部', 32045354, '整理檐口收边与排水方向，适合庭院及廊庑屋面。'],
    ['榫卯木作门扇', '门窗木作', 5620808, '以传统木作比例呈现门庭入口的组合方式。'],
    ['青砖花窗构件', '砖石构件', 37394142, '用于院墙、漏窗及内外空间过渡的砖石细节。'],
    ['石栏板望柱套件', '石作构件', 17177081, '展示栏板、望柱与台基之间的搭配关系。'],
    ['园林亭廊立柱', '亭廊配套', 37154427, '围绕亭、廊和回游空间整理木构件的比例。'],
    ['古建修缮替换瓦件', '修缮配套', 36496621, '用于既有建筑局部修缮的构件选型示意。'],
    ['琉璃吻兽与脊饰', '脊饰构件', 28956202, '以屋脊轮廓和装饰节点为重点的配套样例。'],
  ],
  en: [
    [
      'Grey roof tile layout set',
      'Roof tiles',
      35473354,
      'A visual roof-tile arrangement sample; confirm actual specifications from project documents.',
    ],
    [
      'Traditional pan tiles and ridge junction',
      'Roof tiles',
      13532047,
      'A heritage element sample focused on roof and ridge transitions.',
    ],
    [
      'Eave drip and edge tiles',
      'Eave details',
      32045354,
      'A sample arrangement for eave edges and roof drainage.',
    ],
    [
      'Traditional timber door set',
      'Doors & windows',
      5620808,
      'A timber entry arrangement shaped around traditional proportions.',
    ],
    [
      'Perforated brick screen',
      'Masonry',
      37394142,
      'A masonry detail for garden walls and transitions between spaces.',
    ],
    [
      'Stone balustrade set',
      'Stone elements',
      17177081,
      'A sample relationship between balusters, posts and the plinth.',
    ],
    [
      'Garden pavilion columns',
      'Pavilion systems',
      37154427,
      'Proportions for timber elements in pavilions and galleries.',
    ],
    [
      'Heritage roof repair tiles',
      'Restoration',
      36496621,
      'A selection reference for localized roof restoration work.',
    ],
    [
      'Glazed ridge ornaments',
      'Ridge details',
      28956202,
      'A sample focused on roofline and decorative junctions.',
    ],
  ],
} as const

const articleExtra = {
  zh: [
    [
      '传统院落铺地，如何与屋面色彩呼应',
      37731980,
      '从灰瓦、青砖到庭院铺地，材料关系影响整体空间观感。',
    ],
    ['木作门窗的比例与采光', 5620808, '门扇、花窗与室内外视线需要放在空间关系中一起考虑。'],
    ['屋脊装饰构件的常见组合', 28956202, '先明确屋脊线条与建筑尺度，再核对装饰构件的组合。'],
    [
      '古建修缮前，建议先记录哪些细节',
      36496621,
      '屋面节点、材料状态和尺寸记录有助于整理修缮范围。',
    ],
    ['亭廊空间中的柱网与檐口', 37154427, '柱距和檐口线条会共同影响廊下的行走体验。'],
    ['青砖雕刻适合用在哪些位置', 37394142, '照壁、门头与院墙可以通过砖雕细节建立空间层次。'],
    ['选购石栏板前的尺寸核对清单', 17177081, '明确栏板长度、望柱位置和安装条件，再安排构件配套。'],
  ],
  en: [
    [
      'Coordinating courtyard paving and roof colors',
      37731980,
      'The relationship between grey tiles, brick and paving shapes the overall space.',
    ],
    [
      'Proportion and daylight in timber windows',
      5620808,
      'Door leaves, screens and views work best when planned together.',
    ],
    [
      'Common combinations for ridge ornaments',
      28956202,
      'Start with the roofline and building scale before selecting decorative pieces.',
    ],
    [
      'Details to record before heritage roof repairs',
      36496621,
      'Photos, dimensions and material condition help define a clear repair scope.',
    ],
    [
      'Column spacing and eave lines in garden galleries',
      37154427,
      'Column rhythm and eave height shape how people move through a gallery.',
    ],
    [
      'Where carved brick details can be used',
      37394142,
      'Screens, gateways and courtyard walls can use relief to add depth.',
    ],
    [
      'A dimension checklist for stone balustrades',
      17177081,
      'Confirm panel lengths, post positions and installation conditions first.',
    ],
  ],
} as const

const caseExtra = {
  zh: [
    [
      '水岸书院 · 灰瓦与木廊',
      '园林营造',
      37731980,
      '以檐廊串联庭院视线，兼顾遮蔽、采光与步行尺度。',
    ],
    ['山地民宿 · 门庭更新', '文旅建筑', 33947972, '通过木门、青砖与屋面细节建立清晰的入口层次。'],
    ['古村街巷 · 局部修缮', '修缮配套', 36496621, '围绕屋脊、檐口和旧瓦替换整理修缮清单。'],
    ['社区庭院 · 传统花窗', '中式庭院', 34953167, '以花窗和院墙细节划分空间，同时保留通风与借景。'],
    ['茶室入口 · 石作栏板', '中式庭院', 17177081, '栏板、台阶与门庭节点构成连续的到达体验。'],
  ],
  en: [
    [
      'Waterside academy · grey tiles and timber walkways',
      'Garden project',
      37731980,
      'A covered gallery connects courtyard views with a comfortable walking scale.',
    ],
    [
      'Mountain guesthouse · renewed entrance',
      'Cultural destination',
      33947972,
      'Timber doors, brick and roof details make the entrance easier to read.',
    ],
    [
      'Historic lane · localized roof repairs',
      'Restoration',
      36496621,
      'A sample repair list organized around ridges, eaves and tile replacement.',
    ],
    [
      'Community courtyard · traditional screens',
      'Courtyard',
      34953167,
      'Screens and walls define space while keeping light and airflow.',
    ],
    [
      'Tea house entry · stone balustrades',
      'Courtyard',
      17177081,
      'Balustrades, steps and entry details form a continuous arrival.',
    ],
  ],
} as const

const faqExtra = {
  zh: [
    [
      '古建构件可以按图定制吗？',
      '可以先提交图纸、尺寸和使用位置。能否定制以及具体做法，需要由实际经营方结合材料和工艺确认。',
    ],
    [
      '没有完整图纸也可以咨询吗？',
      '可以先提供现场照片、建筑部位、初步尺寸和预期效果，逐步补充信息。',
    ],
    [
      '不同地区的建筑样式可以适配吗？',
      '建议提供当地建筑样式或参考项目，再逐项核对构件形制与尺寸。',
    ],
    [
      '产品颜色能否按项目调整？',
      '颜色和表面效果需要依据材料、工艺及样板确认，演示图片不能代替实物确认。',
    ],
    ['可以先寄送样品吗？', '样品种类、数量及寄送安排应在沟通项目需求后由实际经营方确认。'],
    ['如何估算项目所需数量？', '可准备建筑面积、屋面尺寸或构件清单；数量应结合节点和损耗复核。'],
    ['产品如何包装和运输？', '请提供产品类别、数量和目的地，实际包装与运输方式按订单确认。'],
    [
      '可以配合古建筑修缮项目吗？',
      '可先提交现状照片、修缮部位和尺寸记录，确认需要补配的构件范围。',
    ],
    ['如何确认木作构件的安装节点？', '准备平立面图和节点图后，逐项沟通连接方式、尺寸及现场条件。'],
    [
      '页面图片是否代表实际交付？',
      '不是。此模板使用演示素材展示页面布局，客户网站应替换为自己的真实产品资料。',
    ],
    ['报价前需要提供哪些信息？', '建议提供产品类别、尺寸、数量、材料要求、图纸及项目地点。'],
    [
      '可以先咨询某一个构件吗？',
      '可以在询盘中写明构件名称，产品详情页发起的咨询会自动带上当前产品名称。',
    ],
    [
      '演示页面内容会进入客户网站吗？',
      '不会。模板预览使用独立演示资料，客户站只显示自己后台已有并发布的内容。',
    ],
    [
      '产品资料下载在哪里？',
      '若产品已上传公开的PDF资料，详情页会显示下载入口；未上传时不显示虚假下载按钮。',
    ],
    ['如何联系网站经营方？', '请通过网站提供的联系信息或询盘表单联系实际经营方。'],
    [
      '可以先核对屋脊和檐口的衔接吗？',
      '可以提供屋面节点图和关键尺寸，便于一起查看构件之间的关系。',
    ],
    ['石作栏板需要哪些尺寸？', '通常需明确总长度、高度、望柱间距、安装位置及连接条件。'],
    ['如何选择屋面瓦件？', '可先确认屋面坡度、建筑形式、颜色方向与节点，再筛选对应瓦件。'],
    [
      '咨询后会自动生成报价吗？',
      '不会。网站提交的是项目询盘，具体价格需要实际经营方核对需求后回复。',
    ],
  ],
  en: [
    [
      'Can heritage elements be made to drawings?',
      'Share drawings, dimensions and intended use first. Feasibility depends on the materials and process.',
    ],
    [
      'Can I ask before drawings are complete?',
      'Yes. Start with site photos, building areas, approximate dimensions and the intended look.',
    ],
    [
      'Can the elements suit regional architectural styles?',
      'Share local references or a comparable project, then review forms and dimensions together.',
    ],
    [
      'Can product colors be adjusted for a project?',
      'Color and finish depend on material and process. Confirm them against a real sample.',
    ],
    [
      'Can product samples be sent first?',
      'Sample type, quantity and delivery can be confirmed after the project needs are understood.',
    ],
    [
      'How can I estimate the required quantity?',
      'Share roof dimensions or an element list; quantities should be checked against details and waste.',
    ],
    [
      'How are products packed and shipped?',
      'Provide product types, quantities and destination so the supplier can confirm the arrangement.',
    ],
    [
      'Can you support a heritage restoration project?',
      'Share current photos, repair areas and dimensions to identify replacement elements.',
    ],
    [
      'How are timber installation details checked?',
      'Provide plans and junction drawings to review connections, dimensions and site conditions.',
    ],
    [
      'Do the images show the exact items supplied?',
      'No. Images are template samples. Customers should replace them with their own product materials.',
    ],
    [
      'What information helps prepare a quotation?',
      'Share product type, dimensions, quantity, material requirements, drawings and destination.',
    ],
    [
      'Can I ask about one specific element?',
      'Yes. Name the item in your inquiry. Product detail pages include that product in the inquiry context.',
    ],
    [
      'Will preview content appear on a customer website?',
      'No. The preview uses separate demo data. Customer sites show their own backend content.',
    ],
    [
      'Where can I download product documents?',
      'A download appears only when a public PDF has been uploaded for that product.',
    ],
    [
      'How do I contact the site owner?',
      'Use the contact information or inquiry form provided on the actual customer website.',
    ],
    [
      'Can roof ridge and eave junctions be reviewed?',
      'Share the roof junction drawing and dimensions to review how the elements meet.',
    ],
    [
      'Which dimensions are needed for a stone balustrade?',
      'Confirm total length, height, post spacing, installation position and connections.',
    ],
    [
      'How should I choose roof tiles?',
      'Start with roof pitch, building style, color direction and junction details.',
    ],
    [
      'Will the website calculate a quotation automatically?',
      'No. The form sends an inquiry; the site owner reviews the requirements and responds.',
    ],
  ],
} as const

const slug = (type: PageKind, index: number) =>
  `${type === 'products' ? 'element' : type === 'news' ? 'story' : 'project'}-${String(index + 1).padStart(2, '0')}`

function Pager({
  base,
  category,
  page,
  pages,
  label,
}: {
  base: string
  category?: string
  page: number
  pages: number
  label: string
}) {
  if (pages <= 1) return null
  const href = (next: number) =>
    `${base}?${new URLSearchParams({ ...(category ? { category } : {}), page: String(next) })}`
  return (
    <nav aria-label={label} className="ed-page-pager">
      <a aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : undefined}>
        <ChevronLeft aria-hidden="true" size={17} />
        {label === '分页' ? '上一页' : 'Previous'}
      </a>
      <span>
        {page} / {pages}
      </span>
      <a aria-disabled={page >= pages} href={page < pages ? href(page + 1) : undefined}>
        {label === '分页' ? '下一页' : 'Next'}
        <ChevronRight aria-hidden="true" size={17} />
      </a>
    </nav>
  )
}

export function ExecutiveTemplatePages({ locale, path, page, category }: Props) {
  const copy = getExecutiveDemoCopy(locale)
  const en = locale === 'en'
  const base = `/template-demo/executive-industrial-pro-v1/${locale}`
  const kind = (path[0] || 'products') as PageKind
  const itemSlug = path[1]
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [openFAQs, setOpenFAQs] = useState<Set<number>>(() => new Set())
  const [activeImage, setActiveImage] = useState(0)
  const [contactSent, setContactSent] = useState(false)
  const kindLabel: Record<PageKind, string> = {
    products: copy.nav.products,
    news: copy.nav.news,
    cases: copy.nav.cases,
    about: copy.nav.about,
    faqs: copy.nav.faq,
    contact: copy.nav.contact,
  }
  const validKind = kind in kindLabel ? kind : 'products'
  const products: DemoItem[] = [
    ...copy.products.map((item) => ({
      name: item.name,
      title: item.name,
      category: item.category,
      meta: item.category,
      image: item.image,
      summary: item.summary,
    })),
    ...productExtra[locale].map(([name, categoryName, imageId, summary]) => ({
      name,
      title: name,
      category: categoryName,
      meta: categoryName,
      image: photo(imageId),
      summary,
    })),
  ]
  const newsGroup = copy.menuGroups.find((item) => item.key === 'news')
  const newsCategories: string[] = [...(newsGroup?.items || [])]
  const news: DemoItem[] = [
    ...copy.news.map((item, index) => ({
      name: item.title,
      title: item.title,
      category: newsCategories[index % Math.max(newsCategories.length, 1)] || item.date,
      meta: item.date,
      image: item.image,
      summary: item.summary,
    })),
    ...articleExtra[locale].map(([title, imageId, summary], index) => ({
      name: title,
      title,
      category:
        newsCategories[(index + copy.news.length) % Math.max(newsCategories.length, 1)] || '',
      meta: en ? `FIELD NOTE · 0${index + 1}` : `营造札记 · 0${index + 1}`,
      image: photo(imageId),
      summary,
    })),
  ]
  const caseCategoryNames =
    copy.menuGroups.find((menuGroup) => menuGroup.key === 'cases')?.items || []
  const cases: DemoItem[] = [
    ...copy.cases.map((item, index) => ({
      name: item.title,
      title: item.title,
      category: caseCategoryNames[index % Math.max(caseCategoryNames.length, 1)] || item.type,
      meta: caseCategoryNames[index % Math.max(caseCategoryNames.length, 1)] || item.type,
      image: item.image,
      summary: item.summary,
    })),
    ...caseExtra[locale].map(([title, type, imageId, summary], index) => ({
      name: title,
      title,
      category:
        caseCategoryNames[(index + copy.cases.length) % Math.max(caseCategoryNames.length, 1)] ||
        type,
      meta:
        caseCategoryNames[(index + copy.cases.length) % Math.max(caseCategoryNames.length, 1)] ||
        type,
      image: photo(imageId),
      summary,
    })),
  ]
  const faqs: DemoFAQ[] = [
    ...copy.faqs.map((item) => ({ q: item.q, a: item.a })),
    ...faqExtra[locale].map(([q, a]) => ({ q, a })),
  ]
  const items: DemoItem[] =
    validKind === 'products' ? products : validKind === 'news' ? news : cases
  const group = copy.menuGroups.find((item) => item.key === validKind)
  const groupItems: string[] = [...(group?.items || [])]
  const menuHref = (groupKey: string, item: string) => {
    const pathName = groupKey === 'products' ? 'products' : groupKey
    return `${base}/${pathName}?category=${encodeURIComponent(item)}`
  }
  const localeHref = (nextLocale: ExecutiveDemoLocale) =>
    `${base.replace(`/${locale}`, `/${nextLocale}`)}/${path.join('/')}${category ? `?category=${encodeURIComponent(category)}&page=${page}` : page > 1 ? `?page=${page}` : ''}`
  const openQuote = (event: MouseEvent<HTMLElement>, productName?: string) => {
    event.preventDefault()
    openExecutiveQuote(productName)
  }

  const header = (
    <header className="ed-header">
      <div className="ed-header__inner">
        <a aria-label={copy.brand} className="ed-brand" href={base}>
          <span aria-hidden="true" className="ed-brand__mark">
            匠
          </span>
          <span className="ed-brand__wordmark">
            <strong>{copy.brand}</strong>
            <small>{copy.brandEnglish}</small>
          </span>
        </a>
        <nav aria-label={en ? 'Main navigation' : '主导航'} className="ed-nav">
          <a href={base}>{copy.nav.home}</a>
          {copy.menuGroups.map((menuGroup) => {
            const open = openMenu === menuGroup.key
            return (
              <div
                className="ed-nav-group"
                data-open={open || undefined}
                key={menuGroup.key}
                onMouseEnter={() => setOpenMenu(menuGroup.key)}
                onMouseLeave={() => setOpenMenu(null)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null)
                }}
              >
                <button
                  aria-expanded={open}
                  onClick={() => setOpenMenu(open ? null : menuGroup.key)}
                  onFocus={() => setOpenMenu(menuGroup.key)}
                  type="button"
                >
                  {copy.nav[menuGroup.key as 'products' | 'news' | 'cases']}
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
                <div aria-hidden={!open} className="ed-mega-menu" inert={!open}>
                  <div className="ed-mega-menu__intro">
                    <span>{en ? 'EXPLORE' : '快速导航'}</span>
                    <h2>{menuGroup.title}</h2>
                    <p>
                      {en
                        ? 'Browse sample content for this template.'
                        : '浏览模板演示内容，查看栏目和分类效果。'}
                    </p>
                    <a href={`${base}/${menuGroup.key}`}>
                      {en
                        ? `View all ${copy.nav[menuGroup.key as 'products' | 'news' | 'cases']}`
                        : `查看全部${copy.nav[menuGroup.key as 'products' | 'news' | 'cases']}`}
                      <ArrowRight aria-hidden="true" size={15} />
                    </a>
                  </div>
                  <div className="ed-mega-menu__items">
                    {menuGroup.items.map((item) => (
                      <a href={menuHref(menuGroup.key, item)} key={item}>
                        <ArrowUpRight aria-hidden="true" size={15} />
                        {item}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
          <a aria-current={validKind === 'about' ? 'page' : undefined} href={`${base}/about`}>
            {copy.nav.about}
          </a>
          <a aria-current={validKind === 'faqs' ? 'page' : undefined} href={`${base}/faqs`}>
            {copy.nav.faq}
          </a>
          <a aria-current={validKind === 'contact' ? 'page' : undefined} href={`${base}/contact`}>
            {copy.nav.contact}
          </a>
        </nav>
        <div className="ed-language">
          <button
            aria-expanded={languageOpen}
            onClick={() => setLanguageOpen(!languageOpen)}
            type="button"
          >
            <Globe2 aria-hidden="true" size={17} />
            <span>{copy.languageName}</span>
            <ChevronDown aria-hidden="true" size={14} />
          </button>
          {languageOpen ? (
            <div className="ed-language__menu" role="menu">
              {(['zh', 'en'] as const).map((option) => (
                <a
                  aria-current={option === locale ? 'page' : undefined}
                  href={localeHref(option)}
                  key={option}
                  role="menuitem"
                >
                  {getExecutiveDemoCopy(option).languageName}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <details className="ed-mobile-menu">
          <summary aria-label={en ? 'Open menu' : '打开菜单'}>
            <Menu aria-hidden="true" size={22} />
          </summary>
          <div className="ed-mobile-menu__panel">
            <a href={base}>{copy.nav.home}</a>
            {copy.menuGroups.map((menuGroup) => (
              <details key={menuGroup.key}>
                <summary>
                  {copy.nav[menuGroup.key as 'products' | 'news' | 'cases']}
                  <ChevronDown aria-hidden="true" size={15} />
                </summary>
                <div className="ed-mobile-menu__submenu">
                  <a href={`${base}/${menuGroup.key}`}>{en ? 'View all' : '查看全部'}</a>
                  {menuGroup.items.map((item) => (
                    <a href={menuHref(menuGroup.key, item)} key={item}>
                      {item}
                    </a>
                  ))}
                </div>
              </details>
            ))}
            <a href={`${base}/about`}>{copy.nav.about}</a>
            <a href={`${base}/faqs`}>{copy.nav.faq}</a>
            <a href={`${base}/contact`}>{copy.nav.contact}</a>
            <div className="ed-mobile-menu__languages">
              {(['zh', 'en'] as const).map((option) => (
                <a href={localeHref(option)} key={option}>
                  {getExecutiveDemoCopy(option).languageName}
                </a>
              ))}
            </div>
          </div>
        </details>
      </div>
    </header>
  )

  const footer = (
    <footer className="ed-footer">
      <div className="ed-footer__background" />
      <div className="ed-footer__shade" />
      <div className="ed-container ed-footer__content">
        <div className="ed-footer__brand">
          <a aria-label={copy.brand} className="ed-brand" href={base}>
            <span aria-hidden="true" className="ed-brand__mark">
              匠
            </span>
            <span className="ed-brand__wordmark">
              <strong>{copy.brand}</strong>
              <small>{copy.brandEnglish}</small>
            </span>
          </a>
          <span className="ed-footer__badge">{copy.footerLabel}</span>
          <p>{copy.footerText}</p>
          <a className="ed-footer__email" href={`${base}/contact`}>
            {copy.nav.contact}
            <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        </div>
        <div className="ed-footer__links">
          <strong>{copy.footerNav}</strong>
          {(['products', 'news', 'cases', 'about', 'faqs', 'contact'] as PageKind[]).map((name) => (
            <a href={`${base}/${name}`} key={name}>
              {kindLabel[name]}
            </a>
          ))}
        </div>
        <div className="ed-footer__contact">
          <strong>{copy.footerContact}</strong>
          <p>{copy.footerContactNote}</p>
          <a href={`${base}/contact`}>
            {en ? 'View contact page' : '查看联系页面'}
            <ArrowUpRight aria-hidden="true" size={15} />
          </a>
        </div>
        <div className="ed-footer__qr">
          <span className="ed-footer__qr-art">
            <DemoQrArtwork />
          </span>
          <strong>{copy.footerQr}</strong>
          <small>{copy.footerQrNote}</small>
        </div>
      </div>
      <div className="ed-container ed-footer__bottom">
        <span>© {copy.brandEnglish}</span>
        <span>{copy.copyright}</span>
        <a href="https://www.pexels.com/license/" rel="noreferrer" target="_blank">
          {copy.imageCredit}
        </a>
      </div>
    </footer>
  )

  const crumb = (
    <div className="ed-inner-crumb">
      <a href={base}>{copy.nav.home}</a>
      <span>/</span>
      <span>{kindLabel[validKind]}</span>
      {itemSlug ? (
        <>
          <span>/</span>
          <span>{itemSlug}</span>
        </>
      ) : null}
    </div>
  )
  const pageIntro = (title: string, description: string) => (
    <section className="ed-inner-intro">
      <div>
        <span className="ed-eyebrow ed-eyebrow--green">{kindLabel[validKind].toUpperCase()}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {validKind !== 'faqs' ? (
        <button
          className="ed-button ed-button--blue"
          onClick={(event) => openQuote(event)}
          type="button"
        >
          {en ? 'Get a quotation' : '获取报价'}
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      ) : null}
    </section>
  )

  let content
  if (validKind === 'products' && itemSlug) {
    const index = products.findIndex((_, i) => slug('products', i) === itemSlug)
    if (index < 0)
      content = (
        <div className="ed-inner-empty">
          <h1>{en ? 'Product not found' : '未找到该产品'}</h1>
          <a href={`${base}/products`}>{en ? 'Back to products' : '返回产品列表'}</a>
        </div>
      )
    else {
      const item = products[index]
      const gallery = [
        item.image,
        photo(index % 2 ? 32045354 : 17266493),
        photo(index % 3 ? 5620808 : 34953167),
      ]
      const related = products
        .filter((product, i) => i !== index && product.category === item.category)
        .slice(0, 8)
      content = (
        <>
          <main id="main-content" className="ed-product-detail">
            <div className="ed-product-detail__top">
              <div className="ed-product-detail__gallery">
                <button
                  aria-label={en ? 'Show previous image' : '查看上一张'}
                  className="ed-product-detail__arrow ed-product-detail__arrow--left"
                  onClick={() =>
                    setActiveImage((activeImage + gallery.length - 1) % gallery.length)
                  }
                  type="button"
                >
                  <ChevronLeft />
                </button>
                <div className="ed-product-detail__main-image">
                  <Image
                    alt={item.name}
                    fill
                    priority
                    sizes="(max-width: 760px) 100vw, 48vw"
                    src={gallery[activeImage]}
                    unoptimized
                  />
                </div>
                <button
                  aria-label={en ? 'Show next image' : '查看下一张'}
                  className="ed-product-detail__arrow ed-product-detail__arrow--right"
                  onClick={() => setActiveImage((activeImage + 1) % gallery.length)}
                  type="button"
                >
                  <ChevronRight />
                </button>
                <div className="ed-product-detail__thumbs">
                  {gallery.map((src, photoIndex) => (
                    <button
                      aria-label={`${en ? 'Image' : '图片'} ${photoIndex + 1}`}
                      aria-pressed={photoIndex === activeImage}
                      key={src}
                      onClick={() => setActiveImage(photoIndex)}
                      type="button"
                    >
                      <Image alt="" fill sizes="96px" src={src} unoptimized />
                    </button>
                  ))}
                </div>
              </div>
              <div className="ed-product-detail__summary">
                <span className="ed-eyebrow ed-eyebrow--green">{item.category}</span>
                <h1>{item.name}</h1>
                <p>{item.summary}</p>
                <div className="ed-product-detail__tags">
                  <span>{en ? 'Project selection support' : '项目选型沟通'}</span>
                  <span>{en ? 'Drawing review' : '图纸节点核对'}</span>
                  <span>{en ? 'Material coordination' : '材料搭配建议'}</span>
                </div>
                <small>
                  {en
                    ? 'Sample content for template preview'
                    : '模板演示产品资料 · 客户站将显示客户自己的内容'}
                </small>
                <div className="ed-product-detail__actions">
                  <button
                    className="ed-button ed-button--blue"
                    onClick={(event) => openQuote(event, item.name)}
                    type="button"
                  >
                    {en ? 'Get a fast quotation' : '获取报价'}
                    <ArrowRight size={16} />
                  </button>
                  {index === 0 ? (
                    <a
                      className="ed-button ed-button--document"
                      download={en ? 'novasite-heritage-roof-demo.pdf' : 'NovaSite-古建屋面演示样例.pdf'}
                      href="/template-demos/executive-industrial-pro-v1/novasite-heritage-roof-demo.pdf"
                    >
                      <Download aria-hidden="true" size={16} />
                      {en ? 'Download sample sheet' : '下载演示产品资料'}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="ed-product-detail__body">
              <article>
                <nav
                  aria-label={en ? 'Product details' : '产品详情'}
                  className="ed-product-detail__tabs"
                >
                  <a href="#product-copy">{en ? 'Product details' : '产品详情'}</a>
                  {related.length ? (
                    <a href="#related-products">{en ? 'You may also like' : '猜你喜欢'}</a>
                  ) : null}
                </nav>
                <div className="ed-product-detail__rich" id="product-copy">
                  <h2>{en ? 'Product overview' : '产品概述'}</h2>
                  <p>
                    {item.summary}{' '}
                    {en
                      ? 'This sample illustrates how a customer product description, project context and material notes can be presented in a clear detail page.'
                      : '本演示用于展示客户产品介绍、项目场景和材料说明如何在详情页中清晰呈现。'}
                  </p>
                  <h3>{en ? 'Design notes' : '构件说明'}</h3>
                  <p>
                    {en
                      ? 'Review overall proportions, connection points and intended architectural use before confirming a selection.'
                      : '确认构件选型前，可结合建筑部位、整体比例、衔接节点与实际使用环境逐项核对。'}
                  </p>
                  <h3>{en ? 'Application and coordination' : '应用与配套'}</h3>
                  <p>
                    {en
                      ? 'Share drawings, dimensions and reference images with the site owner. Final materials, size and supply details are confirmed for each project.'
                      : '可将图纸、尺寸和参考图片交给网站经营方进一步沟通。材料、尺寸和供货信息以实际项目确认为准。'}
                  </p>
                </div>
              </article>
              <aside className="ed-product-detail__aside">
                <section>
                  <span>{en ? 'PRODUCT GROUPS' : '产品分类'}</span>
                  <h2>{item.category}</h2>
                  <a href={`${base}/products?category=${encodeURIComponent(item.category)}`}>
                    {en ? 'Browse this category' : '浏览此分类'}
                    <ArrowRight size={15} />
                  </a>
                </section>
                <section>
                  <span>{en ? 'QUICK INQUIRY' : '快速询盘'}</span>
                  <p>
                    {en
                      ? 'Send drawings and project details to discuss suitable elements.'
                      : '提供图纸和项目需求，沟通适合的构件方向。'}
                  </p>
                  <button
                    className="ed-button ed-button--blue"
                    onClick={(event) => openQuote(event, item.name)}
                    type="button"
                  >
                    {en ? 'Ask about this product' : '咨询该产品'}
                  </button>
                </section>
              </aside>
            </div>
            {related.length ? (
              <section className="ed-related" id="related-products">
                <div className="ed-section-heading ed-section-heading--center">
                  <span className="ed-eyebrow ed-eyebrow--green">RECOMMENDED ELEMENTS</span>
                  <h2>{en ? 'You may also like' : '猜你喜欢'}</h2>
                </div>
                <div className="ed-related__rail">
                  {related.map((product) => (
                    <a
                      className="ed-related-card"
                      href={`${base}/products/${slug('products', products.indexOf(product))}`}
                      key={product.name}
                    >
                      <div>
                        <Image
                          alt={product.name}
                          fill
                          sizes="(max-width: 700px) 70vw, 250px"
                          src={product.image}
                          unoptimized
                        />
                      </div>
                      <strong>{product.name}</strong>
                      <span>
                        {product.category}
                        <ArrowUpRight size={14} />
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </main>
          <aside className="ed-product-inquiry">
            <div>
              <span className="ed-eyebrow">{en ? 'START A CONVERSATION' : '开始项目沟通'}</span>
              <h2>{en ? 'Tell us what your project needs' : '告诉我们你的项目需求'}</h2>
              <p>
                {en
                  ? 'This is a demo form. Nothing will be sent or stored.'
                  : '演示表单，不会发送或保存任何信息。'}
              </p>
            </div>
            <button
              className="ed-button ed-button--light"
              onClick={(event) => openQuote(event, item.name)}
              type="button"
            >
              {en ? 'Discuss this product' : '咨询该构件'}
              <ArrowRight size={16} />
            </button>
          </aside>
        </>
      )
    }
  } else if ((validKind === 'news' || validKind === 'cases') && itemSlug) {
    const source = validKind === 'news' ? news : cases
    const index = source.findIndex((_, i) => slug(validKind, i) === itemSlug)
    if (index < 0)
      content = (
        <div className="ed-inner-empty">
          <h1>{en ? 'Story not found' : '未找到该内容'}</h1>
          <a href={`${base}/${validKind}`}>{en ? 'Back to list' : '返回列表'}</a>
        </div>
      )
    else {
      const item = source[index]
      const title = item.title
      const image = item.image
      const summary = item.summary
      const date = item.meta
      content = (
        <main id="main-content" className="ed-story-detail">
          <div className="ed-story-detail__head">
            <span className="ed-eyebrow ed-eyebrow--green">{date}</span>
            <h1>{title}</h1>
            <p>{summary}</p>
          </div>
          <div className="ed-story-detail__cover">
            <Image alt={title} fill priority sizes="100vw" src={image} unoptimized />
          </div>
          <article className="ed-story-detail__body">
            <p>
              {summary}{' '}
              {en
                ? 'This template sample shows how long-form content can sit alongside the same clear navigation, readable type and calm spacing.'
                : '这段模板演示内容展示长文、图片和留白如何配合阅读。正式客户网站应在后台录入自己的文章内容。'}
            </p>
            <h2>{en ? 'Planning around the site' : '从现场条件开始梳理'}</h2>
            <p>
              {en
                ? 'Consider the building area, dimensions, material and connection details together. A small set of clear references can make project discussions more focused.'
                : '建议把建筑部位、尺寸、材料和节点关系放在一起考虑。准备清楚的参考资料，有助于让项目沟通更聚焦。'}
            </p>
            <h2>{en ? 'Reviewing the details' : '逐项核对细节'}</h2>
            <p>
              {en
                ? 'Photos, drawings and sample details help compare possible approaches. Final specifications and delivery arrangements should be confirmed with the project supplier.'
                : '可以通过现场照片、图纸和节点样张比较不同做法。最终规格与交付安排需要由项目供应方确认。'}
            </p>
            <div className="ed-story-detail__notice">
              {en
                ? 'Template preview sample · Not a real project or company record'
                : '模板演示内容 · 并非真实公司新闻或工程案例'}
            </div>
            <a className="ed-text-link" href={`${base}/${validKind}`}>
              {en ? 'Back to all' : `返回${kindLabel[validKind]}`}
              <ArrowLeft size={16} />
            </a>
          </article>
          <aside className="ed-story-detail__cta">
            <strong>{en ? 'Planning a similar project?' : '正在规划类似项目？'}</strong>
            <button
              className="ed-button ed-button--blue"
              onClick={(event) => openQuote(event)}
              type="button"
            >
              {en ? 'Send an inquiry' : '提交项目询盘'}
              <ArrowRight size={16} />
            </button>
          </aside>
        </main>
      )
    }
  } else if (validKind === 'products' || validKind === 'news' || validKind === 'cases') {
    const pageSize = validKind === 'products' ? 12 : validKind === 'news' ? 9 : 6
    const categoryIndex = groupItems.indexOf(category || '')
    const effectiveCategory =
      validKind === 'products' && categoryIndex >= 0 ? products[categoryIndex]?.category : category
    const filtered = effectiveCategory
      ? items.filter((item) => item.category === effectiveCategory)
      : items
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
    const activePage = Math.min(Math.max(1, page), pageCount)
    const visible = filtered.slice((activePage - 1) * pageSize, activePage * pageSize)
    const title =
      validKind === 'products'
        ? en
          ? 'Architectural elements'
          : '古建构件'
        : validKind === 'news'
          ? en
            ? 'News & craft notes'
            : '新闻与营造札记'
          : en
            ? 'Project cases'
            : '古建项目案例'
    const description =
      validKind === 'products'
        ? copy.categoriesText
        : validKind === 'news'
          ? en
            ? 'Notes on materials, traditional craft and architectural details.'
            : '分享古建材料、传统工艺与建筑细节的演示内容。'
          : copy.casesText
    const categories = group?.items || []
    content = (
      <main id="main-content" className={`ed-list-page ed-list-page--${validKind}`}>
        {crumb}
        <div className="ed-container">
          {pageIntro(title, description)}
          {validKind === 'products' ? (
            <div className="ed-product-list-layout">
              <aside className="ed-product-list-sidebar">
                <span className="ed-product-list-sidebar__title">
                  {en ? 'PRODUCTS' : '产品分类'}
                </span>
                <a aria-current={!category ? 'page' : undefined} href={`${base}/products`}>
                  {en ? 'All products' : '全部产品'}
                </a>
                {categories.map((item) => (
                  <a
                    aria-current={category === item ? 'page' : undefined}
                    href={menuHref('products', item)}
                    key={item}
                  >
                    {item}
                  </a>
                ))}
                <div className="ed-service-card">
                  <span>{en ? 'SERVICE CONTACT' : '服务联系'}</span>
                  <strong>
                    {en ? 'Contact details appear here' : '客户网站展示自己的联系信息'}
                  </strong>
                  <small>{en ? 'Added by the site owner' : '演示页面不使用客户联系资料'}</small>
                </div>
              </aside>
              <section className="ed-list-main">
                <div className="ed-list-toolbar">
                  <h2>{category || (en ? 'Product collection' : '构件精选')}</h2>
                  <span>
                    {filtered.length} {en ? 'sample items' : '个演示产品'}
                  </span>
                </div>
                <div className="ed-inner-card-grid ed-inner-card-grid--products">
                  {visible.map((item) => {
                    const index = products.indexOf(item)
                    return (
                      <article className="ed-inner-product-card" key={item.name}>
                        <a
                          className="ed-inner-product-card__image"
                          href={`${base}/products/${slug('products', index)}`}
                        >
                          <Image
                            alt={item.name}
                            fill
                            sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw"
                            src={item.image}
                            unoptimized
                          />
                          <span>{String(index + 1).padStart(2, '0')}</span>
                        </a>
                        <div>
                          <small>{item.category}</small>
                          <a href={`${base}/products/${slug('products', index)}`}>
                            <h3>{item.name}</h3>
                          </a>
                          <p>{item.summary}</p>
                          <a
                            className="ed-text-link"
                            href={`${base}/products/${slug('products', index)}`}
                          >
                            {en ? 'View details' : '查看详情'}
                            <ArrowRight size={15} />
                          </a>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <Pager
                  base={`${base}/products`}
                  category={category}
                  label={en ? 'Pagination' : '分页'}
                  page={activePage}
                  pages={pageCount}
                />
              </section>
            </div>
          ) : (
            <>
              <div className="ed-category-filter">
                <a aria-current={!category ? 'page' : undefined} href={`${base}/${validKind}`}>
                  {en ? 'All' : '全部'}
                </a>
                {categories.map((item) => (
                  <a
                    aria-current={category === item ? 'page' : undefined}
                    href={menuHref(validKind, item)}
                    key={item}
                  >
                    {item}
                  </a>
                ))}
              </div>
              <div className={`ed-inner-card-grid ed-inner-card-grid--${validKind}`}>
                {visible.map((item) => {
                  const index = items.indexOf(item)
                  const itemTitle = item.title
                  const meta = item.meta
                  return (
                    <article className="ed-inner-story-card" key={itemTitle}>
                      <a
                        className="ed-inner-story-card__image"
                        href={`${base}/${validKind}/${slug(validKind, index)}`}
                      >
                        <Image
                          alt={itemTitle}
                          fill
                          sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw"
                          src={item.image}
                          unoptimized
                        />
                      </a>
                      <div>
                        <small>{meta}</small>
                        <a href={`${base}/${validKind}/${slug(validKind, index)}`}>
                          <h2>{itemTitle}</h2>
                        </a>
                        <p>{item.summary}</p>
                        <a
                          className="ed-text-link"
                          href={`${base}/${validKind}/${slug(validKind, index)}`}
                        >
                          {en ? 'Learn more' : '了解更多'}
                          <ArrowRight size={15} />
                        </a>
                      </div>
                    </article>
                  )
                })}
              </div>
              <Pager
                base={`${base}/${validKind}`}
                category={category}
                label={en ? 'Pagination' : '分页'}
                page={activePage}
                pages={pageCount}
              />
            </>
          )}
        </div>
      </main>
    )
  } else if (validKind === 'faqs') {
    const pageSize = 10
    const pages = Math.ceil(faqs.length / pageSize)
    const activePage = Math.min(Math.max(1, page), pages)
    const start = (activePage - 1) * pageSize
    content = (
      <main id="main-content" className="ed-faq-page">
        {crumb}
        <div className="ed-faq-page__intro">
          <span className="ed-eyebrow ed-eyebrow--green">{copy.faqKicker}</span>
          <h1>{copy.faqTitle}</h1>
          <p>
            {en
              ? 'Answers to common questions about traditional building elements and project coordination.'
              : '了解古建构件与项目配套中的常见问题。答案默认收起，点击问题即可查看。'}
          </p>
        </div>
        <div className="ed-faq-page__list">
          {faqs.slice(start, start + pageSize).map((faq, offset) => {
            const index = start + offset
            const isOpen = openFAQs.has(index)
            return (
              <article className="ed-faq-page__item" key={faq.q}>
                <h2>
                  <button
                    aria-controls={`ed-faq-answer-${index}`}
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpenFAQs((previous) => {
                        const next = new Set(previous)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }
                    type="button"
                  >
                    <span>
                      <small>{String(index + 1).padStart(2, '0')}</small>
                      {faq.q}
                    </span>
                    <ChevronDown aria-hidden="true" size={18} />
                  </button>
                </h2>
                {isOpen ? (
                  <div className="ed-faq-page__answer" id={`ed-faq-answer-${index}`}>
                    {faq.a}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
        <Pager
          base={`${base}/faqs`}
          page={activePage}
          pages={pages}
          label={en ? 'Pagination' : '分页'}
        />
      </main>
    )
  } else if (validKind === 'about') {
    content = (
      <main id="main-content" className="ed-about-page">
        {crumb}
        <section
          className="ed-about-page__hero"
          style={{
            backgroundImage: `linear-gradient(90deg,rgba(18,30,25,.84),rgba(18,30,25,.47)),url(${copy.slides[0].image})`,
          }}
        >
          <div>
            <span className="ed-eyebrow">NOVASITE HERITAGE DEMO</span>
            <h1>{copy.nav.about}</h1>
            <p>{copy.aboutText}</p>
            <button
              className="ed-button ed-button--blue"
              onClick={(event) => openQuote(event)}
              type="button"
            >
              {en ? 'Contact us' : '联系项目顾问'}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <div className="ed-about-page__modules">
          <section className="ed-about-module">
            <div className="ed-about-module__image">
              <Image
                alt={copy.workshopPhotos[0].title}
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
                src={copy.workshopPhotos[0].image}
                unoptimized
              />
            </div>
            <div>
              <span className="ed-eyebrow ed-eyebrow--green">
                {en ? 'OUR APPROACH' : '营造理念'}
              </span>
              <h2>{en ? 'A clear view of every building element' : '从构件细节理解建筑整体'}</h2>
              <p>{copy.aboutText}</p>
            </div>
          </section>
          <section className="ed-about-module ed-about-module--reverse">
            <div className="ed-about-module__image">
              <Image
                alt={copy.workshopPhotos[1].title}
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
                src={copy.workshopPhotos[1].image}
                unoptimized
              />
            </div>
            <div>
              <span className="ed-eyebrow ed-eyebrow--green">
                {en ? 'CRAFT & MATERIALS' : '材料与工艺'}
              </span>
              <h2>{en ? 'Coordinate materials with the space' : '让材料与空间关系更协调'}</h2>
              <p>
                {en
                  ? 'Review roof forms, timber details and masonry as one architectural composition. Every sample here is for template demonstration.'
                  : '将屋面形制、木作细节和砖石构件放在同一建筑语境中查看。此处内容仅用于模板演示。'}
              </p>
            </div>
          </section>
          <section className="ed-about-module">
            <div className="ed-about-module__image">
              <Image
                alt={copy.workshopPhotos[2].title}
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
                src={copy.workshopPhotos[2].image}
                unoptimized
              />
            </div>
            <div>
              <span className="ed-eyebrow ed-eyebrow--green">
                {en ? 'PROJECT COORDINATION' : '项目配套'}
              </span>
              <h2>{en ? 'Start with drawings and dimensions' : '从图纸与尺寸开始沟通'}</h2>
              <p>
                {en
                  ? 'Share project references and key requirements to prepare a focused selection discussion.'
                  : '提供项目参考资料与关键要求，让构件选型和项目沟通更加清楚。'}
              </p>
              <button
                className="ed-button ed-button--blue"
                onClick={(event) => openQuote(event)}
                type="button"
              >
                {en ? 'Discuss a project' : '沟通项目需求'}
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  } else {
    const submitContact = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!event.currentTarget.reportValidity()) return
      setContactSent(true)
      event.currentTarget.reset()
    }
    content = (
      <main id="main-content" className="ed-contact-page">
        {crumb}
        <section
          className="ed-contact-page__backdrop"
          style={{
            backgroundImage: `linear-gradient(rgba(16,25,21,.58),rgba(16,25,21,.58)),url(${copy.slides[1].image})`,
          }}
        >
          <div className="ed-contact-card">
            <section className="ed-contact-info">
              <span className="ed-eyebrow ed-eyebrow--green">
                {en ? 'CONTACT THE DEMO TEAM' : '联系演示团队'}
              </span>
              <h1>{copy.nav.contact}</h1>
              <p>
                {en
                  ? 'The customer site displays its own contact details here.'
                  : '客户网站会显示自己填写的联系方式；此处为模板预览示例。'}
              </p>
              <dl>
                <div>
                  <dt>{en ? 'Telephone' : '电话'}</dt>
                  <dd>+86 000-0000-0000</dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>
                    <span className="ed-contact-whatsapp">
                      <MessageCircle aria-hidden="true" size={16} />
                      +86 000-0000-0000
                      <small>{en ? 'Sample number' : '演示号码'}</small>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{en ? 'Email' : '邮箱'}</dt>
                  <dd>demo@example.invalid</dd>
                </div>
                <div>
                  <dt>{en ? 'Address' : '地址'}</dt>
                  <dd>
                    {en
                      ? 'NovaSite heritage demonstration · Fictional address'
                      : '中国 · NovaSite 古建模板演示区（虚构地址）'}
                  </dd>
                </div>
              </dl>
              <h2>{en ? 'Follow us' : '关注我们'}</h2>
              <div className="ed-contact-qr">
                <DemoQrArtwork />
                <small>{en ? 'Demo artwork · not scannable' : '二维码演示位 · 不可扫码'}</small>
              </div>
            </section>
            <section className="ed-contact-form-wrap">
              <h2>{en ? 'Send a message' : '留言咨询'}</h2>
              {contactSent ? (
                <p aria-live="polite" className="ed-contact-success" role="status">
                  {en
                    ? 'Demo complete. Nothing was sent or saved.'
                    : '演示完成：信息没有发送或保存。'}
                </p>
              ) : null}
              <form className="ed-contact-form" onSubmit={submitContact}>
                <label>
                  <span>{en ? 'Name' : '姓名'} *</span>
                  <input autoComplete="name" maxLength={120} name="name" required />
                </label>
                <label>
                  <span>{en ? 'WhatsApp / Phone' : '电话'} *</span>
                  <input autoComplete="tel" maxLength={80} name="phone" required />
                </label>
                <label>
                  <span>{en ? 'Address' : '地址'} *</span>
                  <input autoComplete="street-address" maxLength={300} name="address" required />
                </label>
                <label>
                  <span>{en ? 'Email' : '邮箱'} *</span>
                  <input autoComplete="email" maxLength={200} name="email" required type="email" />
                </label>
                <label className="ed-contact-form__message">
                  <span>{en ? 'Message' : '留言'} *</span>
                  <textarea maxLength={4000} minLength={10} name="message" required rows={4} />
                </label>
                <button className="ed-button ed-button--blue" type="submit">
                  {en ? 'Submit' : '提交留言'}
                  <ArrowRight size={16} />
                </button>
              </form>
            </section>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="executive-demo ed-inner-page" data-demo-locale={locale}>
      <a className="ed-skip-link" href="#main-content">
        {en ? 'Skip to content' : '跳到主要内容'}
      </a>
      {header}
      {content}
      {footer}
      <ExecutiveQuoteDialog locale={locale} />
    </div>
  )
}
