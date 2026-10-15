import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function richTextToHTML(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isObject(value) || !isObject(value.root)) return ''
  try {
    return convertLexicalToHTML({ data: value as never, disableContainer: true })
  } catch {
    return ''
  }
}

export function richTextToPlainText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!isObject(value)) return ''

  const visit = (node: unknown): string => {
    if (!isObject(node)) return ''
    if (typeof node.text === 'string') return node.text
    if (node.type === 'linebreak') return '\n'
    const children = Array.isArray(node.children) ? node.children : []
    const text = children.map(visit).join('')
    if (!text) return ''
    return ['paragraph', 'heading', 'quote', 'listitem'].includes(String(node.type))
      ? `${text}\n`
      : text
  }

  const root = isObject(value.root) ? value.root : value
  return visit(root).replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
