import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { GeoError } from '../geo/keywords'
import { normalizeKnowledgeText } from './text'
export const knowledgeExtensions = ['docx', 'txt', 'md', 'xlsx', 'csv']
export async function parseKnowledgeFile(filename: string, buffer: Buffer): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (!knowledgeExtensions.includes(ext))
    throw new GeoError('INVALID_FILE', '支持 DOCX、TXT、Markdown、XLSX 和 CSV 文件。', 415)
  let text = ''
  try {
    if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (ext === 'xlsx') {
      const { default: readExcel } = await import('read-excel-file/node')
      const sheets = await readExcel(buffer)
      text = sheets
        .map(
          (sheet) =>
            `# ${sheet.sheet}\n\n${sheet.data.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? ''))).join(' | ')).join('\n')}`,
        )
        .join('\n\n')
    } else {
      text = new TextDecoder('utf-8').decode(buffer)
      if ((text.match(/\ufffd/g)?.length || 0) > text.length * 0.01)
        text = new TextDecoder('gb18030').decode(buffer)
    }
  } catch (error) {
    if (error instanceof GeoError) throw error
    if (process.env.NODE_ENV === 'development')
      await appendFile(
        path.resolve(process.cwd(), '.codex-runtime/knowledge-parser.log'),
        JSON.stringify({
          at: new Date().toISOString(),
          format: ext,
          error: error instanceof Error ? error.message : 'UNKNOWN',
        }) + '\n',
        { mode: 0o600 },
      ).catch(() => {})
    console.error(
      '[knowledge-parser]',
      error instanceof Error ? `${error.name}: ${error.message}` : 'UNKNOWN',
    )
    throw new GeoError(
      'PARSE_FAILED',
      '文件解析失败，请检查文件是否损坏或加密；可转换为TXT后重试。',
      422,
    )
  }
  text = normalizeKnowledgeText(text)
  if (!text.replace(/^#.*$/gm, '').trim())
    throw new GeoError('EMPTY_DOCUMENT', '未识别到可检索文字，请上传包含正文的资料文件。', 422)
  return text
}
