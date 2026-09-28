const allowedTags = new Set([
  'a',
  'b',
  'br',
  'del',
  'div',
  'em',
  'font',
  'h2',
  'h3',
  'i',
  'img',
  'li',
  'ol',
  'p',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const safeMediaSource = (value: string) => /^\/api\/media\/file\/(?:[a-zA-Z0-9._~-]|%[0-9a-f]{2})+$/i.test(value)
const safeLink = (value: string) => /^(https?:\/\/|mailto:|\/)(?!\/)/i.test(value)

export const sanitizeRichHTML = (input: string) =>
  input
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|iframe|object)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (tag, rawName: string) => {
      const name = rawName.toLowerCase()
      if (!allowedTags.has(name)) return ''
      if (tag.startsWith('</')) return `</${name}>`
      if (name === 'img') {
        const source = tag.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] || ''
        const alt = tag.match(/alt\s*=\s*["']([^"']*)["']/i)?.[1]?.replace(/[<>&"']/g, '') || ''
        return safeMediaSource(source) ? `<img src="${source}" alt="${alt}">` : ''
      }
      if (name === 'a') {
        const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || ''
        const target = tag.match(/target\s*=\s*["'](_blank)["']/i)?.[1] || ''
        return safeLink(href) ? `<a href="${href.replace(/[<>&"']/g, '')}"${target ? ' target="_blank" rel="noopener noreferrer"' : ''}>` : '<a>'
      }
      const styles = (tag.match(/style\s*=\s*["']([^"']*)["']/i)?.[1] || '')
        .split(';')
        .map((item) => item.trim().replace(/^color:\s*rgb\(37,\s*99,\s*235\)$/i, 'color:#2563eb'))
        .filter((item) =>
          /^(color:\s*#[0-9a-f]{3,8}|font-size:\s*(14|16|20)px|text-align:\s*(left|center|right|justify))$/i.test(
            item,
          ),
        )
      const color = tag.match(/color\s*=\s*["']?(#[0-9a-f]{3,8})["']?/i)?.[1]
      const size = tag.match(/size\s*=\s*["']?([1-7])["']?/i)?.[1]
      if (color) styles.push(`color:${color}`)
      if (size) styles.push(`font-size:${size === '5' ? '20' : size === '3' ? '16' : '14'}px`)
      return `<${name}${styles.length ? ` style="${styles.join(';')}"` : ''}>`
    })
