import { randomUUID } from 'node:crypto'
import type { News } from '@/payload-types'
import { GeoError } from './keywords'
import {
  cleanGeoArticleHTML,
  escapeGeoHTML,
  geoPublicationLinks,
  type GeoArticle,
} from './articles'
import { decodeSourceText, sourceAttributes } from './source-policy'
type Tree = { tag: string; attrs: Record<string, string>; children: (Tree | string)[] }
type Node = Record<string, unknown>
/** Convert only the editor-supported canonical subset; never silently lose links, images or tables. */
export function geoArticleToLexical(article: GeoArticle): News['content'] {
  const publicationLinks = geoPublicationLinks(
    article.context.optimization,
    article.context.question.term,
  )
  const attachments = publicationLinks
    .filter((link) => !article.html.includes(`href="${escapeGeoHTML(link.url)}"`))
    .map((link) => `<p><a href="${escapeGeoHTML(link.url)}">${escapeGeoHTML(link.title)}</a></p>`)
    .join('')
  const clean = cleanGeoArticleHTML(
    article.html + attachments,
    article.context.sources,
    article.context.materialGroup.images,
    publicationLinks,
  )
  if (clean.issues.length) throw new GeoError('UNSAFE_CONTENT', clean.issues.join(' '))
  const root: Tree = { tag: 'root', attrs: {}, children: [] },
    stack = [root]
  let offset = 0
  for (const m of clean.html.matchAll(/<\/?[a-zA-Z][^>]*>/gu)) {
    const text = decodeSourceText(clean.html.slice(offset, m.index))
    if (text) stack.at(-1)!.children.push(text)
    offset = m.index! + m[0].length
    const tag = m[0].match(/^<\/?([a-zA-Z0-9]+)/u)![1].toLowerCase()
    if (m[0].startsWith('</')) {
      if (stack.length < 2 || stack.at(-1)!.tag !== tag)
        throw new GeoError(
          'INVALID_HTML_STRUCTURE',
          '正文标签不完整，请在文章编辑页整理后重新保存。',
        )
      stack.pop()
    } else {
      const child: Tree = { tag, attrs: sourceAttributes(m[0]), children: [] }
      stack.at(-1)!.children.push(child)
      if (!['br', 'img'].includes(tag)) stack.push(child)
    }
  }
  const tail = decodeSourceText(clean.html.slice(offset))
  if (tail) stack.at(-1)!.children.push(tail)
  if (stack.length !== 1)
    throw new GeoError('INVALID_HTML_STRUCTURE', '正文标签未闭合，请重新保存文章。')
  const element = (type: string, children: Node[], extra: object = {}): Node => ({
    type,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children,
    ...extra,
  })
  const mergeStyles = (...values: string[]) => {
    const styles = new Map<string, string>()
    for (const value of values)
      for (const declaration of value.split(';')) {
        const separator = declaration.indexOf(':')
        if (separator < 0) continue
        const property = declaration.slice(0, separator).trim()
        const content = declaration.slice(separator + 1).trim()
        if (property && content) styles.set(property, content)
      }
    return [...styles].map(([property, content]) => `${property}:${content}`).join(';')
  }
  const blockFormat = (style: string) =>
    style.match(/(?:^|;)text-align:(left|center|right|justify)(?:;|$)/u)?.[1] || ''
  const asBlocks = (nodes: Node[], format = '') => {
    const blocks: Node[] = []
    let inline: Node[] = []
    const flush = () => {
      if (inline.length) blocks.push(element('paragraph', inline, { format }))
      inline = []
    }
    for (const node of nodes) {
      if (['text', 'link', 'linebreak'].includes(String(node.type))) inline.push(node)
      else {
        flush()
        blocks.push(node)
      }
    }
    flush()
    return blocks
  }
  const walk = (value: Tree | string, format = 0, inheritedStyle = ''): Node[] => {
    if (typeof value === 'string')
      return value
        ? [
            {
              type: 'text',
              version: 1,
              text: value,
              detail: 0,
              format,
              mode: 'normal',
              style: inheritedStyle,
            },
          ]
        : []
    const tag = value.tag
    const ownStyle = value.attrs.style || ''
    const textStyle = mergeStyles(inheritedStyle, ownStyle)
    if (['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del'].includes(tag))
      return value.children.flatMap((c) =>
        walk(
          c,
          format |
            (['b', 'strong'].includes(tag)
              ? 1
              : ['i', 'em'].includes(tag)
                ? 2
                : ['s', 'strike', 'del'].includes(tag)
                  ? 4
                  : 8),
          textStyle,
        ),
      )
    if (tag === 'br') return [{ type: 'linebreak', version: 1 }]
    if (tag === 'img') {
      const image = article.context.materialGroup.images.find((i) => i.url === value.attrs.src)
      if (!image) throw new GeoError('INVALID_MEDIA', '配图不属于文章素材组。')
      return [
        {
          type: 'upload',
          version: 3,
          format: '',
          id: randomUUID(),
          relationTo: 'media',
          value: image.id,
          fields: {},
        },
      ]
    }
    if (tag === 'thead' || tag === 'tbody')
      return value.children.flatMap((child) => walk(child, format, textStyle))
    if (tag === 'table') {
      const rows = value.children.flatMap((child) =>
        typeof child !== 'string' && ['thead', 'tbody'].includes(child.tag)
          ? child.children.flatMap((row) => walk(row, format, textStyle))
          : walk(child, format, textStyle),
      )
      if (rows.some((row) => row.type !== 'tablerow'))
        throw new GeoError('INVALID_HTML_STRUCTURE', '表格中存在无效行，请重新整理表格。')
      return [
        element('table', rows, {
          colWidths: null,
          frozenColumnCount: 0,
          frozenRowCount: 0,
          rowStriping: false,
        }),
      ]
    }
    if (tag === 'tr') {
      const cells = value.children.flatMap((cell) => walk(cell, format, textStyle))
      if (cells.some((cell) => cell.type !== 'tablecell'))
        throw new GeoError('INVALID_HTML_STRUCTURE', '表格行中存在无效单元格。')
      return [element('tablerow', cells, { height: null })]
    }
    if (tag === 'td' || tag === 'th') {
      const cellStyle = mergeStyles(textStyle, ownStyle)
      const children = value.children.flatMap((child) => walk(child, format, cellStyle))
      return [
        element('tablecell', asBlocks(children, blockFormat(ownStyle)), {
          backgroundColor: null,
          colSpan: 1,
          headerState: tag === 'th' ? 1 : 0,
          rowSpan: 1,
          width: null,
        }),
      ]
    }
    const children = value.children.flatMap((c) => walk(c, format, textStyle))
    if (tag === 'a') {
      if (children.some((c) => !['text', 'link', 'linebreak'].includes(String(c.type))))
        throw new GeoError(
          'INVALID_HTML_STRUCTURE',
          '引用链接内不能包含图片或段落，请整理文章格式。',
        )
      if (
        ![...article.context.sources, ...publicationLinks].some((s) => s.url === value.attrs.href)
      )
        throw new GeoError('INVALID_REFERENCE', '引用不属于文章来源。')
      return [
        element('link', children, {
          fields: { linkType: 'custom', url: value.attrs.href, newTab: true },
        }),
      ]
    }
    if (tag === 'span' || tag === 'font' || tag === 'root') return children
    if (/^h[1-5]$/u.test(tag)) {
      if (children.some((c) => !['text', 'link', 'linebreak'].includes(String(c.type))))
        throw new GeoError('INVALID_HTML_STRUCTURE', '标题中不能嵌套图片或段落。')
      return [element('heading', children, { tag, format: blockFormat(ownStyle) })]
    }
    if (tag === 'ul' || tag === 'ol') {
      const entries = children.filter((c) => !(c.type === 'text' && !String(c.text).trim()))
      if (entries.some((c) => c.type !== 'listitem'))
        throw new GeoError('INVALID_HTML_STRUCTURE', '列表中存在未归入条目的正文，请整理列表。')
      return [
        element(
          'list',
          entries.map((c, i) => (c.type === 'listitem' ? { ...c, value: i + 1 } : c)),
          { tag, listType: tag === 'ol' ? 'number' : 'bullet', start: 1 },
        ),
      ]
    }
    if (tag === 'li') return [element('listitem', children, { value: 1 })]
    if (tag === 'blockquote') return [element('quote', children)]
    return asBlocks(children, blockFormat(ownStyle))
  }
  const children: Node[] = []
  let inline: Node[] = []
  for (const n of walk(root)) {
    if (['text', 'link', 'linebreak'].includes(String(n.type))) inline.push(n)
    else {
      if (inline.some((c) => c.type !== 'text' || String(c.text).trim()))
        children.push(element('paragraph', inline))
      inline = []
      children.push(n)
    }
  }
  if (inline.some((c) => c.type !== 'text' || String(c.text).trim()))
    children.push(element('paragraph', inline))
  return { root: element('root', children) } as News['content']
}
