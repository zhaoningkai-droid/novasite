export class SettingsInputError extends Error {}

export const settingsText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export const settingsObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsInputError('请求格式无效，请刷新页面后重试。')
  }
  return value as Record<string, unknown>
}

export const settingsID = (value: unknown, label = '记录'): number | null => {
  if (value === undefined || value === null || value === '') return null
  const validType = typeof value === 'number'
    || typeof value === 'string' && /^\d+$/.test(value)
  const id = Number(value)
  if (!validType || !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new SettingsInputError(label + '编号无效。')
  }
  return id
}

export const settingsOrder = (value: unknown, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback
  const order = Number(value)
  if (!['number', 'string'].includes(typeof value) || !Number.isFinite(order)) {
    throw new SettingsInputError('排序必须填写有效数字。')
  }
  return order
}

export const parseAboutModules = (value: unknown, existingIDs: Set<string>) => {
  if (!Array.isArray(value)) throw new SettingsInputError('企业介绍模块格式无效。')
  const usedIDs = new Set<string>()
  return value.map((raw) => {
    const item = settingsObject(raw)
    const title = settingsText(item.title)
    const description = settingsText(item.description)
    if (!title || !description) {
      throw new SettingsInputError('每个企业介绍模块都要填写名称和描述。')
    }
    let id: string | undefined
    if (item.id !== undefined && item.id !== null && item.id !== '') {
      if (typeof item.id !== 'string' || !existingIDs.has(item.id) || usedIDs.has(item.id)) {
        throw new SettingsInputError('企业介绍模块编号无效，请刷新后重新编辑。')
      }
      id = item.id
      usedIDs.add(id)
    }
    return { id, title, description, image: settingsID(item.image, '模块图片'), sortOrder: settingsOrder(item.sortOrder) }
  })
}

export const settingsBoolean = (value: unknown, fallback: boolean | undefined | null) => {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new SettingsInputError('显示状态格式无效。')
  return value
}

export const safeNavigationHref = (value: unknown): string => {
  const href = settingsText(value)
  if (!href || /[\u0000-\u001f\u007f\\]/.test(href)) return ''
  if (href.startsWith('/') && !href.startsWith('//')) return href
  if (!/^https?:\/\//i.test(href)) return ''
  try {
    const url = new URL(href)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? href : ''
  } catch { return '' }
}

export type NavigationInput = {
  label: string
  href: string
  children?: Array<{ label: string; href: string }>
}

export const parseNavigationRows = (value: unknown, label: string, children = false): NavigationInput[] => {
  if (!Array.isArray(value)) throw new SettingsInputError(label + '格式无效。')
  return value.map((input, index) => {
    const item = settingsObject(input)
    const name = settingsText(item.label)
    const href = safeNavigationHref(item.href)
    if (!name || !href) {
      throw new SettingsInputError(label + '第 ' + (index + 1) + ' 项请填写名称及有效链接。')
    }
    if (!children && item.children !== undefined) {
      throw new SettingsInputError('导航最多支持两级，页脚链接不支持子项。')
    }
    return {
      label: name,
      href,
      ...(children ? {
        children: item.children === undefined ? []
          : parseNavigationRows(item.children, label + '第 ' + (index + 1) + ' 项的二级菜单'),
      } : {}),
    }
  })
}

// Match the plain-text projection used by the FAQ textarea without changing its rich source.
export const settingsLexicalText = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(settingsLexicalText).join(' ')
  const node = value as Record<string, unknown>
  return `${typeof node.text === 'string' ? node.text : ''} ${settingsLexicalText(node.root)} ${settingsLexicalText(node.children)}`.trim()
}

export const settingsLexical = (value: string): import('@/payload-types').Faq['answer'] => ({
  root: {
    type: 'root',
    children: value.split('\n').map((line) => ({
      type: 'paragraph',
      children: line ? [{ type: 'text', text: line, detail: 0, format: 0, mode: 'normal', style: '', version: 1 }] : [],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    })),
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

export const homepageIntroFields = (body: Record<string, unknown>, existing: Record<string, unknown>) => ({
  showCompanyIntro: settingsBoolean(body.showCompanyIntro ?? body.introEnabled, existing.showCompanyIntro as boolean | null | undefined),
  ...(body.companyIntroTitle === undefined ? {} : { companyIntroTitle: settingsText(body.companyIntroTitle) }),
  ...(body.companyIntro === undefined ? {} : { companyIntro: settingsText(body.companyIntro) }),
  ...(body.introImageID === undefined ? {} : { introImage: settingsID(body.introImageID, '企业介绍图片') }),
})
